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
  getHostnameCached: () => 'localhost',
  readFileTailSync: (p: string) => mockReadFileSync(p, 'utf8'),
}));

import { ClaudeCodeAdapter } from './claude-code';

const TIMESTAMP_1 = '2024-01-01T10:00:00.000Z';
const TIMESTAMP_2 = '2024-01-01T10:05:00.000Z';

function makeJsonlLine(type: 'user' | 'assistant', content: string, timestamp = TIMESTAMP_1, model?: string) {
  return JSON.stringify({
    type,
    timestamp,
    message: {
      content,
      ...(model ? { model } : {}),
    },
  });
}

describe('ClaudeCodeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectGitInfo.mockResolvedValue({});
    mockExecPromise.mockResolvedValue({ stdout: 'localhost\n' });
  });

  describe('detect()', () => {
    it('returns empty array when no home directories found', async () => {
      mockDiscoverHomeDirs.mockReturnValue([]);
      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when .claude/projects dir does not exist', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(false);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when projects dir has no folders with conversations', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('builds sessions from project folders with .jsonl files', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['-root-repos-myproject'];
        if (p === '/home/user1/.claude/projects/-root-repos-myproject') return ['session.jsonl'];
        return [];
      });
      mockStatSync.mockImplementation((p: string) => ({
        isDirectory: () => !p.endsWith('.jsonl'),
        mtime: { getTime: () => now },
      }));

      const jsonlContent = [
        makeJsonlLine('user', 'Hello, help me with this code', TIMESTAMP_1),
        makeJsonlLine('assistant', 'Sure, I can help!', TIMESTAMP_2, 'claude-3-5-sonnet'),
      ].join('\n');
      mockReadFileSync.mockReturnValue(jsonlContent);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('claude-code-user1--root-repos-myproject');
      expect(sessions[0].agent.type).toBe('claude-code');
      expect(sessions[0].agent.displayName).toBe('Claude Code');
      expect(sessions[0].conversation).toHaveLength(2);
      expect(sessions[0].conversation[0].role).toBe('user');
      expect(sessions[0].conversation[1].role).toBe('assistant');
    });

    it('detects running status when file was recently modified', async () => {
      const recentlyModified = Date.now() - 30_000; // 30 seconds ago
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['myproject'];
        return ['session.jsonl'];
      });
      mockStatSync.mockImplementation(() => ({
        isDirectory: () => true,
        mtime: { getTime: () => recentlyModified },
      }));
      mockReadFileSync.mockReturnValue(makeJsonlLine('user', 'test'));

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions[0].status).toBe('running');
    });

    it('detects idle status when file was modified long ago', async () => {
      const longAgo = Date.now() - 300_000; // 5 minutes ago
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['myproject'];
        return ['session.jsonl'];
      });
      mockStatSync.mockImplementation(() => ({
        isDirectory: () => true,
        mtime: { getTime: () => longAgo },
      }));
      mockReadFileSync.mockReturnValue(makeJsonlLine('user', 'test'));

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions[0].status).toBe('idle');
    });

    it('skips project folders with no .jsonl files', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['emptyproject'];
        return []; // no jsonl files
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toHaveLength(0);
    });

    it('skips project folders with no conversation entries', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['emptyproject'];
        return ['session.jsonl'];
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });
      mockReadFileSync.mockReturnValue(''); // empty file

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toHaveLength(0);
    });

    it('handles array content in messages', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['proj'];
        return ['session.jsonl'];
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });

      const arrayContentLine = JSON.stringify({
        type: 'user',
        timestamp: TIMESTAMP_1,
        message: {
          content: [
            { type: 'text', text: 'First part' },
            { type: 'tool_use', text: '' },
            { type: 'text', text: 'Second part' },
          ],
        },
      });
      mockReadFileSync.mockReturnValue(arrayContentLine);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].conversation[0].content).toContain('First part');
      expect(sessions[0].conversation[0].content).toContain('Second part');
    });

    it('ignores malformed JSON lines', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['proj'];
        return ['session.jsonl'];
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });

      const content = [
        'not valid json {{{',
        makeJsonlLine('user', 'Valid message'),
        '{ incomplete',
      ].join('\n');
      mockReadFileSync.mockReturnValue(content);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].conversation).toHaveLength(1);
    });

    it('extracts model from assistant messages', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['proj'];
        return ['session.jsonl'];
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });

      const content = [
        makeJsonlLine('user', 'Hello'),
        makeJsonlLine('assistant', 'Hi there', TIMESTAMP_2, 'claude-3-opus'),
      ].join('\n');
      mockReadFileSync.mockReturnValue(content);

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions[0].agent.model).toBe('claude-3-opus');
    });

    it('uses git info when available', async () => {
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation((p: string) => {
        if (p === '/home/user1/.claude/projects') return ['proj'];
        return ['session.jsonl'];
      });
      mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });
      mockReadFileSync.mockReturnValue(makeJsonlLine('user', 'test'));
      mockDetectGitInfo.mockResolvedValue({ repository: 'my-repo', branch: 'main' });

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions[0].environment.repository).toBe('my-repo');
      expect(sessions[0].environment.gitBranch).toBe('main');
    });

    it('handles detection errors gracefully and returns empty array', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const adapter = new ClaudeCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });
  });

  describe('agentType and displayName', () => {
    it('has correct agentType', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.agentType).toBe('claude-code');
    });

    it('has correct displayName', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.displayName).toBe('Claude Code');
    });
  });
});
