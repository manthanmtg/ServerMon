/** @vitest-environment node */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockDetectPort } = vi.hoisted(() => ({
  mockDetectPort: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

vi.mock('../shell-executor', () => ({
  detectPort: mockDetectPort,
}));

import { runPortCheck } from './port-check';

function collectLogs() {
  const lines: string[] = [];
  return {
    lines,
    onLog: (line: string) => lines.push(line),
  };
}

describe('runPortCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success and logs available message for numeric ports', async () => {
    mockDetectPort.mockResolvedValue(false);
    const { lines, onLog } = collectLogs();

    const result = await runPortCheck(8080, onLog);

    expect(mockDetectPort).toHaveBeenCalledWith('8080');
    expect(result).toEqual({
      success: true,
      logs: ['Checking if port 8080 is available...', 'Port 8080 is available.'],
    });
    expect(lines).toEqual(['Checking if port 8080 is available...', 'Port 8080 is available.']);
  });

  it('returns success for string ports while preserving input format in logs', async () => {
    mockDetectPort.mockResolvedValue(false);
    const { lines, onLog } = collectLogs();

    const result = await runPortCheck('3000', onLog);

    expect(mockDetectPort).toHaveBeenCalledWith('3000');
    expect(result).toEqual({
      success: true,
      logs: ['Checking if port 3000 is available...', 'Port 3000 is available.'],
    });
    expect(lines).toEqual(['Checking if port 3000 is available...', 'Port 3000 is available.']);
  });

  it('returns failure when port is in use with detailed message', async () => {
    mockDetectPort.mockResolvedValue(true);
    const { lines, onLog } = collectLogs();

    const result = await runPortCheck(22, onLog);

    expect(result).toEqual({
      success: false,
      logs: [
        'Checking if port 22 is available...',
        'Port 22 is already in use. Choose a different port or stop the conflicting service.',
      ],
      error:
        'Port 22 is already in use. Choose a different port or stop the conflicting service.',
    });
    expect(lines).toEqual([
      'Checking if port 22 is available...',
      'Port 22 is already in use. Choose a different port or stop the conflicting service.',
    ]);
  });

  it('calls detectPort and propagates a rejection as an error', async () => {
    mockDetectPort.mockRejectedValue(new Error('failed to check'));
    const { lines, onLog } = collectLogs();

    await expect(runPortCheck(9090, onLog)).rejects.toThrow('failed to check');
    expect(lines).toEqual(['Checking if port 9090 is available...']);
  });

  it('supports ports with leading zeros by converting to string consistently', async () => {
    mockDetectPort.mockResolvedValue(false);
    const { lines, onLog } = collectLogs();

    const result = await runPortCheck('08080', onLog);

    expect(mockDetectPort).toHaveBeenCalledWith('08080');
    expect(result.logs[0]).toBe('Checking if port 08080 is available...');
    expect(lines).toEqual(['Checking if port 08080 is available...', 'Port 08080 is available.']);
  });

  it('always logs both start and completion messages in order', async () => {
    mockDetectPort.mockResolvedValue(false);
    const { lines, onLog } = collectLogs();

    await runPortCheck(4000, onLog);

    expect(lines).toEqual([
      'Checking if port 4000 is available...',
      'Port 4000 is available.',
    ]);
    expect(lines[1]).toMatch(/Port 4000 is available\./);
  });
});
