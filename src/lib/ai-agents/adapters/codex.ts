import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execPromise, getProcessResourceUsage, detectGitInfo } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type { AgentAdapter, AgentSession, AgentType, ConversationEntry } from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:codex');

export class CodexAdapter implements AgentAdapter {
    readonly agentType: AgentType = 'codex';
    readonly displayName = 'Codex CLI';

    async detect(): Promise<AgentSession[]> {
        const sessions: AgentSession[] = [];
        try {
            // 1. Find running processes
            const runningProcs = await this.findProcesses();
            
            // 2. Find all rollout files
            const sessionsDir = path.join(os.homedir(), '.codex/sessions');
            if (!fs.existsSync(sessionsDir)) return [];

            const { stdout: fileList } = await execPromise(`find "${sessionsDir}" -name "rollout-*.jsonl" -type f`);
            const files = fileList.trim().split('\n')
                .filter(f => f.trim())
                .map(f => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);

            const claimedRolloutPaths = new Set<string>();

            // Build sessions for running processes first
            for (const proc of runningProcs) {
                // Try to find the latest rollout file matching this CWD
                const matchingFile = files.find(f => {
                    try {
                        const content = fs.readFileSync(f.path, 'utf8');
                        const firstLines = content.trim().split('\n').slice(0, 5);
                        for (const line of firstLines) {
                            const evt = JSON.parse(line);
                            if (evt.type === 'session_meta' && evt.payload.cwd === proc.cwd) return true;
                        }
                    } catch { /* ignore */ }
                    return false;
                });

                if (matchingFile) claimedRolloutPaths.add(matchingFile.path);
                
                try {
                    const session = await this.buildSessionFromProc(proc, matchingFile?.path);
                    if (session) sessions.push(session);
                } catch (err) {
                    log.debug(`Failed to build running session for pid ${proc.pid}`, err);
                }
            }

            // Build sessions for 10 most recent idle files
            const idleFiles = files
                .filter(f => !claimedRolloutPaths.has(f.path))
                .slice(0, 10);

            for (const fileObj of idleFiles) {
                try {
                    const session = await this.buildIdleSession(fileObj.path);
                    if (session) sessions.push(session);
                } catch (err) {
                    log.debug(`Failed to build idle session for ${fileObj.path}`, err);
                }
            }
        } catch (err) {
            log.debug('Codex detection scan failed', err);
        }
        return sessions;
    }

    private async findProcesses(): Promise<Array<{ pid: number; user: string; cwd: string; cmd: string }>> {
        try {
            // Use ps -axo to get PPID for de-duplication, and exclude grep/test-codex.ts
            const { stdout } = await execPromise('ps -axo pid,ppid,user,command | grep -i "codex" | grep -v "grep" | grep -v "test-codex.ts"');
            const allMatch: Array<{ pid: number; ppid: number; user: string; cmd: string }> = [];
            
            const selfPid = process.pid;
            
            for (const line of stdout.trim().split('\n')) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length < 4) continue;
                const pid = parseInt(parts[0], 10);
                const ppid = parseInt(parts[1], 10);
                const user = parts[2];
                const cmd = parts.slice(3).join(' ');
                
                if (isNaN(pid)) continue;
                if (pid === selfPid) continue; // Exclude self
                
                allMatch.push({ pid, ppid, user, cmd });
            }

            const results: Array<{ pid: number; user: string; cwd: string; cmd: string }> = [];
            const matchedPids = allMatch.map(p => p.pid);

            for (const proc of allMatch) {
                // If the parent of this process is ALSO in our matched list, it's likely a sub-process
                // we should only track the top-most process of the agent.
                if (matchedPids.includes(proc.ppid)) continue;
                
                let cwd = '';
                // Try lsof (macOS)
                try {
                    const lsof = await execPromise(`lsof -p ${proc.pid} -Fn | grep "^n" | head -1`);
                    cwd = lsof.stdout.trim().replace(/^n/, '');
                } catch { 
                    // Try /proc (Linux)
                    try {
                        const pwdx = await execPromise(`readlink -f /proc/${proc.pid}/cwd 2>/dev/null`);
                        cwd = pwdx.stdout.trim();
                    } catch { /* fallback */ }
                }
                
                results.push({ ...proc, cwd: cwd || '~' });
            }
            return results;
        } catch {
            return [];
        }
    }

    private async buildSessionFromProc(proc: { pid: number; user: string; cwd: string; cmd: string }, rolloutPath?: string): Promise<AgentSession | null> {
        const resources = await getProcessResourceUsage(proc.pid);
        const gitInfo = await detectGitInfo(proc.cwd);
        const historyData = await this.extractSessionData(rolloutPath || '', proc.cwd);
        const now = new Date().toISOString();

        return {
            id: `codex-${proc.pid}`,
            agent: {
                type: 'codex',
                displayName: 'Codex CLI',
                model: historyData.model || 'GPT',
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
                startTime: historyData.startTime || now,
                lastActivity: historyData.lastActivity || now,
                durationSeconds: historyData.durationSeconds || 0,
            },
            status: 'running',
            currentActivity: historyData.summary || 'Active session',
            resources,
            filesModified: [],
            commandsExecuted: [],
            conversation: historyData.conversation,
            timeline: [],
            logs: [],
        };
    }

    private async buildIdleSession(rolloutPath: string): Promise<AgentSession | null> {
        const historyData = await this.extractSessionData(rolloutPath);
        if (historyData.conversation.length === 0) return null;

        // Try to find the CWD from the rollout file
        let cwd = 'Past session';
        try {
            const content = fs.readFileSync(rolloutPath, 'utf8');
            const match = content.match(/"cwd":"([^"]+)"/);
            if (match) cwd = match[1];
        } catch { /* skip */ }

        const mockNow = historyData.lastActivity || new Date().toISOString();

        return {
            id: `codex-past-${path.basename(rolloutPath)}`,
            agent: {
                type: 'codex',
                displayName: 'Codex CLI',
                model: historyData.model || 'GPT',
            },
            owner: {
                user: os.userInfo().username,
                pid: 0,
            },
            environment: {
                workingDirectory: cwd,
                host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
            },
            lifecycle: {
                startTime: historyData.startTime || mockNow,
                lastActivity: historyData.lastActivity || mockNow,
                durationSeconds: historyData.durationSeconds || 0,
            },
            status: 'idle',
            currentActivity: historyData.summary || 'Past session',
            resources: { cpuPercent: 0, memoryBytes: 0, memoryPercent: 0 },
            filesModified: [],
            commandsExecuted: [],
            conversation: historyData.conversation,
            timeline: [],
            logs: [],
        };
    }

    private async extractSessionData(explicitRolloutPath?: string, cwdHint?: string): Promise<{
        conversation: ConversationEntry[];
        summary?: string;
        model?: string;
        startTime?: string;
        lastActivity?: string;
        durationSeconds?: number;
    }> {
        const data: {
            conversation: ConversationEntry[];
            summary?: string;
            model?: string;
            startTime?: string;
            lastActivity?: string;
            durationSeconds?: number;
        } = {
            conversation: [],
        };

        try {
            const codexDir = path.join(os.homedir(), '.codex');
            const sessionsDir = path.join(codexDir, 'sessions');
            if (!fs.existsSync(sessionsDir)) return data;

            let foundFile = explicitRolloutPath || '';
            
            if (!foundFile && cwdHint) {
                // Find latest rollout file by traversing year/month/day
                const { stdout: fileList } = await execPromise(`find "${sessionsDir}" -name "rollout-*.jsonl" -type f`);
                const files = fileList.trim().split('\n')
                    .filter(f => f.trim())
                    .map(f => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
                    .sort((a, b) => b.time - a.time);

                if (files.length === 0) return data;

                // Match by CWD hint
                for (const fileObj of files) {
                    const content = fs.readFileSync(fileObj.path, 'utf8');
                    if (content.includes(`"cwd":"${cwdHint}"`)) {
                        foundFile = fileObj.path;
                        break;
                    }
                }
            }

            if (!foundFile) return data;

            // Load session summary from index if available
            try {
                const indexPath = path.join(codexDir, 'session_index.jsonl');
                if (fs.existsSync(indexPath)) {
                    const rolloutId = path.basename(foundFile).replace(/^rollout-.*-/, '').replace(/\.jsonl$/, '');
                    const indexContent = fs.readFileSync(indexPath, 'utf8');
                    for (const line of indexContent.trim().split('\n')) {
                        const idx = JSON.parse(line);
                        if (idx.id === rolloutId) {
                            data.summary = idx.thread_name;
                            break;
                        }
                    }
                }
            } catch { /* ignore */ }

            const content = fs.readFileSync(foundFile, 'utf8');
            const conversation: ConversationEntry[] = [];

            for (const line of content.trim().split('\n')) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt.type === 'response_item' && evt.payload.type === 'message') {
                        const payload = evt.payload;
                        if (payload.role === 'developer') continue; // Skip system-like prompt messages
                        
                        let text = '';
                        if (Array.isArray(payload.content)) {
                            text = (payload.content as Array<{ text?: string }>)
                                .map(c => c.text || '')
                                .join('\n')
                                .trim();
                        } else if (typeof payload.content === 'string') {
                            text = payload.content;
                        }

                        if (text) {
                            conversation.push({
                                role: payload.role === 'user' ? 'user' : 'assistant',
                                content: text,
                                timestamp: evt.timestamp || new Date().toISOString(),
                            });
                        }
                    } else if (evt.type === 'session_meta' && evt.payload.model_provider) {
                        data.model = evt.payload.model_provider.toUpperCase();
                    }
                } catch { /* ignore */ }
            }

            data.conversation = conversation;
            if (conversation.length > 0) {
                data.startTime = conversation[0].timestamp;
                data.lastActivity = conversation[conversation.length - 1].timestamp;
                data.durationSeconds = Math.floor(
                    (new Date(data.lastActivity).getTime() - new Date(data.startTime).getTime()) / 1000
                );
            }
        } catch (err) {
            log.debug('Failed to extract Codex session data', err);
        }

        return data;
    }
}
