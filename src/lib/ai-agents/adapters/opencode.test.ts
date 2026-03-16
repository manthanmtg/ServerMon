/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const {
  mockExistsSync,
  mockDiscoverHomeDirs,
  mockDetectGitInfo,
  mockExecPromise,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockDiscoverHomeDirs: vi.fn(),
  mockDetectGitInfo: vi.fn(),
  mockExecPromise: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('../process-utils', () => ({
  discoverHomeDirs: mockDiscoverHomeDirs,
  detectGitInfo: mockDetectGitInfo,
  execPromise: mockExecPromise,
}));

import { OpenCodeAdapter } from './opencode';

const NOW = Date.now();
const TWENTY_MIN_AGO = NOW - 20 * 60 * 1000;
const TWO_DAYS_AGO = NOW - 2 * 24 * 60 * 60 * 1000;

function makeDbSession(overrides: Record<string, unknown> = {}) {
  return JSON.stringify([
    {
      id: 'sess-abc-123',
      slug: 'my-session',
      title: 'Fixing a bug',
      directory: '/home/user1/project',
      time_created: TWENTY_MIN_AGO,
      time_updated: TWENTY_MIN_AGO + 5000,
      ...overrides,
    },
  ]);
}

function makeMessages(text: string, role = 'user') {
  return JSON.stringify([
    {
      time_created: TWENTY_MIN_AGO,
      msg_data: JSON.stringify({ role, model: 'gpt-4o' }),
      part_data: JSON.stringify({ type: 'text', text }),
    },
  ]);
}

describe('OpenCodeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectGitInfo.mockResolvedValue({});
    mockExecPromise.mockResolvedValue({ stdout: 'localhost\n' });
  });

  describe('detect()', () => {
    it('returns empty array when no home directories found', async () => {
      mockDiscoverHomeDirs.mockReturnValue([]);
      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when opencode.db does not exist', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(false);

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('returns empty array when sqlite3 returns no sessions', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('sqlite3')) return { stdout: '' };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('builds sessions from sqlite data', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) return { stdout: makeDbSession() };
        if (cmd.includes('SELECT m.time_created')) return { stdout: makeMessages('Hello from user') };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('opencode-user1-sess-abc-123');
      expect(sessions[0].agent.type).toBe('opencode');
      expect(sessions[0].agent.displayName).toBe('OpenCode');
      expect(sessions[0].conversation).toHaveLength(1);
      expect(sessions[0].conversation[0].role).toBe('user');
      expect(sessions[0].conversation[0].content).toBe('Hello from user');
    });

    it('marks session as running when recently updated', async () => {
      const recentlyUpdated = Date.now() - 30_000; // 30 seconds ago
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) {
          return {
            stdout: JSON.stringify([{
              id: 'sess-1', slug: 'sess', title: 'Active', directory: '/tmp',
              time_created: recentlyUpdated - 1000, time_updated: recentlyUpdated,
            }]),
          };
        }
        if (cmd.includes('SELECT m.time_created')) return { stdout: makeMessages('Hi') };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].status).toBe('running');
    });

    it('marks session as idle when not recently updated', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) {
          return {
            stdout: JSON.stringify([{
              id: 'sess-old', slug: 'sess', title: 'Old', directory: '/tmp',
              time_created: TWO_DAYS_AGO, time_updated: TWO_DAYS_AGO + 1000,
            }]),
          };
        }
        if (cmd.includes('SELECT m.time_created')) return { stdout: makeMessages('Old message') };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].status).toBe('idle');
    });

    it('extracts model from message data', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) return { stdout: makeDbSession() };
        if (cmd.includes('SELECT m.time_created')) {
          return {
            stdout: JSON.stringify([{
              time_created: NOW,
              msg_data: JSON.stringify({ role: 'assistant', model: 'claude-3-5-sonnet' }),
              part_data: JSON.stringify({ type: 'text', text: 'Here is the answer' }),
            }]),
          };
        }
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].agent.model).toBe('claude-3-5-sonnet');
    });

    it('extracts model from modelID field', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) return { stdout: makeDbSession() };
        if (cmd.includes('SELECT m.time_created')) {
          return {
            stdout: JSON.stringify([{
              time_created: NOW,
              msg_data: JSON.stringify({ role: 'assistant', model: { modelID: 'gpt-4-turbo' } }),
              part_data: JSON.stringify({ type: 'text', text: 'Answer here' }),
            }]),
          };
        }
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].agent.model).toBe('gpt-4-turbo');
    });

    it('uses title or slug as currentActivity', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) {
          return {
            stdout: JSON.stringify([{
              id: 'sess-t', slug: 'my-slug', title: 'My Title',
              directory: '/tmp', time_created: TWENTY_MIN_AGO, time_updated: TWENTY_MIN_AGO,
            }]),
          };
        }
        if (cmd.includes('SELECT m.time_created')) return { stdout: makeMessages('Hi') };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].currentActivity).toBe('My Title');
    });

    it('calculates duration in seconds from timestamps', async () => {
      const start = NOW - 120_000; // 2 minutes ago
      const end = NOW - 60_000;    // 1 minute ago
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) {
          return {
            stdout: JSON.stringify([{
              id: 'sess-d', slug: 'sess', title: 'Timed', directory: '/tmp',
              time_created: start, time_updated: end,
            }]),
          };
        }
        if (cmd.includes('SELECT m.time_created')) return { stdout: makeMessages('Hi') };
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions[0].lifecycle.durationSeconds).toBe(60);
    });

    it('handles detection errors gracefully', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);
      mockExecPromise.mockRejectedValue(new Error('sqlite3 not found'));

      const adapter = new OpenCodeAdapter();
      const sessions = await adapter.detect();
      expect(sessions).toEqual([]);
    });

    it('handles malformed message data gracefully', async () => {
      mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
      mockExistsSync.mockReturnValue(true);

      mockExecPromise.mockImplementation(async (cmd: string) => {
        if (cmd.includes('SELECT id, slug')) return { stdout: makeDbSession() };
        if (cmd.includes('SELECT m.time_created')) {
          return {
            stdout: JSON.stringify([
              { time_created: NOW, msg_data: 'not-json{{{', part_data: JSON.stringify({ type: 'text', text: 'Still valid' }) },
              { time_created: NOW + 1000, msg_data: JSON.stringify({ role: 'user' }), part_data: 'invalid-json' },
            ]),
          };
        }
        return { stdout: 'localhost\n' };
      });

      const adapter = new OpenCodeAdapter();
      // Should not throw; may produce partial or empty conversation
      await expect(adapter.detect()).resolves.toBeDefined();
    });
  });

  describe('agentType and displayName', () => {
    it('has correct agentType', () => {
      const adapter = new OpenCodeAdapter();
      expect(adapter.agentType).toBe('opencode');
    });

    it('has correct displayName', () => {
      const adapter = new OpenCodeAdapter();
      expect(adapter.displayName).toBe('OpenCode');
    });
  });
});
