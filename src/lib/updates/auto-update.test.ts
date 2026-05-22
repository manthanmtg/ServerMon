/** @vitest-environment node */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mockGetUpdateRunDetails = vi.fn();
const mockGetServermonAgentStatus = vi.fn();
const mockTriggerLocalAutoUpdateRun = vi.fn();
const mockTriggerUpdate = vi.fn();
const mockTriggerAgentUpdate = vi.fn();
const mockRecordSkippedUpdateRun = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('./system-service', () => ({
  systemUpdateService: {
    getUpdateRunDetails: mockGetUpdateRunDetails,
    getServermonAgentStatus: mockGetServermonAgentStatus,
    triggerLocalAutoUpdateRun: mockTriggerLocalAutoUpdateRun,
    triggerUpdate: mockTriggerUpdate,
    triggerAgentUpdate: mockTriggerAgentUpdate,
    recordSkippedUpdateRun: mockRecordSkippedUpdateRun,
  },
}));

describe('local auto-update service', () => {
  let tempDir: string;
  let configPath: string;
  let agentConfigPath: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), 'servermon-auto-update-'));
    configPath = join(tempDir, 'auto-update.json');
    agentConfigPath = join(tempDir, 'agent-auto-update.json');
    vi.stubEnv('SERVERMON_AUTO_UPDATE_CONFIG', configPath);
    vi.stubEnv('SERVERMON_AGENT_AUTO_UPDATE_CONFIG', agentConfigPath);
    vi.stubEnv('SERVERMON_REPO_DIR', '/opt/servermon/repo');
    mockGetUpdateRunDetails.mockResolvedValue(null);
    mockGetServermonAgentStatus.mockResolvedValue({
      installed: false,
      active: false,
      updateSupported: false,
    });
    mockTriggerLocalAutoUpdateRun.mockResolvedValue({
      success: true,
      runId: 'launched-1',
      message: 'started',
    });
    mockTriggerUpdate.mockResolvedValue({
      success: true,
      runId: 'launched-1',
      message: 'started',
    });
    mockTriggerAgentUpdate.mockResolvedValue({
      success: true,
      runId: 'launched-1',
      message: 'started',
    });
    mockRecordSkippedUpdateRun.mockResolvedValue({
      runId: 'skipped-1',
      status: 'skipped',
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loads disabled defaults when the config file is missing', async () => {
    const { loadAutoUpdateSettings } = await import('./auto-update');

    const settings = await loadAutoUpdateSettings();

    expect(settings.enabled).toBe(false);
    expect(settings.time).toBe('03:00');
    expect(settings.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(settings.missedRunGraceMinutes).toBe(120);
    expect(settings.missedRunMaxRetries).toBe(1);
  });

  it('saves normalized settings and preserves launch metadata', async () => {
    const { loadAutoUpdateSettings, saveAutoUpdateSettings } = await import('./auto-update');

    await saveAutoUpdateSettings({
      enabled: true,
      time: '7:05',
      timezone: 'Asia/Kolkata',
      lastScheduledDateLaunched: '2026-04-25',
      activeRunId: '123',
    });

    const settings = await loadAutoUpdateSettings();
    expect(settings).toMatchObject({
      enabled: true,
      time: '07:05',
      timezone: 'Asia/Kolkata',
      lastScheduledDateLaunched: '2026-04-25',
      activeRunId: '123',
    });
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"timezone": "Asia/Kolkata"');
  });

  it('marks the daily schedule due at the selected timezone time', async () => {
    const { shouldLaunchAutoUpdate } = await import('./auto-update');

    const decision = shouldLaunchAutoUpdate(
      {
        enabled: true,
        time: '03:00',
        timezone: 'Asia/Kolkata',
        missedRunGraceMinutes: 120,
        missedRunMaxRetries: 1,
      },
      new Date('2026-04-25T21:30:00.000Z')
    );

    expect(decision.shouldLaunch).toBe(true);
    if (!decision.shouldLaunch) throw new Error('Expected scheduled launch');
    expect(decision.kind).toBe('scheduled');
    expect(decision.scheduledDate).toBe('2026-04-26');
  });

  it('allows one catch-up launch inside the two-hour missed-run grace window', async () => {
    const { shouldLaunchAutoUpdate } = await import('./auto-update');

    const decision = shouldLaunchAutoUpdate(
      {
        enabled: true,
        time: '03:00',
        timezone: 'Asia/Kolkata',
        missedRunGraceMinutes: 120,
        missedRunMaxRetries: 1,
      },
      new Date('2026-04-25T22:45:00.000Z')
    );

    expect(decision.shouldLaunch).toBe(true);
    if (!decision.shouldLaunch) throw new Error('Expected catch-up launch');
    expect(decision.kind).toBe('catch-up');
    expect(decision.scheduledDate).toBe('2026-04-26');
  });

  it('blocks a second catch-up attempt for the same scheduled date', async () => {
    const { shouldLaunchAutoUpdate } = await import('./auto-update');

    const decision = shouldLaunchAutoUpdate(
      {
        enabled: true,
        time: '03:00',
        timezone: 'Asia/Kolkata',
        missedRunGraceMinutes: 120,
        missedRunMaxRetries: 1,
        lastCatchUpDateAttempted: '2026-04-26',
      },
      new Date('2026-04-25T22:45:00.000Z')
    );

    expect(decision.shouldLaunch).toBe(false);
    if (decision.shouldLaunch) throw new Error('Expected launch to be blocked');
    expect(decision.reason).toBe('catch-up-already-attempted');
  });

  it('blocks launches when an active run is still running', async () => {
    const { shouldLaunchAutoUpdate } = await import('./auto-update');

    const decision = shouldLaunchAutoUpdate(
      {
        enabled: true,
        time: '03:00',
        timezone: 'Asia/Kolkata',
        missedRunGraceMinutes: 120,
        missedRunMaxRetries: 1,
        activeRunId: 'running-1',
      },
      new Date('2026-04-25T21:30:00.000Z'),
      true
    );

    expect(decision.shouldLaunch).toBe(false);
    if (decision.shouldLaunch) throw new Error('Expected active run to block launch');
    expect(decision.reason).toBe('active-run');
  });

  it('reports changed, unchanged, and failed upstream checks without mutating the worktree', async () => {
    const { checkRepoForUpdates } = await import('./auto-update');
    const mockedExecFile = vi.mocked(execFile);
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) return cb(null, { stdout: '', stderr: '' });
      if (argList.includes('HEAD')) return cb(null, { stdout: 'local\n', stderr: '' });
      if (argList.includes('@{u}')) return cb(null, { stdout: 'remote\n', stderr: '' });
      return cb(new Error('unexpected'), { stdout: '', stderr: '' });
    });

    await expect(checkRepoForUpdates('/repo')).resolves.toEqual({
      status: 'changed',
      localRef: 'local',
      upstreamRef: 'remote',
    });
    expect(JSON.stringify(mockedExecFile.mock.calls)).not.toContain('reset');
    expect(JSON.stringify(mockedExecFile.mock.calls)).not.toContain('pull');

    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) return cb(null, { stdout: '', stderr: '' });
      if (argList.includes('HEAD') || argList.includes('FETCH_HEAD') || argList.includes('@{u}')) {
        return cb(null, { stdout: 'same\n', stderr: '' });
      }
      return cb(new Error('unexpected'), { stdout: '', stderr: '' });
    });
    await expect(checkRepoForUpdates('/repo')).resolves.toMatchObject({ status: 'unchanged' });

    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) {
        return cb(new Error('network'), { stdout: '', stderr: 'network' });
      }
      return cb(null, { stdout: '', stderr: '' });
    });
    await expect(checkRepoForUpdates('/repo')).resolves.toMatchObject({
      status: 'failed',
      message: 'network',
    });
  });

  it('checks the configured source branch instead of trusting the local upstream', async () => {
    const { checkRepoForUpdates } = await import('./auto-update');
    const mockedExecFile = vi.mocked(execFile);
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.join(' ') === '-C /repo fetch --quiet origin stable') {
        return cb(null, { stdout: '', stderr: '' });
      }
      if (argList.includes('HEAD')) return cb(null, { stdout: 'local\n', stderr: '' });
      if (argList.includes('FETCH_HEAD')) return cb(null, { stdout: 'remote\n', stderr: '' });
      if (argList.includes('@{u}')) return cb(null, { stdout: 'local\n', stderr: '' });
      return cb(new Error(`unexpected ${argList.join(' ')}`), { stdout: '', stderr: '' });
    });

    await expect(
      checkRepoForUpdates('/repo', { branch: 'stable', remote: 'origin' })
    ).resolves.toEqual({
      status: 'changed',
      localRef: 'local',
      upstreamRef: 'remote',
    });
    expect(JSON.stringify(mockedExecFile.mock.calls)).not.toContain('@{u}');
  });

  it('records a skipped run when neither ServerMon nor the running agent changed', async () => {
    const { saveAutoUpdateSettings, runLocalAutoUpdateOnce } = await import('./auto-update');
    await saveAutoUpdateSettings({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });
    mockGetServermonAgentStatus.mockResolvedValue({
      installed: true,
      active: true,
      updateSupported: true,
      repoDir: '/opt/servermon-agent/source',
    });
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) return cb(null, { stdout: '', stderr: '' });
      if (argList.includes('HEAD') || argList.includes('FETCH_HEAD') || argList.includes('@{u}')) {
        return cb(null, { stdout: 'same\n', stderr: '' });
      }
      return cb(new Error('unexpected'), { stdout: '', stderr: '' });
    });

    const result = await runLocalAutoUpdateOnce(new Date('2026-04-25T21:30:00.000Z'));

    expect(result).toMatchObject({ launched: false, reason: 'no-updates' });
    expect(mockRecordSkippedUpdateRun).toHaveBeenCalledWith(
      'ServerMon app auto-update skipped: no upstream changes detected',
      'servermon',
      'scheduled'
    );
    expect(mockTriggerLocalAutoUpdateRun).not.toHaveBeenCalled();
    const stored = JSON.parse(await readFile(configPath, 'utf8')) as { lastSkippedDate?: string };
    expect(stored.lastSkippedDate).toBe('2026-04-26');
  });

  it('launches a scheduled ServerMon app update when ServerMon changed', async () => {
    const { saveAutoUpdateSettings, runLocalAutoUpdateOnce } = await import('./auto-update');
    await saveAutoUpdateSettings({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });
    mockGetServermonAgentStatus.mockResolvedValue({
      installed: true,
      active: true,
      updateSupported: true,
      repoDir: '/opt/servermon-agent/source',
    });
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) return cb(null, { stdout: '', stderr: '' });
      if (argList.includes('HEAD')) return cb(null, { stdout: 'local\n', stderr: '' });
      if (argList.includes('FETCH_HEAD') || argList.includes('@{u}')) {
        return cb(null, { stdout: 'remote\n', stderr: '' });
      }
      return cb(new Error('unexpected'), { stdout: '', stderr: '' });
    });

    const result = await runLocalAutoUpdateOnce(new Date('2026-04-25T21:30:00.000Z'));

    expect(result).toMatchObject({ launched: true, runId: 'launched-1' });
    expect(mockTriggerUpdate).toHaveBeenCalledWith({ trigger: 'scheduled' });
    expect(mockTriggerAgentUpdate).not.toHaveBeenCalled();
    const stored = JSON.parse(await readFile(configPath, 'utf8')) as {
      activeRunId?: string;
      lastScheduledDateLaunched?: string;
    };
    expect(stored.activeRunId).toBe('launched-1');
    expect(stored.lastScheduledDateLaunched).toBe('2026-04-26');
  });

  it('uses SERVERMON_SOURCE_REF when checking scheduled ServerMon app updates', async () => {
    vi.stubEnv('SERVERMON_SOURCE_REF', 'stable');
    const { saveAutoUpdateSettings, runLocalAutoUpdateOnce } = await import('./auto-update');
    await saveAutoUpdateSettings({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.join(' ') === '-C /opt/servermon/repo fetch --quiet origin stable') {
        return cb(null, { stdout: '', stderr: '' });
      }
      if (argList.includes('HEAD')) return cb(null, { stdout: 'local\n', stderr: '' });
      if (argList.includes('FETCH_HEAD')) return cb(null, { stdout: 'remote\n', stderr: '' });
      return cb(new Error(`unexpected ${argList.join(' ')}`), { stdout: '', stderr: '' });
    });

    const result = await runLocalAutoUpdateOnce(new Date('2026-04-25T21:30:00.000Z'));

    expect(result).toMatchObject({ launched: true, runId: 'launched-1' });
    expect(mockTriggerUpdate).toHaveBeenCalledWith({ trigger: 'scheduled' });
  });

  it('launches release-mode ServerMon app updates without requiring a source git checkout', async () => {
    vi.stubEnv('SERVERMON_INSTALL_MODE', 'release');
    vi.stubEnv('SERVERMON_REPO_DIR', '');
    const { saveAutoUpdateSettings, runLocalAutoUpdateOnce } = await import('./auto-update');
    await saveAutoUpdateSettings({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });

    const result = await runLocalAutoUpdateOnce(new Date('2026-04-25T21:30:00.000Z'));

    expect(result).toMatchObject({ launched: true, runId: 'launched-1' });
    expect(execFile).not.toHaveBeenCalled();
    expect(mockRecordSkippedUpdateRun).not.toHaveBeenCalled();
    expect(mockTriggerUpdate).toHaveBeenCalledWith({ trigger: 'scheduled' });
  });

  it('launches release-mode agent update without requiring a git checkout', async () => {
    const { saveAutoUpdateSettings, runLocalAutoUpdateOnce } = await import('./auto-update');
    await saveAutoUpdateSettings({
      enabled: true,
      time: '03:00',
      timezone: 'Asia/Kolkata',
    });
    mockGetServermonAgentStatus.mockResolvedValue({
      installed: true,
      active: true,
      updateSupported: true,
      installMode: 'release',
      versionTarget: 'latest',
      repoDir: '/opt/servermon-agent/source',
    });
    mockExecFile((cmd, args, ...rest: unknown[]) => {
      const cb = rest.at(-1) as (
        error: Error | null,
        result: { stdout: string; stderr: string }
      ) => void;
      const argList = args as string[];
      if (argList.includes('fetch')) return cb(null, { stdout: '', stderr: '' });
      if (argList.includes('HEAD') || argList.includes('@{u}')) {
        return cb(null, { stdout: 'same\n', stderr: '' });
      }
      return cb(new Error(`unexpected ${String(cmd)}`), { stdout: '', stderr: '' });
    });

    await saveAutoUpdateSettings(
      {
        enabled: true,
        time: '03:00',
        timezone: 'Asia/Kolkata',
      },
      'agent'
    );

    const result = await runLocalAutoUpdateOnce('agent', new Date('2026-04-25T21:30:00.000Z'));

    expect(result).toMatchObject({ launched: true, runId: 'launched-1' });
    expect(mockTriggerAgentUpdate).toHaveBeenCalledWith({ trigger: 'scheduled' });
    expect(mockTriggerLocalAutoUpdateRun).not.toHaveBeenCalled();
  });
});

function mockExecFile(fn: (...args: unknown[]) => void): void {
  (
    execFile as unknown as {
      mockImplementation: (impl: (...args: unknown[]) => void) => void;
    }
  ).mockImplementation(fn);
}
