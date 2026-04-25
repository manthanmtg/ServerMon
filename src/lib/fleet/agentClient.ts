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
  capabilities?: Record<string, boolean>;
}

const DEFAULT_BINARY_CACHE_DIR = '.fleet-cache/frp';
const DEFAULT_CONFIG_DIR = '.fleet-cache/agent';
const DEFAULT_PTY_LISTEN_PORT = 8001;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_BINARY_VERSION = 'latest';


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
  private capabilities: Record<string, boolean> = {
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
      binaryVersion = DEFAULT_BINARY_VERSION,
      spawnImpl,
    } = this.opts;

    // 0. Cleanup orphaned processes
    await this.killZombies(ptyListenPort);

    // 1. Pair
    const pairUrl = `${hubUrl}/api/fleet/nodes/${nodeId}/pair`;
    const pairRes = await fetchImpl(pairUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pairingToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!pairRes.ok) {
      this.status_.tunnelStatus = 'auth_failed';
      this.status_.lastError = `pair-failed: ${pairRes.status}`;
      throw new Error(`pair-failed: ${pairRes.status}`);
    }
    this.pairResponse = (await pairRes.json()) as PairResponse;
    this.status_.paired = true;

    // 2. Fetch node config
    const nodeUrl = `${hubUrl}/api/fleet/nodes/${nodeId}`;
    const nodeRes = await fetchImpl(nodeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${pairingToken}`,
      },
    });
    if (!nodeRes.ok) {
      this.status_.tunnelStatus = 'config_invalid';
      this.status_.lastError = `node-fetch-failed: ${nodeRes.status}`;
      throw new Error(`node-fetch-failed: ${nodeRes.status}`);
    }
    const data = (await nodeRes.json()) as { node: NodeConfigResponse };
    this.nodeConfig = data.node;

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
          
          if (cleanLine.includes('login to server success') || cleanLine.includes('start proxy success')) {
            if (this.status_.tunnelStatus !== 'connected') {
              this.status_.tunnelStatus = 'connected';
              this.log('info', 'agent.tunnel.connected', 'FRP tunnel established');
              console.log('[INFO] [tunnel] Connection established successfully');
              // Send an out-of-band heartbeat right now so the hub flips
              // the node from "connecting/degraded" to "online" immediately
              // instead of waiting for the next heartbeat tick (~30s).
              void this.sendHeartbeat();
            }
          }
          if (cleanLine.includes('work connection closed') || cleanLine.includes('login to server failed')) {
            this.status_.tunnelStatus = 'reconnecting';
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
    this.heartbeatTimer = setIntervalImpl(() => {
      void this.sendHeartbeat();
    }, heartbeatIntervalMs);

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
    const { hubUrl, pairingToken, nodeId, fetchImpl = fetch } = this.opts;
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
      proxies: [],
      capabilities: this.capabilities,
      // Phase 2 simplification: include pty bridge auth token so the hub
      // can dial the local bridge when a user opens a terminal session.
      ptyBridge: {
        port: this.opts.ptyListenPort ?? DEFAULT_PTY_LISTEN_PORT,
        authToken: this.ptyToken,
      },
    };

    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pairingToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        this.status_.lastHeartbeatAt = nowDate;
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.commands) && data.commands.length > 0) {
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

  private async handleCommand(cmd: { id: string; command: string; args?: any }): Promise<void> {
    this.log('info', 'agent.command.received', `Received remote command: ${cmd.command}`, {
      commandId: cmd.id,
    });

    if (cmd.command === 'update') {
      this.log('info', 'agent.update.starting', 'Executing remote update...');
      const spawn = this.opts.spawnImpl ?? realSpawn;
      
      const updateCmd = [
        'export PATH=$PATH:/usr/local/bin:/usr/bin:/bin',
        'cd /opt/servermon-agent/source',
        'git reset --hard origin/main',
        'git pull',
        'rm -rf .next',
        'pnpm install',
        'pnpm build',
        'systemctl restart servermon-agent'
      ].join(' && ');

      const child = spawn('bash', ['-c', updateCmd], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }

    if (cmd.command === 'endpoint-run') {
      void this.handleEndpointRun(cmd.id, cmd.args);
    }

    if (cmd.command === 'reconcile') {
      void this.syncConfig();
    }
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
      binaryCacheDir = DEFAULT_BINARY_CACHE_DIR,
      configDir = DEFAULT_CONFIG_DIR,
      binaryVersion = DEFAULT_BINARY_VERSION,
      spawnImpl = realSpawn,
    } = this.opts;

    try {
      this.log('info', 'agent.sync.starting', 'Syncing node configuration...');
      
      // 1. Fetch node config
      const nodeUrl = `${hubUrl}/api/fleet/nodes/${nodeId}`;
      const nodeRes = await fetchImpl(nodeUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${pairingToken}`,
        },
      });
      if (!nodeRes.ok) {
        throw new Error(`node-fetch-failed: ${nodeRes.status}`);
      }
      const data = (await nodeRes.json()) as { node: NodeConfigResponse };
      this.nodeConfig = data.node;

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
          if (cleanLine.includes('login to server success') || cleanLine.includes('start proxy success')) {
            this.status_.tunnelStatus = 'connected';
            void this.sendHeartbeat();
          }
          if (cleanLine.includes('work connection closed') || cleanLine.includes('login to server failed')) {
            this.status_.tunnelStatus = 'reconnecting';
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

  private async handleEndpointRun(commandId: string, args: any): Promise<void> {
    const { endpointId, endpointSlug, scriptLang, scriptContent, timeout, envVars, payload, method } = args;

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

      this.log(isSuccess ? 'info' : 'error', isSuccess ? 'endpoint.succeeded' : 'endpoint.failed', 
        isSuccess ? `Endpoint ${endpointSlug} succeeded` : `Endpoint ${endpointSlug} failed: ${result.error || 'Unknown error'}`, 
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
