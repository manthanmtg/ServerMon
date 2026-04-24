import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => {
  const m = {
    appendFile: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  };
  return {
    ...m,
    default: m,
  };
});

vi.mock('node:crypto', () => {
  const m = {
    randomUUID: vi.fn(),
  };
  return {
    ...m,
    default: m,
  };
});

import {
  getAIRunnerLogSessionId,
  getAIRunnerLogFilePath,
  writeAIRunnerLogEntry,
  parseAIRunnerLogLine,
  readAIRunnerLogEntries,
  readAIRunnerLogSlice,
  resetAIRunnerLogSession,
  getAIRunnerLogSize,
} from './logs';
import { appendFile, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

describe('ai-runner/logs', () => {
  const originalEnv = process.env;
  const testSessionId = '00000000-0000-4000-8000-000000000001';
  const entryId = '00000000-0000-4000-8000-000000000002';
  const newSessionId = '00000000-0000-4000-8000-000000000003';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AI_RUNNER_LOG_PATH;
    delete process.env.AI_RUNNER_LOG_SESSION_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAIRunnerLogSessionId', () => {
    it('should generate a new session ID if none exists', () => {
      vi.mocked(randomUUID).mockReturnValue(testSessionId);
      const sessionId = getAIRunnerLogSessionId();
      expect(sessionId).toBe(testSessionId);
      expect(process.env.AI_RUNNER_LOG_SESSION_ID).toBe(testSessionId);
    });

    it('should return existing session ID if it exists', () => {
      process.env.AI_RUNNER_LOG_SESSION_ID = 'existing-session-id';
      const sessionId = getAIRunnerLogSessionId();
      expect(sessionId).toBe('existing-session-id');
      expect(randomUUID).not.toHaveBeenCalled();
    });
  });

  describe('getAIRunnerLogFilePath', () => {
    it('should generate a new file path if none exists', () => {
      vi.mocked(randomUUID).mockReturnValue(testSessionId);
      const filePath = getAIRunnerLogFilePath();
      expect(filePath).toContain(`servermon-ai-runner-${testSessionId}.ndjson`);
      expect(process.env.AI_RUNNER_LOG_PATH).toBe(filePath);
    });

    it('should return existing file path if it exists', () => {
      process.env.AI_RUNNER_LOG_PATH = '/tmp/existing-log.ndjson';
      const filePath = getAIRunnerLogFilePath();
      expect(filePath).toBe('/tmp/existing-log.ndjson');
    });
  });

  describe('writeAIRunnerLogEntry', () => {
    it('should append a log entry to the file', async () => {
      vi.mocked(randomUUID).mockReturnValue(entryId);
      process.env.AI_RUNNER_LOG_SESSION_ID = 'session-id';
      process.env.AI_RUNNER_LOG_PATH = '/tmp/log.ndjson';

      const input = {
        level: 'info' as const,
        component: 'test',
        event: 'test-event',
        message: 'test-message',
        data: { key: 'value' },
      };

      await writeAIRunnerLogEntry(input);

      expect(appendFile).toHaveBeenCalledWith(
        '/tmp/log.ndjson',
        expect.stringContaining('"message":"test-message"'),
        'utf8'
      );
      expect(appendFile).toHaveBeenCalledWith(
        '/tmp/log.ndjson',
        expect.stringContaining(`"id":"${entryId}"`),
        'utf8'
      );
    });

    it('should not throw if appendFile fails', async () => {
      vi.mocked(appendFile).mockRejectedValue(new Error('disk full'));
      await expect(
        writeAIRunnerLogEntry({
          level: 'info',
          component: 'test',
          event: 'test-event',
          message: 'test-message',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('parseAIRunnerLogLine', () => {
    it('should parse a valid JSON line', () => {
      const entry = {
        id: '1',
        timestamp: '2024-01-01T00:00:00Z',
        level: 'info',
        component: 'test',
        event: 'test-event',
        message: 'test-message',
        sessionId: 'session-1',
        pid: 123,
        data: { foo: 'bar' },
      };
      const result = parseAIRunnerLogLine(JSON.stringify(entry));
      expect(result).toEqual(entry);
    });

    it('should return null for invalid JSON', () => {
      expect(parseAIRunnerLogLine('invalid')).toBeNull();
    });

    it('should return null for missing required fields', () => {
      expect(parseAIRunnerLogLine(JSON.stringify({ id: '1' }))).toBeNull();
    });

    it('should return null for empty line', () => {
      expect(parseAIRunnerLogLine('  ')).toBeNull();
    });
  });

  describe('readAIRunnerLogEntries', () => {
    it('should read and parse log entries', async () => {
      process.env.AI_RUNNER_LOG_PATH = '/tmp/log.ndjson';
      const entry1 = {
        id: '1',
        timestamp: 'T1',
        level: 'info',
        component: 'c',
        event: 'e',
        message: 'm1',
        sessionId: 's',
        pid: 1,
      };
      const entry2 = {
        id: '2',
        timestamp: 'T2',
        level: 'error',
        component: 'c',
        event: 'e',
        message: 'm2',
        sessionId: 's',
        pid: 1,
      };

      vi.mocked(readFile).mockResolvedValue(
        `${JSON.stringify(entry1)}\n${JSON.stringify(entry2)}\n`
      );

      const result = await readAIRunnerLogEntries();
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].message).toBe('m1');
      expect(result.entries[1].message).toBe('m2');
    });

    it('should return empty entries if file read fails', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('not found'));
      const result = await readAIRunnerLogEntries();
      expect(result.entries).toEqual([]);
    });

    it('should respect the limit', async () => {
      const entry = (i: number) =>
        JSON.stringify({
          id: `${i}`,
          timestamp: 'T',
          level: 'info',
          component: 'c',
          event: 'e',
          message: `m${i}`,
          sessionId: 's',
          pid: 1,
        });
      vi.mocked(readFile).mockResolvedValue(`${entry(1)}\n${entry(2)}\n${entry(3)}\n`);

      const result = await readAIRunnerLogEntries(2);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].message).toBe('m2');
      expect(result.entries[1].message).toBe('m3');
    });
  });

  describe('readAIRunnerLogSlice', () => {
    it('should read a slice of the file', async () => {
      process.env.AI_RUNNER_LOG_PATH = '/tmp/log.ndjson';
      vi.mocked(stat).mockResolvedValue({ size: 10 } as unknown as Awaited<
        ReturnType<typeof stat>
      >);
      vi.mocked(readFile).mockResolvedValue(
        Buffer.from('0123456789') as unknown as Awaited<ReturnType<typeof readFile>>
      );

      const result = await readAIRunnerLogSlice(5);
      expect(result.text).toBe('56789');
      expect(result.nextOffset).toBe(10);
    });

    it('should return empty if offset is beyond size', async () => {
      vi.mocked(stat).mockResolvedValue({ size: 100 } as unknown as Awaited<
        ReturnType<typeof stat>
      >);
      const result = await readAIRunnerLogSlice(150);
      expect(result.text).toBe('');
      expect(result.nextOffset).toBe(100);
    });

    it('should return empty if file read fails', async () => {
      vi.mocked(stat).mockRejectedValue(new Error('fail'));
      const result = await readAIRunnerLogSlice(0);
      expect(result.text).toBe('');
      expect(result.nextOffset).toBe(0);
    });
  });

  describe('resetAIRunnerLogSession', () => {
    it('should generate new session and cleanup old logs', async () => {
      vi.mocked(randomUUID).mockReturnValue(newSessionId);
      vi.mocked(readdir).mockResolvedValue([
        'servermon-ai-runner-old.ndjson',
        'other.txt',
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

      const newPath = await resetAIRunnerLogSession();

      expect(process.env.AI_RUNNER_LOG_SESSION_ID).toBe(newSessionId);
      expect(newPath).toContain(`servermon-ai-runner-${newSessionId}.ndjson`);
      expect(rm).toHaveBeenCalledWith(
        expect.stringContaining('servermon-ai-runner-old.ndjson'),
        expect.anything()
      );
      expect(rm).not.toHaveBeenCalledWith(expect.stringContaining('other.txt'), expect.anything());
      expect(writeFile).toHaveBeenCalled();
      expect(appendFile).toHaveBeenCalled(); // Initial log entry
    });
  });

  describe('getAIRunnerLogSize', () => {
    it('should return file size', async () => {
      vi.mocked(stat).mockResolvedValue({ size: 1234 } as unknown as Awaited<
        ReturnType<typeof stat>
      >);
      const size = await getAIRunnerLogSize();
      expect(size).toBe(1234);
    });

    it('should return 0 if stat fails', async () => {
      vi.mocked(stat).mockRejectedValue(new Error('fail'));
      const size = await getAIRunnerLogSize();
      expect(size).toBe(0);
    });
  });
});
