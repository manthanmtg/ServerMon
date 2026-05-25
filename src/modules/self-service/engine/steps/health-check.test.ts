import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runHealthCheck } from './health-check';
import { detectCommand } from '../shell-executor';

vi.mock('../shell-executor', () => ({
  detectCommand: vi.fn(),
}));

describe('runHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips health check if neither url nor command is provided', async () => {
    const onLog = vi.fn();
    const result = await runHealthCheck({}, onLog);

    expect(result.success).toBe(true);
    expect(result.logs).toContain('No health check configured — skipping.');
    expect(detectCommand).not.toHaveBeenCalled();
  });

  it('succeeds on first attempt with command', async () => {
    vi.mocked(detectCommand).mockResolvedValueOnce({ found: true, output: '' });
    
    const onLog = vi.fn();
    const result = await runHealthCheck({ command: 'echo OK' }, onLog);

    expect(result.success).toBe(true);
    expect(detectCommand).toHaveBeenCalledWith('echo OK');
    expect(detectCommand).toHaveBeenCalledTimes(1);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Health check passed on attempt 1'));
  });

  it('succeeds on first attempt with url', async () => {
    vi.mocked(detectCommand).mockResolvedValueOnce({ found: true, output: '200' });
    
    const onLog = vi.fn();
    const result = await runHealthCheck({ url: 'http://localhost' }, onLog);

    expect(result.success).toBe(true);
    expect(detectCommand).toHaveBeenCalledWith('curl -sf -o /dev/null -w "%{http_code}" http://localhost');
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Health check passed on attempt 1 (HTTP 200)'));
  });

  it('retries on failure and succeeds on subsequent attempt', async () => {
    vi.mocked(detectCommand)
      .mockResolvedValueOnce({ found: false, output: '' })
      .mockResolvedValueOnce({ found: true, output: '200' });

    const onLog = vi.fn();
    
    const promise = runHealthCheck({ url: 'http://localhost' }, onLog);
    
    await vi.runAllTimersAsync();
    
    const result = await promise;

    expect(result.success).toBe(true);
    expect(detectCommand).toHaveBeenCalledTimes(2);
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Attempt 1/10 failed'));
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Health check passed on attempt 2'));
  });

  it('fails after maximum retries', async () => {
    vi.mocked(detectCommand).mockResolvedValue({ found: false, output: '' });

    const onLog = vi.fn();
    
    const promise = runHealthCheck({ command: 'failing-cmd' }, onLog);
    
    await vi.runAllTimersAsync();
    
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Health check failed after 10 attempts');
    expect(detectCommand).toHaveBeenCalledTimes(10);
  });
});
