/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ICustomEndpoint } from '@/models/CustomEndpoint';
import type { ExecutionInput } from './executor';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// We mock 'child_process' spawn with a controllable fake child process
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { executeScript } from './script-executor';

// Helper that creates a fake ChildProcess emitter
function makeChild(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  spawnError?: Error;
  delay?: number;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.kill = vi.fn();
  child.pid = 1234;

  const delay = opts.delay ?? 0;

  setTimeout(() => {
    if (opts.spawnError) {
      child.emit('error', opts.spawnError);
      return;
    }
    if (opts.stdout) {
      child.stdout.emit('data', Buffer.from(opts.stdout));
    }
    if (opts.stderr) {
      child.stderr.emit('data', Buffer.from(opts.stderr));
    }
    child.emit('close', opts.exitCode ?? 0);
  }, delay);

  return child;
}

function makeEndpoint(overrides: Partial<ICustomEndpoint> = {}): ICustomEndpoint {
  return {
    slug: 'script-ep',
    endpointType: 'script',
    scriptLang: 'bash',
    scriptContent: 'echo hello',
    timeout: 5000,
    ...overrides,
  } as unknown as ICustomEndpoint;
}

function makeInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    method: 'POST',
    headers: {},
    query: {},
    ...overrides,
  };
}

describe('executeScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── unsupported language ───────────────────────────────────────────────────

  it('returns 500 for an unsupported language', async () => {
    const endpoint = makeEndpoint({ scriptLang: 'ruby' as 'bash' });
    const result = await executeScript(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('Unsupported script language: ruby');
  });

  // ── empty content ──────────────────────────────────────────────────────────

  it('returns 500 when scriptContent is empty', async () => {
    const endpoint = makeEndpoint({ scriptContent: '   ' });
    const result = await executeScript(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('Script content is empty');
  });

  it('returns 500 when scriptContent is undefined/missing', async () => {
    const endpoint = makeEndpoint({ scriptContent: undefined });
    const result = await executeScript(endpoint, makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('Script content is empty');
  });

  // ── successful execution ───────────────────────────────────────────────────

  it('returns 200 with text/plain for plain text output', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: 'hello world\n', exitCode: 0 }));
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('hello world');
    expect(result.headers['content-type']).toBe('text/plain');
  });

  it('returns 200 with application/json when stdout is valid JSON', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: '{"result":42}\n', exitCode: 0 }));
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.statusCode).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    const parsed = JSON.parse(result.body);
    expect(parsed.result).toBe(42);
  });

  it('includes stdout and stderr fields in result', async () => {
    mockSpawn.mockReturnValue(
      makeChild({ stdout: 'output line\n', stderr: 'warning msg\n', exitCode: 0 })
    );
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.stdout).toContain('output line');
    expect(result.stderr).toContain('warning msg');
  });

  it('passes body to stdin when input.body is set', async () => {
    const child = makeChild({ stdout: 'ok\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    await executeScript(makeEndpoint(), makeInput({ body: 'stdin data' }));

    expect(child.stdin.write).toHaveBeenCalledWith('stdin data');
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('uses python3 binary for python lang', async () => {
    const child = makeChild({ stdout: 'py result\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    const endpoint = makeEndpoint({ scriptLang: 'python', scriptContent: 'print("hi")' });
    await executeScript(endpoint, makeInput());

    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['-c', 'print("hi")']),
      expect.any(Object)
    );
  });

  it('uses node binary with -e flag for node lang', async () => {
    const child = makeChild({ stdout: '{"x":1}\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    const endpoint = makeEndpoint({ scriptLang: 'node', scriptContent: 'console.log(1)' });
    await executeScript(endpoint, makeInput());

    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['-e']),
      expect.any(Object)
    );
  });

  // ── failed execution ───────────────────────────────────────────────────────

  it('returns 500 when script exits with non-zero code', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: '', stderr: 'some error\n', exitCode: 1 }));
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toBeTruthy();
  });

  it('includes exit code in error when stderr is empty', async () => {
    mockSpawn.mockReturnValue(makeChild({ stdout: '', stderr: '', exitCode: 127 }));
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('127');
  });

  it('returns stdout body even on non-zero exit when output exists', async () => {
    mockSpawn.mockReturnValue(
      makeChild({ stdout: 'partial output\n', stderr: 'error text\n', exitCode: 1 })
    );
    const result = await executeScript(makeEndpoint(), makeInput());

    // Non-zero but has stdout — body should be from stdout
    expect(result.body).toBe('partial output');
  });

  // ── spawn error ────────────────────────────────────────────────────────────

  it('returns 500 on spawn error (binary not found)', async () => {
    const spawnErr = new Error('spawn bash ENOENT');
    mockSpawn.mockReturnValue(makeChild({ spawnError: spawnErr }));
    const result = await executeScript(makeEndpoint(), makeInput());

    expect(result.statusCode).toBe(500);
    expect(result.error).toContain('spawn bash ENOENT');
    expect(result.body).toContain('Failed to execute script');
  });

  // ── environment variables ──────────────────────────────────────────────────

  it('includes ENDPOINT_METHOD and ENDPOINT_QUERY in env', async () => {
    const child = makeChild({ stdout: 'ok\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    const input = makeInput({ method: 'GET', query: { foo: 'bar' } });
    await executeScript(makeEndpoint(), input);

    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>;
    expect(spawnEnv.ENDPOINT_METHOD).toBe('GET');
    expect(JSON.parse(spawnEnv.ENDPOINT_QUERY)).toEqual({ foo: 'bar' });
  });

  it('includes endpoint envVars in process env', async () => {
    const child = makeChild({ stdout: 'ok\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    const endpoint = makeEndpoint({
      envVars: { MY_VAR: 'my_value' } as unknown as ICustomEndpoint['envVars'],
    });
    await executeScript(endpoint, makeInput());

    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>;
    expect(spawnEnv.MY_VAR).toBe('my_value');
  });

  it('sets ENDPOINT_BODY in env when body is provided', async () => {
    const child = makeChild({ stdout: 'ok\n', exitCode: 0 });
    mockSpawn.mockReturnValue(child);
    await executeScript(makeEndpoint(), makeInput({ body: 'payload data' }));

    const spawnEnv = mockSpawn.mock.calls[0][2].env as Record<string, string>;
    expect(spawnEnv.ENDPOINT_BODY).toBe('payload data');
  });

  // ── output truncation ──────────────────────────────────────────────────────

  it('truncates stdout at 10240 chars', async () => {
    // Emit data in two chunks to exercise the accumulation + truncation path
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.kill = vi.fn();

    mockSpawn.mockReturnValue(child);

    const resultPromise = executeScript(makeEndpoint(), makeInput());

    // Emit oversized chunks
    child.stdout.emit('data', Buffer.from('A'.repeat(8000)));
    child.stdout.emit('data', Buffer.from('B'.repeat(8000)));
    child.emit('close', 0);

    const result = await resultPromise;
    expect(result.stdout!.length).toBeLessThanOrEqual(10240);
  });
});
