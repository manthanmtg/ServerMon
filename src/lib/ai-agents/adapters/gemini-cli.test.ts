/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const {
  mockExistsSync,
  mockReaddirSync,
  mockStatSync,
  mockReadFileSync,
  mockDiscoverHomeDirs,
  mockDetectGitInfo,
  mockExecPromise,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockDiscoverHomeDirs: vi.fn(),
  mockDetectGitInfo: vi.fn(),
  mockExecPromise: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('../process-utils', () => ({
  discoverHomeDirs: mockDiscoverHomeDirs,
  detectGitInfo: mockDetectGitInfo,
  execPromise: mockExecPromise,
}));

import { GeminiCLIAdapter } from './gemini-cli';
import type { GeminiMessage } from '@/modules/ai-agents/types';

const TIMESTAMP_START = '2024-04-20T10:00:00.000Z';
const TIMESTAMP_UPDATE = '2024-04-20T10:05:00.000Z';

function makeSessionJson(
  sessionId: string,
  projectHash: string,
  messages: Partial<GeminiMessage>[] = []
) {
  return JSON.stringify({
    sessionId,
    projectHash,
    startTime: TIMESTAMP_START,
    lastUpdated: TIMESTAMP_UPDATE,
    messages: messages as GeminiMessage[],
  });
}

describe('GeminiCLIAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectGitInfo.mockResolvedValue({});
    mockExecPromise.mockResolvedValue({ stdout: 'localhost\n' });
  });

  describe('detect()', () => {
    it('returns empty array when no home directories found', async () => {
      mockDiscoverHomeDirs.mockReturnValue([]);
      const adapter = new GeminiCLIAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when .gemini/tmp dir does not exist', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'root', homeDir: '/root' }]);
      mockExistsSync.mockImplementation((p: string) => {
        if (p === '/root/.gemini/tmp') return false;
        return true;
      });

      const adapter = new GeminiCLIAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('builds sessions from project folders with session JSON files', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'root', homeDir: '/root' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/root/.gemini/tmp') return ['servermon'];
        if (p === '/root/.gemini/tmp/servermon/chats') return ['session-123.json'];
        return [];
      });
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => !p.endsWith('.json'),
        mtime: { getTime: () => now },
      }));

      const projectsJson = JSON.stringify({
        projects: {
          '/root/repos/ServerMon': 'servermon',
        },
      });
      
      const sessionJson = makeSessionJson('123', 'hash', [
        { type: 'user', content: [{ text: 'hi' }], timestamp: TIMESTAMP_START },
        { type: 'gemini', content: 'hello', timestamp: TIMESTAMP_UPDATE, model: 'gemini-pro' },
      ]);

      mockReadFileSync.mockImplementation((p: string) => {
        if (p === '/root/.gemini/projects.json') return projectsJson;
        if (p.includes('session-123.json')) return sessionJson;
        return '[]';
      });

      const adapter = new GeminiCLIAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('gemini-cli-root-123');
      expect(sessions[0].agent.type).toBe('gemini-cli');
      expect(sessions[0].agent.model).toBe('gemini-pro');
      expect(sessions[0].conversation).toHaveLength(2);
      expect(sessions[0].conversation[0].role).toBe('user');
      expect(sessions[0].conversation[1].role).toBe('assistant');
      expect(sessions[0].environment.workingDirectory).toBe('/root/repos/ServerMon');
    });

    it('detects tool calls and populates timeline and commands', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'root', homeDir: '/root' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/root/.gemini/tmp') return ['servermon'];
        if (p === '/root/.gemini/tmp/servermon/chats') return ['session-tool.json'];
        return [];
      });
      mockStatSync.mockImplementation(() => ({
        isDirectory: () => true,
        mtime: { getTime: () => Date.now() },
      }));

      const sessionJson = makeSessionJson('tool-id', 'hash', [
        {
          type: 'gemini',
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              name: 'run_shell_command',
              args: { command: 'ls -la', description: 'Listing files' },
            },
            {
              id: 'tc2',
              name: 'write_file',
              args: { file_path: 'test.txt', content: 'hello' },
            },
          ],
        },
      ]);

      mockReadFileSync.mockImplementation((p: string) => {
        if (p.includes('projects.json')) return '{}';
        if (p.includes('session-tool.json')) return sessionJson;
        return '[]';
      });

      const adapter = new GeminiCLIAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].timeline).toHaveLength(2);
      expect(sessions[0].timeline[0].action).toBe('Tool: run_shell_command');
      expect(sessions[0].commandsExecuted).toContain('ls -la');
      expect(sessions[0].filesModified).toContain('test.txt');
    });

    it('populates logs from logs.json', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'root', homeDir: '/root' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/root/.gemini/tmp') return ['servermon'];
        if (p === '/root/.gemini/tmp/servermon/chats') return ['session-logs.json'];
        return [];
      });
      mockStatSync.mockImplementation(() => ({
        isDirectory: () => true,
        mtime: { getTime: () => Date.now() },
      }));

      const sessionJson = makeSessionJson('logs-id', 'hash', [
        { type: 'user', content: 'test' }
      ]);
      const logsJson = JSON.stringify([
        { sessionId: 'logs-id', type: 'user', message: 'test', timestamp: TIMESTAMP_START },
        { sessionId: 'other-id', type: 'user', message: 'other', timestamp: TIMESTAMP_START },
      ]);

      mockReadFileSync.mockImplementation((p: string) => {
        if (p.includes('projects.json')) return '{}';
        if (p.includes('session-logs.json')) return sessionJson;
        if (p.includes('logs.json')) return logsJson;
        return '[]';
      });

      const adapter = new GeminiCLIAdapter();
      const sessions = await adapter.detect();

      expect(sessions[0].logs).toHaveLength(1);
      expect(sessions[0].logs[0]).toContain('test');
      expect(sessions[0].logs[0]).not.toContain('other');
    });
  });
});
