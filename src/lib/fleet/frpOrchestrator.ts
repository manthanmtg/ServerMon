import path from 'node:path';
import fs from 'node:fs';
import type { ServiceState } from './enums';
import { ensureBinary } from './binary';
import { startFrps, type FrpHandle } from './frpProcess';
import { renderFrpsToml, hashToml } from './toml';

export interface FrpOrchestratorLogEntry {
  level: 'info' | 'warn' | 'error';
  service: 'frps';
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface FrpServerStateLike {
  enabled: boolean;
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  subdomainHost?: string;
  authTokenHash?: string;
  generatedConfigHash?: string;
  configVersion?: number;
}

export interface FrpOrchestratorDeps {
  FrpServerState: {
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => Promise<unknown> | unknown;
    findOne: (filter: Record<string, unknown>) => {
      lean: () => Promise<FrpServerStateLike | null> | FrpServerStateLike | null;
    };
  };
  FleetLogEvent: {
    create: (doc: Record<string, unknown>) => Promise<unknown> | unknown;
  };
  ensureBinaryImpl?: typeof ensureBinary;
  startFrpsImpl?: typeof startFrps;
  writeFile?: (p: string, data: string) => Promise<void>;
  mkdir?: (p: string, opts?: { recursive: boolean }) => Promise<void>;
  logEntry?: (entry: FrpOrchestratorLogEntry) => Promise<void> | void;
  binaryVersion?: string;
  binaryCacheDir?: string;
  configDir?: string;
  reconcileIntervalMs?: number;
  now?: () => Date;
}

export interface FrpCurrentState {
  runtimeState: ServiceState;
  pid?: number;
  configHash?: string;
  lastError?: string;
}

export interface FrpReconcileResult {
  action: 'none' | 'started' | 'stopped' | 'restarted' | 'error';
  detail?: string;
}

const DEFAULT_RECONCILE_INTERVAL_MS = 15_000;
const DEFAULT_BINARY_VERSION = 'latest';

function buildRenderedToml(state: FrpServerStateLike): string {
  const authToken = process.env.FLEET_HUB_AUTH_TOKEN ?? state.authTokenHash ?? 'pending';
  return renderFrpsToml({
    bindPort: state.bindPort,
    vhostHttpPort: state.vhostHttpPort,
    vhostHttpsPort: state.vhostHttpsPort,
    authToken,
    subdomainHost: state.subdomainHost ?? '',
  });
}

export class FrpOrchestrator {
  private readonly deps: FrpOrchestratorDeps;
  private readonly binaryVersion: string;
  private readonly binaryCacheDir: string;
  private readonly configDir: string;
  private readonly reconcileIntervalMs: number;
  private readonly writeFile: (p: string, data: string) => Promise<void>;
  private readonly mkdir: (p: string, opts?: { recursive: boolean }) => Promise<void>;
  private readonly ensureBinaryImpl: typeof ensureBinary;
  private readonly startFrpsImpl: typeof startFrps;
  private readonly now: () => Date;

  private handle: FrpHandle | null = null;
  private runtimeState: ServiceState = 'stopped';
  private pid: number | undefined = undefined;
  private configHash: string | undefined = undefined;
  private lastError: string | undefined = undefined;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(deps: FrpOrchestratorDeps) {
    this.deps = deps;
    this.binaryVersion = deps.binaryVersion ?? DEFAULT_BINARY_VERSION;
    this.binaryCacheDir = deps.binaryCacheDir ?? '/var/cache/servermon/frp';
    this.configDir = deps.configDir ?? '/etc/servermon/frp';
    this.reconcileIntervalMs = deps.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS;
    this.writeFile = deps.writeFile ?? ((p, data) => fs.promises.writeFile(p, data, 'utf8'));
    this.mkdir =
      deps.mkdir ??
      (async (p, opts) => {
        await fs.promises.mkdir(p, opts);
      });
    this.ensureBinaryImpl = deps.ensureBinaryImpl ?? ensureBinary;
    this.startFrpsImpl = deps.startFrpsImpl ?? startFrps;
    this.now = deps.now ?? (() => new Date());
  }

  currentState(): FrpCurrentState {
    return {
      runtimeState: this.runtimeState,
      pid: this.pid,
      configHash: this.configHash,
      lastError: this.lastError,
    };
  }

  async reconcileOnce(): Promise<FrpReconcileResult> {
    try {
      const state = await this.deps.FrpServerState.findOne({ key: 'global' }).lean();
      if (!state || state.enabled === false) {
        if (this.handle) {
          await this.killHandle();
          await this.updateState('stopped', { lastError: null });
          await this.emitLog('info', 'frps.stopped', 'frps stopped');
          return { action: 'stopped' };
        }
        return { action: 'none' };
      }

      // enabled === true
      const rendered = buildRenderedToml(state);
      const nextHash = hashToml(rendered);

      if (!this.handle) {
        await this.startChild(rendered, nextHash);
        await this.updateState('running', {
          pid: this.pid,
          configHash: nextHash,
          generatedConfigHash: nextHash,
          lastError: null,
        });
        await this.emitLog('info', 'frps.started', 'frps started', { pid: this.pid });
        return { action: 'started' };
      }

      // Running, check for config change
      if (this.configHash !== nextHash) {
        await this.killHandle();
        await this.startChild(rendered, nextHash);
        await this.updateState('running', {
          pid: this.pid,
          configHash: nextHash,
          generatedConfigHash: nextHash,
          lastError: null,
        });
        await this.emitLog('info', 'frps.restarted', 'frps restarted for config change', {
          pid: this.pid,
        });
        return { action: 'restarted' };
      }

      return { action: 'none' };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.runtimeState = 'failed';
      this.lastError = detail;
      try {
        await this.deps.FrpServerState.findOneAndUpdate(
          { key: 'global' },
          {
            $set: {
              runtimeState: 'failed',
              lastError: {
                code: 'reconcile_error',
                message: detail,
                occurredAt: this.now(),
              },
            },
          }
        );
      } catch {
        // swallow; we're already in error path
      }
      await this.emitLog('error', 'frps.error', 'frps reconcile error', { detail });
      return { action: 'error', detail };
    }
  }

  start(): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      // Fire-and-forget; errors are caught inside reconcileOnce.
      void this.reconcileOnce();
    }, this.reconcileIntervalMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.handle) {
      await this.killHandle();
    }
    this.runtimeState = 'stopped';
    this.pid = undefined;
  }

  async applyRevision(rendered: string, configHash: string): Promise<void> {
    await this.mkdir(this.configDir, { recursive: true });
    const configPath = path.join(this.configDir, 'frps.toml');
    await this.writeFile(configPath, rendered);

    if (this.handle) {
      // Running: graceful restart.
      await this.killHandle();
      const { frps: binary } = await this.ensureBinaryImpl({
        cacheDir: this.binaryCacheDir,
        version: this.binaryVersion,
      });
      const handle = this.startFrpsImpl({ binary, configPath, onLog: this.onChildLog });
      this.handle = handle;
      this.pid = handle.pid;
      this.runtimeState = 'running';
      this.configHash = configHash;
      await this.emitLog('info', 'frps.applied.restart', 'frps config applied with restart', {
        configHash,
      });
    } else {
      // Stopped: stage only.
      this.configHash = configHash;
      await this.emitLog('info', 'frps.applied.staged', 'frps config staged (not running)', {
        configHash,
      });
    }
  }

  private async startChild(rendered: string, configHash: string): Promise<void> {
    const { frps: binary } = await this.ensureBinaryImpl({
      cacheDir: this.binaryCacheDir,
      version: this.binaryVersion,
    });
    await this.mkdir(this.configDir, { recursive: true });
    const configPath = path.join(this.configDir, 'frps.toml');
    await this.writeFile(configPath, rendered);
    const handle = this.startFrpsImpl({ binary, configPath, onLog: this.onChildLog });
    this.handle = handle;
    this.pid = handle.pid;
    this.runtimeState = 'running';
    this.configHash = configHash;
    this.lastError = undefined;
  }

  private async killHandle(): Promise<void> {
    if (!this.handle) return;
    try {
      await this.handle.kill();
    } catch {
      // ignore kill errors
    }
    this.handle = null;
    this.pid = undefined;
    this.runtimeState = 'stopped';
  }

  private async updateState(
    runtimeState: ServiceState,
    extras: Record<string, unknown>
  ): Promise<void> {
    this.runtimeState = runtimeState;
    try {
      await this.deps.FrpServerState.findOneAndUpdate(
        { key: 'global' },
        {
          $set: {
            runtimeState,
            ...extras,
            lastRestartAt:
              runtimeState === 'running' && extras.pid !== undefined ? this.now() : undefined,
          },
        }
      );
    } catch {
      // swallow persistence errors; in-memory state remains.
    }
  }

  private onChildLog = (line: string, stream: 'stdout' | 'stderr'): void => {
    // Best-effort log pipe; errors from logEntry are swallowed.
    void this.emitLog(stream === 'stderr' ? 'warn' : 'info', 'frps.log', line, { stream });
  };

  private async emitLog(
    level: 'info' | 'warn' | 'error',
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry: FrpOrchestratorLogEntry = {
      level,
      service: 'frps',
      eventType,
      message,
      metadata,
    };
    try {
      if (this.deps.logEntry) {
        await this.deps.logEntry(entry);
      } else {
        await this.deps.FleetLogEvent.create({
          service: 'frps',
          level,
          eventType,
          message,
          metadata,
          audit: false,
        });
      }
    } catch {
      // swallow logging errors
    }
  }
}
