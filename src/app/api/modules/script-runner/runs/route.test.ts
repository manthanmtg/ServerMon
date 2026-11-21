import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { openEnvironment, sealEnvironment } from '@/lib/script-runner/environment';
import type { RunRecord } from '@/models/ScriptRunner';
import { POST } from './route';

const { createRun, findSavedScript, readLinkedEnvironment } = vi.hoisted(() => ({
  createRun: vi.fn(async (run: RunRecord) => run),
  findSavedScript: vi.fn(),
  readLinkedEnvironment: vi.fn(),
}));

vi.mock('../_shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_shared')>()),
  authorized: (_: Request, action: (actor: { username: string }) => Promise<Response>) =>
    action({ username: 'admin' }),
}));
vi.mock('@/models/ScriptRunner', () => ({ ScriptRunnerRun: { create: createRun } }));
vi.mock('@/lib/script-runner/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/script-runner/store')>()),
  findRun: () => ({ lean: async () => null }),
  findScript: findSavedScript,
  runnerSettings: async () => ({
    workerId: 'worker',
    workerCapabilityId: 'worker',
    workerLinkedEnvironmentId: 'worker',
    workerProtocol: 2,
    workerRuntimes: ['python'],
  }),
  workerOnline: () => true,
}));
vi.mock('@/lib/script-runner/variables', () => ({ readLinkedEnvironment }));

afterEach(() => vi.unstubAllEnvs());

it('queues a saved script with its source, launch defaults, and linked environment', async () => {
  vi.stubEnv('JWT_SECRET', 'script-runner-test-key');
  const scriptId = '27ac89d0-0704-4662-9770-e143d2a47d3c';
  const variableId = '8134a3a6-e21c-488e-8f15-06edbca98590';
  const groupId = '0eff9a0b-53c6-4522-9cbe-61202c0b8cae';
  const inline = [{ key: 'APP_MODE', value: 'report' }];
  const linked = [{ key: 'REPORT_TOKEN', value: 'fixture-token' }];
  const saved = {
    _id: scriptId,
    title: 'Weekly report',
    source: 'print("ready")',
    language: 'python',
    cwd: tmpdir(),
    args: ['weekly'],
    timeoutSeconds: 180,
    envVarIds: [variableId],
    envGroupIds: [groupId],
    environmentSeal: sealEnvironment(inline),
  };
  const select = vi.fn(() => ({ lean: async () => saved }));
  findSavedScript.mockReturnValue({ select });
  readLinkedEnvironment.mockResolvedValue(linked);

  const response = await POST(
    new Request('http://localhost/api/modules/script-runner/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId }),
    })
  );

  expect(response.status).toBe(202);
  expect(select).toHaveBeenCalledWith('+source +environmentSeal');
  expect(readLinkedEnvironment).toHaveBeenCalledWith({
    envVarIds: [variableId],
    envGroupIds: [groupId],
  });
  const [run] = createRun.mock.calls[0];
  expect(run).toMatchObject({
    scriptId,
    title: saved.title,
    source: saved.source,
    language: saved.language,
    cwd: saved.cwd,
    args: saved.args,
    timeoutSeconds: saved.timeoutSeconds,
    status: 'queued_linked',
  });
  expect(openEnvironment(run.environmentSeal)).toEqual(inline);
  expect(openEnvironment(run.linkedEnvironmentSeal)).toEqual(linked);
});
