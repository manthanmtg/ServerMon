/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { mockClaudeDetect, mockCodexDetect, mockOpenCodeDetect, mockKillProcess } = vi.hoisted(() => ({
    mockClaudeDetect: vi.fn(),
    mockCodexDetect: vi.fn(),
    mockOpenCodeDetect: vi.fn(),
    mockKillProcess: vi.fn(),
}));

vi.mock('./adapters/claude-code', () => ({
    // Paired explanation: using unknown and casting to avoid explicit any in mock constructor
    ClaudeCodeAdapter: function(this: unknown) {
        const self = this as { displayName: string; detect: typeof mockClaudeDetect };
        self.displayName = 'Claude Code';
        self.detect = mockClaudeDetect;
    },
}));
vi.mock('./adapters/codex', () => ({
    // Paired explanation: using unknown and casting to avoid explicit any in mock constructor
    CodexAdapter: function(this: unknown) {
        const self = this as { displayName: string; detect: typeof mockClaudeDetect };
        self.displayName = 'Codex';
        self.detect = mockCodexDetect;
    },
}));
vi.mock('./adapters/opencode', () => ({
    // Paired explanation: using unknown and casting to avoid explicit any in mock constructor
    OpenCodeAdapter: function(this: unknown) {
        const self = this as { displayName: string; detect: typeof mockClaudeDetect };
        self.displayName = 'OpenCode';
        self.detect = mockOpenCodeDetect;
    },
}));
vi.mock('./process-utils', () => ({
    killProcess: mockKillProcess,
}));

import { AIAgentsService } from './service';

function makeService() {
    return new AIAgentsService();
}

function makeSession(overrides: Record<string, unknown> = {}) {
    return {
        id: 'session-1',
        status: 'running',
        owner: { pid: 1234, username: 'user' },
        lifecycle: { startTime: new Date().toISOString() },
        ...overrides,
    };
}

describe('AIAgentsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClaudeDetect.mockResolvedValue([]);
        mockCodexDetect.mockResolvedValue([]);
        mockOpenCodeDetect.mockResolvedValue([]);
    });

    describe('getSnapshot()', () => {
        it('returns empty snapshot when no sessions', async () => {
            const service = makeService();
            const snapshot = await service.getSnapshot();
            expect(snapshot.sessions).toEqual([]);
            expect(snapshot.pastSessions).toEqual([]);
            expect(snapshot.summary.total).toBe(0);
            expect(snapshot.timestamp).toBeDefined();
        });

        it('separates running sessions from past sessions', async () => {
            const service = makeService();
            const running = makeSession({ id: 's1', status: 'running' });
            const completed = makeSession({ id: 's2', status: 'completed' });
            mockClaudeDetect.mockResolvedValue([running, completed]);

            const snapshot = await service.getSnapshot();
            expect(snapshot.sessions).toHaveLength(1);
            expect(snapshot.sessions[0].id).toBe('s1');
            expect(snapshot.pastSessions).toHaveLength(1);
            expect(snapshot.pastSessions[0].id).toBe('s2');
        });

        it('sorts past sessions by startTime descending (newest first)', async () => {
            const service = makeService();
            const old = makeSession({ id: 'old', status: 'completed', lifecycle: { startTime: '2024-01-01T00:00:00Z' } });
            const newer = makeSession({ id: 'newer', status: 'completed', lifecycle: { startTime: '2024-01-02T00:00:00Z' } });
            mockClaudeDetect.mockResolvedValue([old, newer]);

            const snapshot = await service.getSnapshot();
            expect(snapshot.pastSessions[0].id).toBe('newer');
            expect(snapshot.pastSessions[1].id).toBe('old');
        });

        it('includes summary with correct counts', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([
                makeSession({ id: 's1', status: 'running' }),
                makeSession({ id: 's2', status: 'idle' }),
                makeSession({ id: 's3', status: 'waiting' }),
                makeSession({ id: 's4', status: 'error' }),
                makeSession({ id: 's5', status: 'completed' }),
            ]);

            const snapshot = await service.getSnapshot();
            expect(snapshot.summary.total).toBe(5);
            expect(snapshot.summary.running).toBe(1);
            expect(snapshot.summary.idle).toBe(1);
            expect(snapshot.summary.waiting).toBe(1);
            expect(snapshot.summary.error).toBe(1);
            expect(snapshot.summary.completed).toBe(1);
        });
    });

    describe('detectSessions()', () => {
        it('aggregates sessions from all adapters', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'c1' })]);
            mockCodexDetect.mockResolvedValue([makeSession({ id: 'cx1' })]);
            mockOpenCodeDetect.mockResolvedValue([makeSession({ id: 'oc1' })]);

            const sessions = await service.detectSessions();
            expect(sessions).toHaveLength(3);
        });

        it('continues when one adapter fails', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'c1' })]);
            mockCodexDetect.mockRejectedValue(new Error('adapter crashed'));
            mockOpenCodeDetect.mockResolvedValue([]);

            const sessions = await service.detectSessions();
            expect(sessions).toHaveLength(1);
            expect(sessions[0].id).toBe('c1');
        });

        it('caches results within TTL', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'c1' })]);

            await service.detectSessions();
            await service.detectSessions();

            // Cache should prevent second call to adapter
            expect(mockClaudeDetect).toHaveBeenCalledTimes(1);
        });
    });

    describe('getSession()', () => {
        it('returns session by id', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'target-id' })]);

            const session = await service.getSession('target-id');
            expect(session).toBeDefined();
            expect(session?.id).toBe('target-id');
        });

        it('returns undefined when session not found', async () => {
            const service = makeService();
            const session = await service.getSession('nonexistent');
            expect(session).toBeUndefined();
        });
    });

    describe('terminateSession()', () => {
        it('sends SIGTERM to session process', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'sess-1', owner: { pid: 9999, username: 'u' } })]);
            mockKillProcess.mockResolvedValue(true);

            const result = await service.terminateSession('sess-1');
            expect(result).toBe(true);
            expect(mockKillProcess).toHaveBeenCalledWith(9999, 'SIGTERM');
        });

        it('returns false when session not found', async () => {
            const service = makeService();
            const result = await service.terminateSession('nonexistent');
            expect(result).toBe(false);
            expect(mockKillProcess).not.toHaveBeenCalled();
        });

        it('invalidates cache after successful kill', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'sess-1', owner: { pid: 1000, username: 'u' } })]);
            mockKillProcess.mockResolvedValue(true);

            await service.detectSessions(); // populate cache
            expect(mockClaudeDetect).toHaveBeenCalledTimes(1);

            await service.terminateSession('sess-1'); // invalidates cache
            await service.detectSessions(); // should re-scan

            expect(mockClaudeDetect.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('killSession()', () => {
        it('sends SIGKILL to session process', async () => {
            const service = makeService();
            mockClaudeDetect.mockResolvedValue([makeSession({ id: 'sess-2', owner: { pid: 8888, username: 'u' } })]);
            mockKillProcess.mockResolvedValue(true);

            const result = await service.killSession('sess-2');
            expect(result).toBe(true);
            expect(mockKillProcess).toHaveBeenCalledWith(8888, 'SIGKILL');
        });

        it('returns false when session not found', async () => {
            const service = makeService();
            const result = await service.killSession('nonexistent');
            expect(result).toBe(false);
            expect(mockKillProcess).not.toHaveBeenCalled();
        });
    });

    describe('registerAdapter()', () => {
        it('registers additional adapters', async () => {
            const service = makeService();
            const extraDetect = vi.fn().mockResolvedValue([makeSession({ id: 'extra-1' })]);
            service.registerAdapter({ agentType: 'custom' as never, displayName: 'Extra', detect: extraDetect });

            const sessions = await service.detectSessions();
            expect(sessions.some(s => s.id === 'extra-1')).toBe(true);
            expect(extraDetect).toHaveBeenCalled();
        });
    });
});
