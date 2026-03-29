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

import { ClaudeCodeAdapter } from './claude-code';
import { CodexAdapter } from './codex';
import { OpenCodeAdapter } from './opencode';

describe('AI Agents Data Enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectGitInfo.mockResolvedValue({});
    mockExecPromise.mockResolvedValue({ stdout: 'localhost\n' });
  });

  it('ClaudeCodeAdapter extracts tokens and tools correctly', async () => {
    const now = Date.now();
    mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/home/user1/.claude/projects') return ['proj'];
      if (p === '/home/user1/.claude/projects/proj') return ['session.jsonl'];
      return [];
    });
    mockStatSync.mockImplementation((p: string) => ({
      isDirectory: () => !(p as string).endsWith('.jsonl'),
      mtime: { getTime: () => now }
    }));

    const jsonl = [
      JSON.stringify({
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        message: { content: 'hello' }
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2024-01-01T10:00:05Z',
        message: {
          model: 'claude-3-5-sonnet',
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            { type: 'text', text: 'Thinking...' },
            { type: 'tool_use', name: 'write_to_file', input: { path: 'test.ts' } },
            { type: 'tool_use', name: 'run_command', input: { command: 'ls' } }
          ]
        }
      })
    ].join('\n');
    mockReadFileSync.mockReturnValue(jsonl);

    const adapter = new ClaudeCodeAdapter();
    const sessions = await adapter.detect();

    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    
    // Tokens
    expect(session.usage!.inputTokens).toBe(100);
    expect(session.usage!.outputTokens).toBe(50);
    expect(session.usage!.totalTokens).toBe(150);

    // Timeline
    expect(session.timeline).toHaveLength(2);
    expect(session.timeline[0].action).toBe('Tool Call: write_to_file');
    expect(session.timeline[1].action).toBe('Tool Call: run_command');

    // History
    expect(session.filesModified).toContain('test.ts');
    expect(session.commandsExecuted).toContain('ls');

    // Logs
    expect(session.logs.length).toBeGreaterThan(0);
    expect(session.logs[0]).toContain('[2024-01-01T10:00:00Z] user');
  });

  it('ClaudeCodeAdapter detects active PID if process found', async () => {
    const now = Date.now();
    mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
    mockExistsSync.mockImplementation((p: string) => {
        if (p === '/home/user1/project') return true;
        return true;
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/home/user1/.claude/projects') return ['-home-user1-project'];
      return ['session.jsonl'];
    });
    // Return recent time to mark as running
    mockStatSync.mockReturnValue({ isDirectory: () => true, mtime: { getTime: () => now } });
    mockReadFileSync.mockReturnValue(JSON.stringify({ type: 'user', message: { content: 'x' } }));
    
    // Mock execPromise for hostname and ps
    mockExecPromise.mockImplementation(async (cmd: string) => {
      if (cmd.includes('ps aux')) return { stdout: '12345\n' };
      return { stdout: 'localhost\n' };
    });

    const adapter = new ClaudeCodeAdapter();
    const sessions = await adapter.detect();

    expect(sessions[0].status).toBe('running');
    expect(sessions[0].owner.pid).toBe(12345);
  });

  it('CodexAdapter extracts tokens and tools correctly', async () => {
    const now = Date.now();
    mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
    mockExistsSync.mockReturnValue(true);
    mockExecPromise.mockImplementation(async (cmd: string) => {
      if (cmd.includes('find')) return { stdout: '/home/user1/.codex/sessions/rollout-1.jsonl' };
      return { stdout: 'localhost\n' };
    });
    mockStatSync.mockReturnValue({ mtime: { getTime: () => now } });

    const jsonl = [
      JSON.stringify({
        type: 'session_meta',
        payload: { cwd: '/proj', model_provider: 'openai' }
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: '2024-01-01T10:00:05Z',
        usage: { prompt_tokens: 50, completion_tokens: 25 },
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { text: 'Done', type: 'tool_use', tool_call: { name: 'write', input: { path: 'f.txt' } } }
          ]
        }
      })
    ].join('\n');
    mockReadFileSync.mockReturnValue(jsonl);

    const adapter = new CodexAdapter();
    const sessions = await adapter.detect();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].usage!.totalTokens).toBe(75);
    expect(sessions[0].timeline).toHaveLength(1);
    expect(sessions[0].filesModified).toContain('f.txt');
  });

  it('OpenCodeAdapter extracts tokens and tools correctly', async () => {
    mockDiscoverHomeDirs.mockReturnValue([{ username: 'user1', homeDir: '/home/user1' }]);
    mockExistsSync.mockReturnValue(true);
    
    mockExecPromise.mockImplementation(async (cmd: string) => {
      if (cmd.includes('SELECT id, slug')) {
        return { stdout: JSON.stringify([{ id: 's1', title: 'Session 1', directory: '/p', time_created: 1000, time_updated: 2000 }]) };
      }
      if (cmd.includes('SELECT m.time_created')) {
        return { 
          stdout: JSON.stringify([
            { 
              time_created: 1500, 
              msg_data: JSON.stringify({ role: 'assistant', model: 'gpt-4' }),
              part_data: JSON.stringify({ type: 'text', text: 'Ok' }) 
            },
            { 
              time_created: 1600, 
              part_data: JSON.stringify({ type: 'tool', tool_name: 'write_file', input: { path: 'a.js' } }) 
            },
            { 
              time_created: 1700, 
              part_data: JSON.stringify({ type: 'step-finish', tokens: { input: 200, output: 100 } }) 
            }
          ]) 
        };
      }
      return { stdout: 'localhost\n' };
    });

    const adapter = new OpenCodeAdapter();
    const sessions = await adapter.detect();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].usage!.inputTokens).toBe(200);
    expect(sessions[0].usage!.outputTokens).toBe(100);
    expect(sessions[0].timeline).toHaveLength(1);
    expect(sessions[0].timeline[0].action).toBe('Tool Call: write_file');
    expect(sessions[0].filesModified).toContain('a.js');
  });
});
