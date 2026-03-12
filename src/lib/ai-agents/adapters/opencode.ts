import * as os from 'os';
import * as path from 'path';
import { execPromise, getProcessResourceUsage, detectGitInfo } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type { AgentAdapter, AgentSession, AgentType, ConversationEntry } from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:opencode');

export class OpenCodeAdapter implements AgentAdapter {
    readonly agentType: AgentType = 'opencode';
    readonly displayName = 'OpenCode';

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
            log.debug('OpenCode detection scan failed', err);
        }
        return sessions;
    }

    private async findProcesses(): Promise<Array<{ pid: number; user: string; cwd: string; cmd: string }>> {
        try {
            const { stdout } = await execPromise('ps aux | grep -E "opencode" | grep -v grep');
            const results: Array<{ pid: number; user: string; cwd: string; cmd: string }> = [];
            for (const line of stdout.trim().split('\n')) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) continue;
                const user = parts[0];
                const pid = parseInt(parts[1], 10);
                const cmd = parts.slice(10).join(' ');
                if (isNaN(pid)) continue;
                if (!cmd.includes('opencode')) continue;
                
                let cwd = '';
                // Try /proc first (Linux)
                try {
                    const pwdx = await execPromise(`readlink -f /proc/${pid}/cwd 2>/dev/null`);
                    cwd = pwdx.stdout.trim();
                } catch { 
                    // Try lsof (macOS)
                    try {
                        const lsof = await execPromise(`lsof -p ${pid} -Fn | grep "^n" | head -1`);
                        cwd = lsof.stdout.trim().replace(/^n/, '');
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
        const dbData = await this.extractSessionData(proc.cwd);
        const now = new Date().toISOString();

        return {
            id: `opencode-${proc.pid}`,
            agent: {
                type: 'opencode',
                displayName: 'OpenCode',
                model: dbData.model,
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
                startTime: dbData.startTime || now,
                lastActivity: dbData.lastActivity || now,
                durationSeconds: dbData.durationSeconds || 0,
            },
            status: 'running',
            currentActivity: dbData.summary || 'Active session',
            resources,
            filesModified: dbData.filesModified,
            commandsExecuted: [],
            conversation: dbData.conversation,
            timeline: [],
            logs: [],
        };
    }

    private async extractSessionData(cwd: string): Promise<{
        conversation: ConversationEntry[];
        summary?: string;
        model?: string;
        startTime?: string;
        lastActivity?: string;
        durationSeconds?: number;
        filesModified: string[];
    }> {
        const dbPath = path.join(os.homedir(), '.local/share/opencode/opencode.db');
        const data: {
            conversation: ConversationEntry[];
            summary?: string;
            model?: string;
            startTime?: string;
            lastActivity?: string;
            durationSeconds?: number;
            filesModified: string[];
        } = {
            conversation: [],
            filesModified: [],
        };

        try {
            // Find session matching this CWD using -json for robust parsing
            const sessionQuery = `SELECT id, title, time_created, time_updated FROM session WHERE directory = '${cwd}' ORDER BY time_created DESC LIMIT 1;`;
            const { stdout: sessionOut } = await execPromise(`sqlite3 -json ${dbPath} "${sessionQuery}"`);
            
            if (sessionOut.trim()) {
                const sessions = JSON.parse(sessionOut);
                if (sessions.length > 0) {
                    const session = sessions[0];
                    data.summary = session.title;
                    data.startTime = new Date(session.time_created).toISOString();
                    data.lastActivity = new Date(session.time_updated).toISOString();
                    data.durationSeconds = Math.floor((session.time_updated - session.time_created) / 1000);

                    // Fetch messages and parts
                    // Note: 'role' is inside m.data JSON, not a column
                    const msgQuery = `
                        SELECT m.time_created, p.data as part_data, m.data as msg_data
                        FROM message m 
                        JOIN part p ON m.id = p.message_id 
                        WHERE m.session_id = '${session.id}' 
                        ORDER BY m.time_created ASC;
                    `;
                    const { stdout: msgOut } = await execPromise(`sqlite3 -json ${dbPath} "${msgQuery}"`);
                    
                    if (msgOut.trim()) {
                        const rows = JSON.parse(msgOut);
                        const conversation: ConversationEntry[] = [];

                        for (const row of rows) {
                            let role: 'user' | 'assistant' | 'system' = 'system';
                            
                            // Extract role and model from message data
                            if (row.msg_data) {
                                try {
                                    const msgData = JSON.parse(row.msg_data);
                                    role = msgData.role || 'assistant';
                                    if (!data.model) {
                                        if (typeof msgData.model === 'string') {
                                            data.model = msgData.model;
                                        } else if (msgData.model?.modelID) {
                                            data.model = msgData.model.modelID;
                                        }
                                    }
                                } catch { /* ignore */ }
                            }

                            // Extract text from part data
                            try {
                                const partData = JSON.parse(row.part_data);
                                if (partData.type === 'text' && partData.text) {
                                    conversation.push({
                                        role,
                                        content: partData.text,
                                        timestamp: new Date(row.time_created).toISOString(),
                                    });
                                }
                            } catch { /* ignore */ }
                        }
                        data.conversation = conversation;
                    }
                }
            }
        } catch (err) {
            log.debug('Failed to extract OpenCode session data', err);
        }

        return data;
    }
}
