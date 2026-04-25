import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FrpOrchestrator, type FrpOrchestratorDeps } from './frpOrchestrator';
import type { FrpHandle } from './frpProcess';

interface FakeStateDoc {
  key?: string;
  enabled: boolean;
  runtimeState?: string;
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  subdomainHost?: string;
  authTokenHash?: string;
  generatedConfigHash?: string;
  configVersion?: number;
}

function makeFakeHandle(): FrpHandle & {
  killed: boolean;
  _kill: ReturnType<typeof vi.fn>;
} {
  const killFn = vi.fn(async () => {});
  const handle = {
    pid: 1234,
    kill: killFn,
    onExit: new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(() => {}),
    killed: false,
    _kill: killFn,
  } as FrpHandle & { killed: boolean; _kill: ReturnType<typeof vi.fn> };
  return handle;
}

function makeDeps(
  partial: Partial<FrpOrchestratorDeps> & { stateDoc?: FakeStateDoc | null } = {}
): {
  deps: FrpOrchestratorDeps;
  logs: Array<Parameters<NonNullable<FrpOrchestratorDeps['logEntry']>>[0]>;
  findOneMock: ReturnType<typeof vi.fn>;
  findOneAndUpdateMock: ReturnType<typeof vi.fn>;
  writeFileMock: ReturnType<typeof vi.fn>;
  mkdirMock: ReturnType<typeof vi.fn>;
  ensureBinaryMock: ReturnType<typeof vi.fn>;
  startFrpsMock: ReturnType<typeof vi.fn>;
  fleetLogCreateMock: ReturnType<typeof vi.fn>;
} {
  const logs: Array<Parameters<NonNullable<FrpOrchestratorDeps['logEntry']>>[0]> = [];
  const stateDoc = partial.stateDoc ?? null;

  const findOneMock = vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(stateDoc),
  });
  const findOneAndUpdateMock = vi.fn().mockResolvedValue(null);
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  const mkdirMock = vi.fn().mockResolvedValue(undefined);
  const ensureBinaryMock = vi.fn().mockResolvedValue({
    frps: '/tmp/cache/0.61.2/linux_amd64/frps',
    frpc: '/tmp/cache/0.61.2/linux_amd64/frpc',
  });
  const startFrpsMock = vi.fn().mockImplementation(() => makeFakeHandle());
  const fleetLogCreateMock = vi.fn().mockResolvedValue(undefined);

  const deps: FrpOrchestratorDeps = {
    FrpServerState: {
      findOne: findOneMock,
      findOneAndUpdate: findOneAndUpdateMock,
    },
    FleetLogEvent: { create: fleetLogCreateMock },
    ensureBinaryImpl: ensureBinaryMock as unknown as FrpOrchestratorDeps['ensureBinaryImpl'],
    startFrpsImpl: startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'],
    writeFile: writeFileMock,
    mkdir: mkdirMock,
    logEntry: (entry) => {
      logs.push(entry);
    },
    binaryVersion: '0.61.2',
    binaryCacheDir: '/tmp/cache',
    configDir: '/tmp/config',
    getHubAuthToken: async () => 'test-hub-auth-token',
    ...partial,
  };

  return {
    deps,
    logs,
    findOneMock,
    findOneAndUpdateMock,
    writeFileMock,
    mkdirMock,
    ensureBinaryMock,
    startFrpsMock,
    fleetLogCreateMock,
  };
}

describe('FrpOrchestrator.currentState', () => {
  it('reports stopped and no pid initially', () => {
    const { deps } = makeDeps();
    const orch = new FrpOrchestrator(deps);
    expect(orch.currentState()).toEqual({ runtimeState: 'stopped' });
  });
});

describe('FrpOrchestrator.reconcileOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'none' when enabled=false and no handle", async () => {
    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: false,
        bindPort: 7000,
        vhostHttpPort: 8080,
      },
    });
    const orch = new FrpOrchestrator(deps);
    const result = await orch.reconcileOnce();
    expect(result.action).toBe('none');
    expect(orch.currentState().runtimeState).toBe('stopped');
  });

  it("returns 'none' when state doc missing", async () => {
    const { deps } = makeDeps({ stateDoc: null });
    const orch = new FrpOrchestrator(deps);
    const result = await orch.reconcileOnce();
    expect(result.action).toBe('none');
  });

  it("returns 'started' when enabled=true and no handle", async () => {
    const { deps, ensureBinaryMock, writeFileMock, startFrpsMock, mkdirMock, logs } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    const orch = new FrpOrchestrator(deps);
    const result = await orch.reconcileOnce();
    expect(result.action).toBe('started');
    expect(ensureBinaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheDir: '/tmp/cache',
        version: '0.61.2',
      })
    );
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/config', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith(
      '/tmp/config/frps.toml',
      expect.stringContaining('bindPort = 7000')
    );
    expect(startFrpsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        binary: '/tmp/cache/0.61.2/linux_amd64/frps',
        configPath: '/tmp/config/frps.toml',
      })
    );
    expect(orch.currentState().runtimeState).toBe('running');
    expect(orch.currentState().pid).toBe(1234);
    expect(logs.some((l) => l.eventType === 'frps.started')).toBe(true);
  });

  it("returns 'stopped' when enabled=false and handle exists", async () => {
    const fakeHandle = makeFakeHandle();
    const startFrpsMock = vi.fn().mockReturnValue(fakeHandle);
    const findOneMock = vi
      .fn()
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'global',
          enabled: true,
          bindPort: 7000,
          vhostHttpPort: 8080,
          subdomainHost: 'hub.example.com',
        }),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'global',
          enabled: false,
          bindPort: 7000,
          vhostHttpPort: 8080,
        }),
      });

    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    deps.startFrpsImpl = startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'];
    deps.FrpServerState = {
      ...deps.FrpServerState,
      findOne: findOneMock,
    };

    const orch = new FrpOrchestrator(deps);
    // First reconcile starts it
    const first = await orch.reconcileOnce();
    expect(first.action).toBe('started');
    // Second reconcile with enabled=false should stop it
    const second = await orch.reconcileOnce();
    expect(second.action).toBe('stopped');
    expect(fakeHandle._kill).toHaveBeenCalled();
    expect(orch.currentState().runtimeState).toBe('stopped');
  });

  it("returns 'restarted' when enabled=true and configHash changed", async () => {
    const firstHandle = makeFakeHandle();
    const secondHandle = makeFakeHandle();
    secondHandle.pid = 5678;

    const startFrpsMock = vi
      .fn()
      .mockReturnValueOnce(firstHandle)
      .mockReturnValueOnce(secondHandle);

    const findOneMock = vi
      .fn()
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'global',
          enabled: true,
          bindPort: 7000,
          vhostHttpPort: 8080,
          subdomainHost: 'hub.example.com',
        }),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'global',
          enabled: true,
          bindPort: 7777, // CHANGED
          vhostHttpPort: 8080,
          subdomainHost: 'hub.example.com',
        }),
      });

    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    deps.startFrpsImpl = startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'];
    deps.FrpServerState = {
      ...deps.FrpServerState,
      findOne: findOneMock,
    };

    const orch = new FrpOrchestrator(deps);
    const first = await orch.reconcileOnce();
    expect(first.action).toBe('started');
    const second = await orch.reconcileOnce();
    expect(second.action).toBe('restarted');
    expect(firstHandle._kill).toHaveBeenCalled();
    expect(orch.currentState().pid).toBe(5678);
  });

  it("returns 'none' when enabled=true, handle exists, and configHash unchanged", async () => {
    const firstHandle = makeFakeHandle();
    const startFrpsMock = vi.fn().mockReturnValue(firstHandle);

    const stateDoc = {
      key: 'global',
      enabled: true,
      bindPort: 7000,
      vhostHttpPort: 8080,
      subdomainHost: 'hub.example.com',
    };

    const findOneMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(stateDoc),
    });

    const { deps } = makeDeps({ stateDoc });
    deps.startFrpsImpl = startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'];
    deps.FrpServerState = {
      ...deps.FrpServerState,
      findOne: findOneMock,
    };

    const orch = new FrpOrchestrator(deps);
    const first = await orch.reconcileOnce();
    expect(first.action).toBe('started');
    const second = await orch.reconcileOnce();
    expect(second.action).toBe('none');
    expect(firstHandle._kill).not.toHaveBeenCalled();
  });

  it("translates errors to action='error' and sets runtimeState='failed'", async () => {
    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
      },
    });
    deps.ensureBinaryImpl = vi
      .fn()
      .mockRejectedValue(new Error('boom')) as unknown as FrpOrchestratorDeps['ensureBinaryImpl'];
    const orch = new FrpOrchestrator(deps);
    const result = await orch.reconcileOnce();
    expect(result.action).toBe('error');
    expect(result.detail).toContain('boom');
    expect(orch.currentState().runtimeState).toBe('failed');
    expect(orch.currentState().lastError).toContain('boom');
  });

  it('updates FrpServerState with generatedConfigHash via findOneAndUpdate on start', async () => {
    const { deps, findOneAndUpdateMock } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    const orch = new FrpOrchestrator(deps);
    await orch.reconcileOnce();
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: expect.objectContaining({
          generatedConfigHash: expect.any(String),
          runtimeState: 'running',
        }),
      })
    );
  });
});

describe('FrpOrchestrator.start / stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('start begins an interval loop that calls reconcileOnce', async () => {
    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: false,
        bindPort: 7000,
        vhostHttpPort: 8080,
      },
    });
    const orch = new FrpOrchestrator({ ...deps, reconcileIntervalMs: 1000 });
    const spy = vi.spyOn(orch, 'reconcileOnce').mockResolvedValue({ action: 'none' });
    orch.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalled();
    await orch.stop();
    vi.useRealTimers();
  });

  it('start fires an immediate reconcile so frps boots up alongside the hub', async () => {
    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: false,
        bindPort: 7000,
        vhostHttpPort: 8080,
      },
    });
    const orch = new FrpOrchestrator({ ...deps, reconcileIntervalMs: 60_000 });
    const spy = vi.spyOn(orch, 'reconcileOnce').mockResolvedValue({ action: 'none' });
    orch.start();
    // Flush any pending microtasks from the synchronous void-call.
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    await orch.stop();
    vi.useRealTimers();
  });

  it('stop clears interval and kills handle if present', async () => {
    vi.useRealTimers();
    const fakeHandle = makeFakeHandle();
    const startFrpsMock = vi.fn().mockReturnValue(fakeHandle);
    const { deps } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    deps.startFrpsImpl = startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'];
    const orch = new FrpOrchestrator(deps);
    await orch.reconcileOnce();
    await orch.stop();
    expect(fakeHandle._kill).toHaveBeenCalled();
    expect(orch.currentState().runtimeState).toBe('stopped');
  });
});

describe('FrpOrchestrator.applyRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('when running, writes new config and restarts child', async () => {
    const firstHandle = makeFakeHandle();
    const secondHandle = makeFakeHandle();
    secondHandle.pid = 999;

    const startFrpsMock = vi
      .fn()
      .mockReturnValueOnce(firstHandle)
      .mockReturnValueOnce(secondHandle);

    const { deps, writeFileMock } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: true,
        bindPort: 7000,
        vhostHttpPort: 8080,
        subdomainHost: 'hub.example.com',
      },
    });
    deps.startFrpsImpl = startFrpsMock as unknown as FrpOrchestratorDeps['startFrpsImpl'];

    const orch = new FrpOrchestrator(deps);
    await orch.reconcileOnce(); // starts
    expect(orch.currentState().runtimeState).toBe('running');

    await orch.applyRevision('rendered toml content\n', 'abc-hash');
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/config/frps.toml', 'rendered toml content\n');
    expect(firstHandle._kill).toHaveBeenCalled();
    expect(startFrpsMock).toHaveBeenCalledTimes(2);
    expect(orch.currentState().configHash).toBe('abc-hash');
  });

  it('when stopped, stages config only (no kill, no start)', async () => {
    const { deps, writeFileMock, startFrpsMock } = makeDeps({
      stateDoc: {
        key: 'global',
        enabled: false,
        bindPort: 7000,
        vhostHttpPort: 8080,
      },
    });
    const orch = new FrpOrchestrator(deps);
    await orch.applyRevision('rendered toml content\n', 'xyz-hash');
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/config/frps.toml', 'rendered toml content\n');
    expect(startFrpsMock).not.toHaveBeenCalled();
    // currentState should remain stopped
    expect(orch.currentState().runtimeState).toBe('stopped');
  });
});
