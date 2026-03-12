import { execPromise, getProcessResourceUsage, detectGitInfo } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type { AgentAdapter, AgentSession, AgentType } from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:claude-code');

export class ClaudeCodeAdapter implements AgentAdapter {
    readonly agentType: AgentType = 'claude-code';
    readonly displayName = 'Claude Code';

    async detect(): Promise<AgentSession[]> {
        const sessions: AgentSession[] = [];
        try {
            const pids = await this.findProcesses();
            for (const proc of pids) {
                try {
                    const session = await this.buildSession(proc);
                    if (session) sessions.push(session);
                } catch (err) {
                    log.debug(`Failed to build session for pid ${proc.pid}`, err);
                }
            }
        } catch (err) {
            log.debug('Claude Code detection scan failed', err);
        }
        return sessions;
    }

    private async findProcesses(): Promise<Array<{ pid: number; user: string; cwd: string; cmd: string }>> {
        try {
            const { stdout } = await execPromise('ps aux | grep -E "claude|claude-code" | grep -v grep');
            const results: Array<{ pid: number; user: string; cwd: string; cmd: string }> = [];
            for (const line of stdout.trim().split('\n')) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) continue;
                const user = parts[0];
                const pid = parseInt(parts[1], 10);
                const cmd = parts.slice(10).join(' ');
                if (isNaN(pid)) continue;
                if (!cmd.includes('claude')) continue;
                let cwd = '';
                try {
                    const lsof = await execPromise(`lsof -p ${pid} -Fn 2>/dev/null | grep "^n/" | head -1`);
                    cwd = lsof.stdout.trim().replace(/^n/, '');
                } catch { /* cwd detection optional */ }
                if (!cwd) {
                    try {
                        const pwdx = await execPromise(`readlink -f /proc/${pid}/cwd 2>/dev/null`);
                        cwd = pwdx.stdout.trim();
                    } catch { /* fallback */ }
                }
                results.push({ pid, user, cwd: cwd || '~', cmd });
            }
            return results;
        } catch {
            return [];
        }
    }

    private async buildSession(proc: { pid: number; user: string; cwd: string; cmd: string }): Promise<AgentSession | null> {
        const resources = await getProcessResourceUsage(proc.pid);
        const gitInfo = await detectGitInfo(proc.cwd);
        const now = new Date().toISOString();

        return {
            id: `claude-code-${proc.pid}`,
            agent: {
                type: 'claude-code',
                displayName: 'Claude Code',
                model: 'Claude',
            },
            owner: {
                user: proc.user,
                pid: proc.pid,
            },
            environment: {
                workingDirectory: proc.cwd,
                repository: gitInfo.repository,
                gitBranch: gitInfo.branch,
                host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
            },
            lifecycle: {
                startTime: now,
                lastActivity: now,
                durationSeconds: 0,
            },
            status: 'running',
            currentActivity: 'Active session',
            resources,
            filesModified: [],
            commandsExecuted: [],
            conversation: [],
            timeline: [],
            logs: [],
        };
    }
}
