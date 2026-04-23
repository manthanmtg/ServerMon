import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import {
  detectRuntimeLaunchContext,
  type RuntimeLaunchContextSnapshot,
} from './runtime-launch-context';

export interface RuntimeDiagnosticsCompletedRequest {
  id: string;
  method: string;
  path: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  statusCode?: number;
  outcome: 'completed' | 'aborted' | 'error';
}

interface InFlightRequestRecord {
  id: string;
  method: string;
  path: string;
  startedAtMs: number;
}

export interface RuntimeDiagnosticsSnapshot {
  generatedAt: string;
  runtime: RuntimeLaunchContextSnapshot;
  process: {
    pid: number;
    uptimeSeconds: number;
    platform: NodeJS.Platform;
    nodeVersion: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
    };
    cpu: {
      userMicros: number;
      systemMicros: number;
    };
    loadAverage: number[];
  };
  eventLoop: {
    utilization: number;
    activeMs: number;
    idleMs: number;
    delayMeanMs: number;
    delayMaxMs: number;
    delayP50Ms: number;
    delayP95Ms: number;
  };
  requests: {
    slowThresholdMs: number;
    inFlightCount: number;
    inFlight: Array<{
      id: string;
      method: string;
      path: string;
      startedAt: string;
      ageMs: number;
    }>;
    recent: RuntimeDiagnosticsCompletedRequest[];
    recentSlow: RuntimeDiagnosticsCompletedRequest[];
  };
}

const MAX_RECENT_REQUESTS = 100;
const DEFAULT_SLOW_REQUEST_MS = 2_000;

class RuntimeDiagnosticsService {
  private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  private readonly slowRequestThresholdMs = Number(
    process.env.SERVERMON_SLOW_REQUEST_MS || DEFAULT_SLOW_REQUEST_MS
  );
  private readonly inFlight = new Map<string, InFlightRequestRecord>();
  private readonly recent: RuntimeDiagnosticsCompletedRequest[] = [];
  private sequence = 0;

  constructor() {
    this.eventLoopDelay.enable();
  }

  beginRequest(input: { method: string; path: string }): string {
    this.sequence += 1;
    const id = `req-${this.sequence}`;
    this.inFlight.set(id, {
      id,
      method: input.method,
      path: input.path,
      startedAtMs: Date.now(),
    });
    return id;
  }

  completeRequest(
    id: string,
    input: {
      statusCode?: number;
      outcome: 'completed' | 'aborted' | 'error';
    }
  ): RuntimeDiagnosticsCompletedRequest | null {
    const started = this.inFlight.get(id);
    if (!started) return null;

    this.inFlight.delete(id);
    const finishedAtMs = Date.now();
    const record: RuntimeDiagnosticsCompletedRequest = {
      id,
      method: started.method,
      path: started.path,
      startedAt: new Date(started.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - started.startedAtMs,
      statusCode: input.statusCode,
      outcome: input.outcome,
    };

    this.recent.unshift(record);
    if (this.recent.length > MAX_RECENT_REQUESTS) {
      this.recent.length = MAX_RECENT_REQUESTS;
    }

    return record;
  }

  getSlowRequestThresholdMs(): number {
    return this.slowRequestThresholdMs;
  }

  getSnapshot(): RuntimeDiagnosticsSnapshot {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const loopUtilization = performance.eventLoopUtilization();
    const processWithLoadAverage = process as NodeJS.Process & {
      loadavg?: () => number[];
    };
    const now = Date.now();

    const inFlight = Array.from(this.inFlight.values())
      .map((request) => ({
        id: request.id,
        method: request.method,
        path: request.path,
        startedAt: new Date(request.startedAtMs).toISOString(),
        ageMs: now - request.startedAtMs,
      }))
      .sort((left, right) => right.ageMs - left.ageMs);

    return {
      generatedAt: new Date(now).toISOString(),
      runtime: detectRuntimeLaunchContext(),
      process: {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        platform: process.platform,
        nodeVersion: process.version,
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
          arrayBuffersBytes: memory.arrayBuffers,
        },
        cpu: {
          userMicros: cpu.user,
          systemMicros: cpu.system,
        },
        loadAverage:
          typeof processWithLoadAverage.loadavg === 'function'
            ? processWithLoadAverage.loadavg()
            : [],
      },
      eventLoop: {
        utilization: Number(loopUtilization.utilization.toFixed(4)),
        activeMs: roundMilliseconds(loopUtilization.active),
        idleMs: roundMilliseconds(loopUtilization.idle),
        delayMeanMs: nanosecondsToMilliseconds(this.eventLoopDelay.mean),
        delayMaxMs: nanosecondsToMilliseconds(this.eventLoopDelay.max),
        delayP50Ms: nanosecondsToMilliseconds(this.eventLoopDelay.percentile(50)),
        delayP95Ms: nanosecondsToMilliseconds(this.eventLoopDelay.percentile(95)),
      },
      requests: {
        slowThresholdMs: this.slowRequestThresholdMs,
        inFlightCount: inFlight.length,
        inFlight,
        recent: [...this.recent],
        recentSlow: this.recent.filter(
          (request) =>
            request.durationMs >= this.slowRequestThresholdMs || request.outcome !== 'completed'
        ),
      },
    };
  }
}

function nanosecondsToMilliseconds(value: number): number {
  return roundMilliseconds(value / 1_000_000);
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100;
}

const runtimeDiagnostics = new RuntimeDiagnosticsService();

export function getRuntimeDiagnostics() {
  return runtimeDiagnostics;
}
