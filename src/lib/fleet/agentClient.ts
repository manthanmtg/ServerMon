import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as si from 'systeminformation';
import { spawn as realSpawn } from 'node:child_process';
import { ensureBinary } from './binary';
import { startFrpc, type FrpHandle } from './frpProcess';
import { renderFrpcToml } from './toml';
import { AgentPtyBridge } from './agentPtyBridge';
import { executeScript, type ScriptExecutionConfig } from '../endpoints/script-executor';
import type { ExecutionInput } from '../endpoints/types';
import { collectServerMonStatus, type ServerMonStatus } from './servermonStatus';
import { buildInstallServerMonCommand, redactServerMonInstallText } from './servermonAgentCommands';
import { buildAgentUpdateShell, parseAgentUpdateShellOptions } from './agentUpdateCommand';

export interface AgentClientLogEntry {
  level: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentClientOpts {
  hubUrl: string;
  pairingToken: string;
  nodeId: string;
  binaryCacheDir?: string;
  configDir?: string;
  ptyListenPort?: number;
  heartbeatIntervalMs?: number;
  hubRequestTimeoutMs?: number;
  binaryVersion?: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof realSpawn;
  writeFile?: (p: string, data: string) => Promise<void>;
  mkdir?: (p: string, opts?: { recursive: boolean }) => Promise<void>;
  ensureBinaryImpl?: typeof ensureBinary;
  startFrpcImpl?: typeof startFrpc;
  ptyBridgeFactory?: (port: number, token: string) => AgentPtyBridge;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  logEntry?: (e: AgentClientLogEntry) => void;
  now?: () => Date;
}

export interface AgentStatus {
  paired: boolean;
  tunnelStatus:
    | 'connected'
    | 'reconnecting'
    | 'disconnected'
    | 'auth_failed'
    | 'config_invalid'
    | 'proxy_conflict'
    | 'unsupported_config';
  frpcPid?: number;
  bridgeRunning: boolean;
  lastHeartbeatAt?: Date;
  lastError?: string;
}

interface PairResponse {
  hub: {
    serverAddr: string;
    serverPort: number;
    authToken: string;
    subdomainHost: string | null;
  };
}

interface NodeConfigResponse {
  slug: string;
  frpcConfig: Parameters<typeof renderFrpcToml>[0]['node']['frpcConfig'];
  proxyRules: Parameters<typeof renderFrpcToml>[0]['node']['proxyRules'];
  capabilities?: Parameters<typeof renderFrpcToml>[0]['node']['capabilities'];
}

interface AgentCommand {
  id: string;
  command: string;
  args?: unknown;
}

interface InstallServerMonCommandArgs {
  mongoUri?: unknown;
  port?: unknown;
  skipMongo?: unknown;
  allowRoot?: unknown;
  installMode?: unknown;
  versionTarget?: unknown;
  releaseBaseUrl?: unknown;
  sourceRef?: unknown;
}

interface EndpointRunArgs {
  endpointId?: string;
  endpointSlug?: string;
  scriptLang: ScriptExecutionConfig['scriptLang'];
  scriptContent: string;
  timeout?: number;
  envVars?: Record<string, string>;
  payload?: unknown;
  method?: string;
}

function unwrapNodeConfig(
  data: NodeConfigResponse | { node?: NodeConfigResponse }
): NodeConfigResponse {
  if ('node' in data && data.node) return data.node;
  return data as NodeConfigResponse;
}

const DEFAULT_BINARY_CACHE_DIR = '.fleet-cache/frp';
const DEFAULT_CONFIG_DIR = '.fleet-cache/agent';
const DEFAULT_PTY_LISTEN_PORT = 8918;
const DEFAULT_SERVERMON_PORT = 8912;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HUB_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_BINARY_VERSION = 'latest';

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException ||
    (err instanceof Error && (err.name === 'AbortError' || err.message === 'AbortError'))
  );
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchHubWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const timeout = Math.max(1, timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(`hub-request-timeout: ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class AgentClient {
  private readonly opts: AgentClientOpts;
  private readonly status_: AgentStatus = {
    paired: false,
    tunnelStatus: 'disconnected',
    bridgeRunning: false,
  };
  private frpHandle: FrpHandle | null = null;
  private bridge: AgentPtyBridge | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private bootId: string = crypto.randomUUID();
  private bootAt: Date = new Date();
  private ptyToken: string = '';
  private pairResponse: PairResponse | null = null;
  private nodeConfig: NodeConfigResponse | null = null;
  private activeProxies = new Map<string, { status: string; lastError?: string }>();
  private capabilities: Parameters<typeof renderFrpcToml>[0]['node']['capabilities'] = {
    terminal: true,
    endpointRuns: true,
    processes: true,
    metrics: true,
    publishRoutes: true,
    tcpForward: true,
    fileOps: false,
    updates: true,
  };

  constructor(opts: AgentClientOpts) {
    this.opts = opts;
    if (opts.now) {
      this.bootAt = opts.now();
    }
  }

  status(): AgentStatus {
    return { ...this.status_ };
  }

  async start(): Promise<void> {
    const {
      hubUrl,
      pairingToken,
      nodeId,
      fetchImpl = fetch,
      writeFile = async (p, d) => fs.promises.writeFile(p, d, 'utf8'),
      mkdir = async (p, o) => {
        await fs.promises.mkdir(p, o);
      },
      ensureBinaryImpl = ensureBinary,
      startFrpcImpl = startFrpc,
      ptyBridgeFactory,
      setIntervalImpl = setInterval,
      binaryCacheDir = DEFAULT_BINARY_CACHE_DIR,
      configDir = DEFAULT_CONFIG_DIR,
      ptyListenPort = DEFAULT_PTY_LISTEN_PORT,
      heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
      hubRequestTimeoutMs = DEFAULT_HUB_REQUEST_TIMEOUT_MS,
      binaryVersion = DEFAULT_BINARY_VERSION,
      spawnImpl,
    } = this.opts;

    // 0. Cleanup orphaned processes
    await this.killZombies(ptyListenPort);

    // 1. Pair
    const pairUrl = `${hubUrl}/api/fleet/nodes/${nodeId}/pair`;
    let pairRes: Response;
    try {
      pairRes = await fetchHubWithTimeout(
        fetchImpl,
        pairUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pairingToken}`,
            'Content-Type': 'application/json',
          },
        },
        hubRequestTimeoutMs
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status_.lastError = `pair-error: ${message}`;
      throw err;
    }
    if (!pairRes.ok) {
      this.status_.tunnelStatus = 'auth_failed';
      this.status_.lastError = `pair-failed: ${pairRes.status}`;
      throw new Error(`pair-failed: ${pairRes.status}`);
    }
    const pairData = await safeJson<PairResponse>(pairRes);
    if (!pairData || !pairData.hub) {
      this.status_.tunnelStatus = 'auth_failed';
      this.status_.lastError = 'pair-failed: invalid-payload';
      throw new Error('pair-failed: invalid-payload');
    }
    this.pairResponse = pairData;
    this.status_.paired = true;
    this.activeProxies.clear();

    // 2. Fetch node config
    const nodeUrl = `${hubUrl}/api/fleet/nodes/${nodeId}`;
    let nodeRes: Response;
    try {
      nodeRes = await fetchHubWithTimeout(
        fetchImpl,
        nodeUrl,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pairingToken}`,
          },
        },
        hubRequestTimeoutMs
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status_.tunnelStatus = 'config_invalid';
      this.status_.lastError = `node-fetch-error: ${message}`;
      throw err;
    }
    if (!nodeRes.ok) {
      this.status_.tunnelStatus = 'config_invalid';
      this.status_.lastError = `node-fetch-failed: ${nodeRes.status}`;
      throw new Error(`node-fetch-failed: ${nodeRes.status}`);
    }
    const data = await safeJson<NodeConfigResponse | { node?: NodeConfigResponse }>(nodeRes);
    if (!data) {
      this.status_.tunnelStatus = 'config_invalid';
      this.status_.lastError = 'node-fetch-failed: invalid-payload';
      throw new Error('node-fetch-failed: invalid-payload');
    }
    this.nodeConfig = unwrapNodeConfig(data);

    // 3. Ensure frpc binary
    const binaries = await ensureBinaryImpl({
      cacheDir: binaryCacheDir,
      version: binaryVersion,
      fetchImpl,
      spawnImpl,
    });

    // 4. Render frpc.toml
    const rendered = renderFrpcToml({
      serverAddr: this.pairResponse.hub.serverAddr,
      serverPort: this.pairResponse.hub.serverPort,
      authToken: this.pairResponse.hub.authToken,
      node: {
        slug: this.nodeConfig.slug ?? nodeId,
        frpcConfig: this.nodeConfig.frpcConfig,
        proxyRules: this.nodeConfig.proxyRules,
        capabilities: this.nodeConfig.capabilities ?? this.capabilities,
      },
    });

    // 5. Ensure config dir + write toml
    await mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, 'frpc.toml');
    await writeFile(configPath, rendered);

    // 6. Start frpc
    this.status_.tunnelStatus = 'reconnecting';
    try {
      this.frpHandle = startFrpcImpl({
        binary: binaries.frpc,
        configPath,
        spawnImpl,
        onLog: (line) => {
          this.log('info', 'agent.frpc.log', line);

          // Strip ANSI color codes so we can read the clean text
          const cleanLine = line.replace(/\u001b\[[0-9;]*[mGKH]/g, '').toLowerCase();

          if (
            cleanLine.includes('login to server success') ||
            cleanLine.includes('start proxy success')
          ) {
            if (this.status_.tunnelStatus !== 'connected') {
              this.status_.tunnelStatus = 'connected';
              this.log('info', 'agent.tunnel.connected', 'FRP tunnel established');
              void this.sendHeartbeat();
            }

            const match = cleanLine.match(/\[([^\]]+)\] start proxy success/);
            if (match) {
              this.activeProxies.set(match[1], { status: 'active' });
              void this.sendHeartbeat(); // report this specific proxy immediately
            }
          }
          if (
            cleanLine.includes('work connection closed') ||
            cleanLine.includes('login to server failed')
          ) {
            this.status_.tunnelStatus = 'reconnecting';
            for (const key of this.activeProxies.keys()) {
              this.activeProxies.set(key, { status: 'disabled' });
            }
          }
          const errMatch = cleanLine.match(/\[([^\]]+)\] start proxy error: (.+)/);
          if (errMatch) {
            this.activeProxies.set(errMatch[1], { status: 'error', lastError: errMatch[2] });
            void this.sendHeartbeat();
          }
        },
      });
      if (this.frpHandle.pid) {
        this.status_.frpcPid = this.frpHandle.pid;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status_.tunnelStatus = 'config_invalid';
      this.status_.lastError = message;
      throw err;
    }

    // 7. Start pty bridge with random auth token
    this.ptyToken = crypto.randomBytes(32).toString('hex');
    const factory =
      ptyBridgeFactory ??
      ((port: number, token: string): AgentPtyBridge =>
        new AgentPtyBridge({ port, authToken: token }));
    this.bridge = factory(ptyListenPort, this.ptyToken);
    await this.bridge.start();
    this.status_.bridgeRunning = true;

    // 8. Heartbeat loop
    this.heartbeatTimer = setIntervalImpl(() => this.sendHeartbeat(), heartbeatIntervalMs);

    // Fire an initial heartbeat in the background; do not await start() on it.
    void this.sendHeartbeat();
  }

  async stop(): Promise<void> {
    const clearIntervalImplLocal = this.opts.clearIntervalImpl ?? clearInterval;
    if (this.heartbeatTimer) {
      clearIntervalImplLocal(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.frpHandle) {
      try {
        await this.frpHandle.kill();
      } catch {
        // swallow
      }
      this.frpHandle = null;
    }
    if (this.bridge) {
      try {
        await this.bridge.stop();
      } catch {
        // swallow
      }
      this.bridge = null;
    }
    this.status_.bridgeRunning = false;
    this.status_.tunnelStatus = 'disconnected';
  }

  private async sendHeartbeat(): Promise<void> {
    const {
      hubUrl,
      pairingToken,
      nodeId,
      fetchImpl = fetch,
      hubRequestTimeoutMs = DEFAULT_HUB_REQUEST_TIMEOUT_MS,
    } = this.opts;
    const url = `${hubUrl}/api/fleet/nodes/${nodeId}/heartbeat`;
    const nowDate = (this.opts.now ?? (() => new Date()))();

    let cpuLoad = 0;
    let ramUsed = 0;
    try {
      const load = await si.currentLoad();
      const mem = await si.mem();
      cpuLoad = load.currentLoad;
      ramUsed = mem.active;
    } catch {
      // ignore collection errors
    }

    let servermon: ServerMonStatus | undefined;
    try {
      servermon = await collectServerMonStatus({
        spawnImpl: this.opts.spawnImpl ?? realSpawn,
        fetchImpl,
        now: this.opts.now,
      });
    } catch {
      servermon = undefined;
    }

    const body = {
      nodeId,
      bootId: this.bootId,
      bootAt: this.bootAt.toISOString(),
      agentVersion: '0.0.0',
      frpcVersion: this.opts.binaryVersion ?? DEFAULT_BINARY_VERSION,
      hardware: {
        cpuCount: os.cpus().length,
        arch: os.arch(),
        osDistro: os.platform(),
        totalRam: os.totalmem(),
      },
      metrics: {
        uptime: os.uptime(),
        cpuLoad,
        ramUsed,
      },
      tunnel: {
        status: this.status_.tunnelStatus,
        connectedSince: this.bootAt.toISOString(),
      },
      proxies: (() => {
        const p = Array.from(this.activeProxies.entries()).map(([name, s]) => ({
          name,
          status: s.status,
          lastError: s.lastError,
        }));
        this.log(
          'debug',
          'agent.heartbeat.sending',
          `Agent sending ${p.length} proxies in heartbeat: ${JSON.stringify(p.map((x) => x.name))}`
        );
        return p;
      })(),
      capabilities: this.capabilities,
      // Phase 2 simplification: include pty bridge auth token so the hub
      // can dial the local bridge when a user opens a terminal session.
      ptyBridge: {
        port: this.opts.ptyListenPort ?? DEFAULT_PTY_LISTEN_PORT,
        authToken: this.ptyToken,
      },
      servermon,
    };

    try {
      const res = await fetchHubWithTimeout(
        fetchImpl,
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pairingToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        hubRequestTimeoutMs
      );
      if (res.ok) {
        this.status_.lastHeartbeatAt = nowDate;
        const data = await safeJson<{ commands?: AgentCommand[] }>(res);
        if (data && Array.isArray(data.commands) && data.commands.length > 0) {
          for (const cmd of data.commands) {
            void this.handleCommand(cmd);
          }
        }
      } else {
        this.status_.lastError = `heartbeat-failed: ${res.status}`;
        console.error(`[ERROR] [heartbeat] Heartbeat failed with status ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.status_.lastError = `heartbeat-error: ${message}`;
      console.error(`[ERROR] [heartbeat] Heartbeat error: ${message}`);
    }
  }

  private async handleCommand(cmd: AgentCommand): Promise<void> {
    if (!cmd || typeof cmd !== 'object' || !cmd.command) {
      this.log('error', 'agent.command.invalid', 'Received invalid command payload');
      return;
    }

    this.log('info', 'agent.command.received', `Received remote command: ${cmd.command}`, {
      commandId: cmd.id,
    });

    if (cmd.command === 'update') {
      this.log('info', 'agent.update.starting', 'Executing remote update...');
      const spawn = this.opts.spawnImpl ?? realSpawn;
      const updateCmd = buildAgentUpdateShell(parseAgentUpdateShellOptions(cmd.args));

      const child = spawn('bash', ['-c', updateCmd], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }

    if (cmd.command === 'install-servermon') {
      void this.handleInstallServerMon(cmd.id, cmd.args);
    }

    if (cmd.command === 'servermon-recheck') {
      void this.sendHeartbeat();
    }

    if (cmd.command === 'servermon-restart') {
      void this.runServerMonRestart(cmd.id);
    }

    if (cmd.command === 'endpoint-run') {
      void this.handleEndpointRun(cmd.id, cmd.args);
    }

    if (cmd.command === 'reconcile') {
      void this.syncConfig();
    }
  }

  private async handleInstallServerMon(commandId: string, args: unknown): Promise<void> {
    const installArgs = (
      args && typeof args === 'object' ? args : {}
    ) as InstallServerMonCommandArgs;
    const mongoUri = typeof installArgs.mongoUri === 'string' ? installArgs.mongoUri : '';
    const port = typeof installArgs.port === 'number' ? installArgs.port : DEFAULT_SERVERMON_PORT;
    const skipMongo = installArgs.skipMongo !== false;
    const allowRoot = installArgs.allowRoot !== false;
    const installMode = installArgs.installMode === 'source' ? 'source' : 'release';
    const versionTarget =
      typeof installArgs.versionTarget === 'string' && installArgs.versionTarget.trim()
        ? installArgs.versionTarget.trim()
        : 'latest';
    const releaseBaseUrl =
      typeof installArgs.releaseBaseUrl === 'string' && installArgs.releaseBaseUrl.trim()
        ? installArgs.releaseBaseUrl.trim()
        : undefined;
    const sourceRef =
      typeof installArgs.sourceRef === 'string' && installArgs.sourceRef.trim()
        ? installArgs.sourceRef.trim()
        : 'main';

    if (!mongoUri) {
      this.log('error', 'servermon.install.failed', 'ServerMon install missing MongoDB URI', {
        commandId,
      });
      return;
    }

    const [command, commandArgs] = buildInstallServerMonCommand({
      mongoUri,
      port,
      skipMongo,
      allowRoot,
      installMode,
      versionTarget,
      releaseBaseUrl,
      sourceRef,
    });
    this.log('info', 'servermon.install.starting', 'Starting ServerMon install', {
      commandId,
      port,
      skipMongo,
      allowRoot,
      installMode,
      versionTarget: installMode === 'release' ? versionTarget : undefined,
      sourceRef: installMode === 'source' ? sourceRef : undefined,
    });

    const spawn = this.opts.spawnImpl ?? realSpawn;
    await new Promise<void>((resolve) => {
      let child: ReturnType<typeof realSpawn>;
      try {
        child = spawn(command, commandArgs, {
          env: {
            ...process.env,
            SERVERMON_INSTALL_MONGO_URI: mongoUri,
            SERVERMON_INSTALL_PORT: String(port),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log('error', 'servermon.install.failed', `ServerMon install failed: ${message}`, {
          commandId,
          error: message,
        });
        resolve();
        return;
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        const message = redactServerMonInstallText(chunk.toString(), mongoUri).trim();
        if (message) this.log('info', 'servermon.install.log', message, { commandId });
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const message = redactServerMonInstallText(chunk.toString(), mongoUri).trim();
        if (message) this.log('warn', 'servermon.install.log', message, { commandId });
      });
      child.on('close', (code) => {
        const ok = code === 0;
        this.log(
          ok ? 'info' : 'error',
          ok ? 'servermon.install.succeeded' : 'servermon.install.failed',
          ok ? 'ServerMon install completed' : `ServerMon install exited with code ${code}`,
          { commandId, exitCode: code }
        );
        void this.sendHeartbeat();
        resolve();
      });
      child.on('error', (err) => {
        this.log('error', 'servermon.install.failed', `ServerMon install failed: ${err.message}`, {
          commandId,
          error: err.message,
        });
        void this.sendHeartbeat();
        resolve();
      });
    });
  }

  private async runServerMonRestart(commandId: string): Promise<void> {
    const spawn = this.opts.spawnImpl ?? realSpawn;
    await new Promise<void>((resolve) => {
      const child = spawn('systemctl', ['restart', 'servermon'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        this.log(
          code === 0 ? 'info' : 'error',
          code === 0 ? 'servermon.restart.succeeded' : 'servermon.restart.failed',
          code === 0 ? 'ServerMon restarted' : `ServerMon restart failed: ${stderr.trim()}`,
          { commandId, exitCode: code }
        );
        void this.sendHeartbeat();
        resolve();
      });
      child.on('error', (err) => {
        this.log('error', 'servermon.restart.failed', `ServerMon restart failed: ${err.message}`, {
          commandId,
          error: err.message,
        });
        void this.sendHeartbeat();
        resolve();
      });
    });
  }

  /**
   * Syncs node configuration from the hub and restarts frpc if needed.
   */
  public async syncConfig(): Promise<void> {
    const {
      hubUrl,
      nodeId,
      pairingToken,
      fetchImpl = fetch,
      writeFile = async (p, d) => fs.promises.writeFile(p, d, 'utf8'),
      mkdir = async (p, o) => {
        await fs.promises.mkdir(p, o);
      },
      ensureBinaryImpl = ensureBinary,
      startFrpcImpl = startFrpc,
      configDir = DEFAULT_CONFIG_DIR,
      hubRequestTimeoutMs = DEFAULT_HUB_REQUEST_TIMEOUT_MS,
    } = this.opts;

    try {
      this.log('info', 'agent.sync.starting', 'Syncing node configuration...');
      this.activeProxies.clear();

      // 1. Fetch node config
      const nodeUrl = `${hubUrl}/api/fleet/nodes/${nodeId}`;
      const nodeRes = await fetchHubWithTimeout(
        fetchImpl,
        nodeUrl,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${pairingToken}`,
          },
        },
        hubRequestTimeoutMs
      );
      if (!nodeRes.ok) {
        throw new Error(`node-fetch-failed: ${nodeRes.status}`);
      }
      const data = await safeJson<NodeConfigResponse | { node?: NodeConfigResponse }>(nodeRes);
      if (!data) {
        throw new Error('node-fetch-failed: invalid-payload');
      }
      this.nodeConfig = unwrapNodeConfig(data);

      // 2. Render frpc.toml
      if (!this.pairResponse) {
        throw new Error('agent not paired');
      }

      const rendered = renderFrpcToml({
        serverAddr: this.pairResponse.hub.serverAddr,
        serverPort: this.pairResponse.hub.serverPort,
        authToken: this.pairResponse.hub.authToken,
        node: {
          slug: this.nodeConfig.slug ?? nodeId,
          frpcConfig: this.nodeConfig.frpcConfig,
          proxyRules: this.nodeConfig.proxyRules,
          capabilities: this.nodeConfig.capabilities ?? this.capabilities,
        },
      });

      // 3. Ensure config dir + write toml
      await mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, 'frpc.toml');
      await writeFile(configPath, rendered);

      // 4. Restart frpc
      this.log('info', 'agent.frpc.restarting', 'Restarting FRP client with new configuration...');
      if (this.frpHandle) {
        this.frpHandle.kill();
      }

      // Re-ensure binaries (in case they were deleted or version changed)
      const binaries = await ensureBinaryImpl({
        cacheDir: this.opts.binaryCacheDir ?? DEFAULT_BINARY_CACHE_DIR,
        version: this.opts.binaryVersion ?? DEFAULT_BINARY_VERSION,
        fetchImpl,
        spawnImpl: this.opts.spawnImpl ?? realSpawn,
      });

      this.frpHandle = startFrpcImpl({
        binary: binaries.frpc,
        configPath,
        spawnImpl: this.opts.spawnImpl ?? realSpawn,
        onLog: (line) => {
          this.log('info', 'agent.frpc.log', line);
          const cleanLine = line.replace(/\u001b\[[0-9;]*[mGKH]/g, '').toLowerCase();

          if (
            cleanLine.includes('login to server success') ||
            cleanLine.includes('start proxy success')
          ) {
            this.status_.tunnelStatus = 'connected';

            const match = cleanLine.match(/\[([^\]]+)\] start proxy success/);
            if (match) {
              this.activeProxies.set(match[1], { status: 'active' });
            }
            void this.sendHeartbeat();
          }
          if (
            cleanLine.includes('work connection closed') ||
            cleanLine.includes('login to server failed')
          ) {
            this.status_.tunnelStatus = 'reconnecting';
            // Mark all as disabled on global tunnel failure
            for (const key of this.activeProxies.keys()) {
              this.activeProxies.set(key, { status: 'disabled' });
            }
          }
          const errMatch = cleanLine.match(/\[([^\]]+)\] start proxy error: (.+)/);
          if (errMatch) {
            this.activeProxies.set(errMatch[1], { status: 'error', lastError: errMatch[2] });
          }
        },
      });

      this.log('info', 'agent.sync.finished', 'Node configuration synced successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log('error', 'agent.sync.failed', `Configuration sync failed: ${message}`);
      console.error(`[ERROR] [sync] Configuration sync failed: ${message}`);
    }
  }

  private async handleEndpointRun(commandId: string, args: unknown): Promise<void> {
    const endpointArgs = (args && typeof args === 'object' ? args : {}) as Partial<EndpointRunArgs>;
    const {
      endpointId,
      endpointSlug,
      scriptLang,
      scriptContent,
      timeout,
      envVars,
      payload,
      method,
    } = endpointArgs;

    if (!scriptLang || !scriptContent || !endpointSlug) {
      this.log('error', 'endpoint.failed', 'Endpoint command missing required arguments', {
        commandId,
        endpointId,
        endpointSlug,
      });
      return;
    }

    this.log('info', 'agent.endpoint.starting', `Executing fleet endpoint: ${endpointSlug}`, {
      commandId,
      endpointId,
      endpointSlug,
    });

    const config: ScriptExecutionConfig = {
      scriptLang,
      scriptContent,
      timeout,
      envVars,
      slug: endpointSlug,
    };

    const input: ExecutionInput = {
      method: method || 'GET',
      body: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      headers: {
        'x-servermon-fleet-dispatch': 'true',
        'x-servermon-command-id': commandId,
      },
      query: {},
    };

    try {
      const result = await executeScript(config, input);
      const isSuccess = result.statusCode === 200;

      this.log(
        isSuccess ? 'info' : 'error',
        isSuccess ? 'endpoint.succeeded' : 'endpoint.failed',
        isSuccess
          ? `Endpoint ${endpointSlug} succeeded`
          : `Endpoint ${endpointSlug} failed: ${result.error || 'Unknown error'}`,
        {
          commandId,
          endpointId,
          endpointSlug,
          statusCode: result.statusCode,
          duration: result.duration,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error,
        }
      );

      // Force a heartbeat to report the result immediately
      void this.sendHeartbeat();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log('error', 'endpoint.failed', `Endpoint ${endpointSlug} crashed: ${message}`, {
        commandId,
        endpointId,
        endpointSlug,
        error: message,
      });
      void this.sendHeartbeat();
    }
  }

  private async killZombies(ptyPort: number): Promise<void> {
    return new Promise((resolve) => {
      const spawn = this.opts.spawnImpl ?? realSpawn;
      const cmd = `pkill -9 frpc || true; fuser -k ${ptyPort}/tcp || true`;
      const proc = spawn('bash', ['-c', cmd]);
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve());
    });
  }

  private log(
    level: string,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.opts.logEntry) return;
    try {
      this.opts.logEntry({ level, eventType, message, metadata });
    } catch {
      // swallow
    }
  }
}
