/** @vitest-environment node */
import { execFile } from 'node:child_process';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { getAgentToolStatuses } from './tool-availability';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

function mockExecFile(
  impl: (file: string, args: readonly string[]) => [Error | null, string, string]
) {
  vi.mocked(execFile).mockImplementation((file, args, optionsOrCallback, maybeCallback) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (!callback) throw new Error('execFile callback not provided');

    const [error, stdout, stderr] = impl(String(file), Array.isArray(args) ? args : []);
    (callback as ExecCallback)(error, stdout, stderr);
    return {} as ReturnType<typeof execFile>;
  });
}

describe('getAgentToolStatuses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks installed commands with path and version', async () => {
    mockExecFile((file, args) => {
      if (file === 'sh' && args[1] === 'command -v codex') {
        return [null, '/usr/local/bin/codex\n', ''];
      }
      if (file === 'codex' && args[0] === '--version') {
        return [null, 'codex-cli 0.125.0\n', ''];
      }
      return [new Error('missing'), '', ''];
    });

    const statuses = await getAgentToolStatuses();
    const codex = statuses.find((status) => status.type === 'codex');
    const claude = statuses.find((status) => status.type === 'claude-code');

    expect(codex).toMatchObject({
      command: 'codex',
      installed: true,
      path: '/usr/local/bin/codex',
      version: 'codex-cli 0.125.0',
    });
    expect(claude).toMatchObject({
      command: 'claude',
      installed: false,
      error: 'claude: command not found',
    });
  });
});
