/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const {
  mockExistsSync,
  mockStatSync,
  mockReadFileSync,
  mockDiscoverHomeDirs,
  mockDetectGitInfo,
  mockExecPromise,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockDiscoverHomeDirs: vi.fn(),
  mockDetectGitInfo: vi.fn(),
  mockExecPromise: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('../process-utils', () => ({
  discoverHomeDirs: mockDiscoverHomeDirs,
  detectGitInfo: mockDetectGitInfo,
  execPromise: mockExecPromise,
}));

import { CodexAdapter } from './codex';

const TIMESTAMP_1 = '2024-01-01T10:00:00.000Z';
const TIMESTAMP_2 = '2024-01-01T10:05:00.000Z';

function makeSessionMetaLine(cwd: string, model = 'openai') {
  return JSON.stringify({
    type: 'session_meta',
    timestamp: TIMESTAMP_1,
    payload: { cwd, model_provider: model },
  });
}

function makeResponseItemLine(role: 'user' | 'assistant', text: string, timestamp = TIMESTAMP_1) {
  return JSON.stringify({
    type: 'response_item',
    timestamp,
    payload: {
      type: 'message',
      role,
      content: [{ text }],
    },
  });
}

describe('CodexAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectGitInfo.mockResolvedValue({});
    mockExecPromise.mockResolvedValue({ stdout: 'localhost\n' });
  });

  describe('detect()', () => {
    it('returns empty array when no home directories found', async () => {
      mockDiscoverHomeDirs.mockReturnValue([]);
      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when .codex/sessions dir does not exist', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(false);
      // execPromise returns empty to simulate no files
      mockExecPromise.mockResolvedValue({ stdout: '' });

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when no rollout files found', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: '' };
        return { stdout: 'localhost\n' };
      });

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('builds sessions from rollout files', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-abc-123.jsonl';
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => now } });

      const content = [
        makeSessionMetaLine('/home/user1/project', 'openai'),
        makeResponseItemLine('user', 'Hello, help me!', TIMESTAMP_1),
        makeResponseItemLine('assistant', 'Sure!', TIMESTAMP_2),
      ].join('\n');
      mockReadFileSync.mockReturnValue(content);

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toContain('codex-user1');
      expect(sessions[0].agent.type).toBe('codex');
      expect(sessions[0].agent.displayName).toBe('Codex CLI');
      expect(sessions[0].conversation).toHaveLength(2);
      expect(sessions[0].environment.workingDirectory).toBe('/home/user1/project');
    });

    it('marks session as running when file was recently modified', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-xyz.jsonl';
      const recentTime = Date.now() - 30_000;
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => recentTime } });
      mockReadFileSync.mockReturnValue(
        makeResponseItemLine('user', 'Working on it', TIMESTAMP_1)
      );

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].status).toBe('running');
    });

    it('marks session as idle when file was modified long ago', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-old.jsonl';
      const longAgo = Date.now() - 300_000;
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => longAgo } });
      mockReadFileSync.mockReturnValue(makeResponseItemLine('user', 'Old message'));

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].status).toBe('idle');
    });

    it('skips developer role messages', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-dev.jsonl';
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => now } });

      const devMsg = JSON.stringify({
        type: 'response_item',
        timestamp: TIMESTAMP_1,
        payload: { type: 'message', role: 'developer', content: [{ text: 'System prompt' }] },
      });
      const userMsg = makeResponseItemLine('user', 'Actual question');
      mockReadFileSync.mockReturnValue([devMsg, userMsg].join('\n'));

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].conversation).toHaveLength(1);
      expect(sessions[0].conversation[0].role).toBe('user');
    });

    it('loads session summary from index file when available', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-abc-123.jsonl';
      const now = Date.now();
      const rolloutId = '123';
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => now } });

      const indexContent = JSON.stringify({ id: rolloutId, thread_name: 'My Codex Session' });
      mockReadFileSync.mockImplementation((p: string) => {
        if ((p as string).includes('session_index.jsonl')) return indexContent;
        return makeResponseItemLine('user', 'Hello');
      });

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].currentActivity).toContain('My Codex Session');
    });

    it('handles detection errors gracefully', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockRejectedValue(new Error('Permission denied'));

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('ignores skipped sessions with empty conversations', async () => {
      const rolloutPath = '/home/user1/.codex/sessions/rollout-empty.jsonl';
      const now = Date.now();
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('find')) return { stdout: rolloutPath };
        return { stdout: 'localhost\n' };
      });
      mockStatSync.mockReturnValue({ mtime: { getTime: () => now } });
      mockReadFileSync.mockReturnValue(''); // empty file

      const adapter = new CodexAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('agentType and displayName', () => {
    it('has correct agentType', () => {
      const adapter = new CodexAdapter();
      expect(adapter.agentType).toBe('codex');
    });

    it('has correct displayName', () => {
      const adapter = new CodexAdapter();
      expect(adapter.displayName).toBe('Codex CLI');
    });
  });
});
