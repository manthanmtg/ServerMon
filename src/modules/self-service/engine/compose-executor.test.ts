/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ComposeExecutor } from './compose-executor';

const mockExecute = vi.fn();

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./shell-executor', () => ({
  ShellExecutor: vi.fn().mockImplementation(() => ({
    execute: mockExecute,
  })),
}));

import { mkdir, writeFile } from 'node:fs/promises';
import { ShellExecutor } from './shell-executor';

function makePayload(overrides: Record<string, string | undefined> = {}) {
  return {
    method: 'docker-compose',
    composeContent: 'version: "3"',
    composeDir: '/tmp/compose',
    ...overrides,
  };
}

function collectLogs() {
  const lines: string[] = [];
  return {
    lines,
    onLog: (line: string) => lines.push(line),
  };
}

describe('ComposeExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('returns failure when required compose content is missing', async () => {
    const executor = new ComposeExecutor();
    const { lines, onLog } = collectLogs();

    const result = await executor.execute(makePayload({ composeContent: undefined }), onLog);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing compose content or directory');
    expect(result.logs).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('returns failure when compose directory is missing', async () => {
    const executor = new ComposeExecutor();
    const { lines, onLog } = collectLogs();

    const result = await executor.execute(makePayload({ composeDir: undefined }), onLog);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Missing compose content or directory');
    expect(result.logs).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('writes compose file and succeeds when shell execution succeeds', async () => {
    mockExecute.mockImplementation(async (_payload, cb) => {
      cb('compose log');
      return { success: true, logs: [] };
    });

    const executor = new ComposeExecutor();
    const { lines, onLog } = collectLogs();
    const result = await executor.execute(
      makePayload({
        composeContent: 'version: "3.9"',
        composeDir: '/tmp/compose-run',
      }),
      onLog
    );

    expect(mkdir).toHaveBeenCalledWith('/tmp/compose-run', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      '/tmp/compose-run/docker-compose.yml',
      'version: "3.9"',
      'utf-8'
    );
    expect(mockExecute).toHaveBeenCalledWith(
      { method: 'docker-compose', commands: ['cd /tmp/compose-run && docker compose up -d'] },
      expect.any(Function)
    );
    expect(result).toEqual({
      success: true,
      logs: [
        'Creating directory: /tmp/compose-run',
        'Writing docker-compose.yml to /tmp/compose-run/docker-compose.yml',
        'Running docker compose up -d...',
        'compose log',
        'Docker Compose services started successfully.',
      ],
    });
    expect(lines).toEqual([
      'Creating directory: /tmp/compose-run',
      'Writing docker-compose.yml to /tmp/compose-run/docker-compose.yml',
      'Running docker compose up -d...',
      'compose log',
      'Docker Compose services started successfully.',
    ]);
    expect(lines).toContain('$ cd /tmp/compose-run && docker compose up -d');
  });

  it('surfaces shell executor failure and keeps collected logs', async () => {
    mockExecute.mockImplementation(async (_payload, cb) => {
      cb('compose log');
      return { success: false, logs: ['compose log'], error: 'compose failed' };
    });

    const executor = new ComposeExecutor();
    const { lines, onLog } = collectLogs();
    const result = await executor.execute(makePayload(), onLog);

    expect(result).toEqual({
      success: false,
      logs: [
        'Creating directory: /tmp/compose',
        'Writing docker-compose.yml to /tmp/compose/docker-compose.yml',
        'Running docker compose up -d...',
        'compose log',
        'compose failed',
      ],
      error: 'compose failed',
    });
    expect(lines).toEqual([
      'Creating directory: /tmp/compose',
      'Writing docker-compose.yml to /tmp/compose/docker-compose.yml',
      'Running docker compose up -d...',
      'compose log',
      'compose failed',
    ]);
  });

  it('returns a default error message when shell execution throws a non-Error', async () => {
    mockExecute.mockRejectedValue('bad error');

    const executor = new ComposeExecutor();
    const { lines, onLog } = collectLogs();
    const result = await executor.execute(makePayload(), onLog);

    expect(result).toEqual({
      success: false,
      logs: [
        'Creating directory: /tmp/compose',
        'Writing docker-compose.yml to /tmp/compose/docker-compose.yml',
        'Running docker compose up -d...',
        'ERROR: Compose execution failed',
      ],
      error: 'Compose execution failed',
    });
    expect(lines).toContain('ERROR: Compose execution failed');
    expect(lines[lines.length - 1]).toBe('ERROR: Compose execution failed');
  });

  it('invokes shell executor instance with expected command arguments', () => {
    new ComposeExecutor();
    expect(ShellExecutor).toHaveBeenCalledTimes(1);
    expect(ShellExecutor).toHaveBeenCalledWith();
  });
});
