import * as os from 'os';
import * as path from 'path';
import { execPromise, getProcessResourceUsage, detectGitInfo } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type { AgentAdapter, AgentSession, AgentType, ConversationEntry } from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:opencode');

interface DbSession {
    id: string;
    slug: string;
    title: string;
    directory: string;
    time_created: number;
    time_updated: number;
}

export class OpenCodeAdapter implements AgentAdapter {
    readonly agentType: AgentType = 'opencode';
    readonly displayName = 'OpenCode';

    async detect(): Promise<AgentSession[]> {
        const sessions: AgentSession[] = [];
        const dbPath = path.join(os.homedir(), '.local/share/opencode/opencode.db');

        try {
            // 1. Get recent sessions from DB (updated in last 24 hours)
            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const sessionQuery = `SELECT id, slug, title, directory, time_created, time_updated FROM session WHERE time_updated > ${twentyFourHoursAgo} ORDER BY time_updated DESC LIMIT 50;`;
            const { stdout: sessionOut } = await execPromise(`sqlite3 -json ${dbPath} "${sessionQuery}"`);
            
            if (!sessionOut.trim()) return [];

            const dbSessions: DbSession[] = JSON.parse(sessionOut);
            
            // 2. Find all potentially relevant processes once
            const { stdout: psOut } = await execPromise('ps aux | grep -iE "opencode|openclaw" | grep -v grep');
            const availableProcesses: Array<{ pid: number; user: string; cwd: string }> = [];
            
            for (const line of psOut.trim().split('\n')) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length < 11) continue;
                const user = parts[0];
                const pid = parseInt(parts[1], 10);
                if (isNaN(pid)) continue;

                let cwd = '';
                try {
                    const lsof = await execPromise(`lsof -p ${pid} -Fn | grep "^n" | head -1`);
                    cwd = lsof.stdout.trim().replace(/^n/, '');
                } catch { /* skip */ }

                availableProcesses.push({ pid, user, cwd: cwd || '~' });
            }

            // 3. Match DB sessions to processes (Newest first)
            for (const dbSes of dbSessions) {
                // Find first available process matching this directory
                const procIndex = availableProcesses.findIndex(p => p.cwd === dbSes.directory);
                let matchedProc: { pid: number; user: string; cwd: string } | undefined;

                if (procIndex >= 0) {
                    matchedProc = availableProcesses[procIndex];
                    availableProcesses.splice(procIndex, 1); // Claimed!
                }
                
                try {
                    const session = await this.buildSession(dbSes, matchedProc);
                    if (session) sessions.push(session);
                } catch (err) {
                    log.debug(`Failed to build session for ${dbSes.id}`, err);
                }
            }
        } catch (err) {
            log.debug('OpenCode detection scan failed', err);
        }
        return sessions;
    }

    private async buildSession(dbSes: DbSession, proc?: { pid: number; user: string; cwd: string }): Promise<AgentSession | null> {
        const gitInfo = await detectGitInfo(dbSes.directory);
        const detailData = await this.extractSessionDetail(dbSes.id);

        // If no process, it's either idle or just finished
        const status = proc ? 'running' : 'idle';
        const resources = proc 
            ? await getProcessResourceUsage(proc.pid)
            : { cpuPercent: 0, memoryBytes: 0, memoryPercent: 0 };

        return {
            id: `opencode-${dbSes.id}`,
            agent: {
                type: 'opencode',
                displayName: 'OpenCode',
                model: detailData.model || 'big-pickle',
            },
            owner: {
                user: proc?.user || os.userInfo().username,
                pid: proc?.pid || 0,
            },
            environment: {
                workingDirectory: dbSes.directory,
                repository: gitInfo.repository,
                gitBranch: gitInfo.branch,
                host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
            },
            lifecycle: {
                startTime: new Date(dbSes.time_created).toISOString(),
                lastActivity: new Date(dbSes.time_updated).toISOString(),
                durationSeconds: Math.floor((dbSes.time_updated - dbSes.time_created) / 1000),
            },
            status,
            currentActivity: dbSes.title || dbSes.slug || 'Active session',
            resources,
            filesModified: detailData.filesModified,
            commandsExecuted: [],
            conversation: detailData.conversation,
            timeline: [],
            logs: [],
        };
    }

    private async extractSessionDetail(sessionId: string): Promise<{
        conversation: ConversationEntry[];
        model?: string;
        filesModified: string[];
    }> {
        const dbPath = path.join(os.homedir(), '.local/share/opencode/opencode.db');
        const data: {
            conversation: ConversationEntry[];
            model?: string;
            filesModified: string[];
        } = {
            conversation: [],
            filesModified: [],
        };

        try {
            // Fetch messages and parts
            const msgQuery = `
                SELECT m.time_created, p.data as part_data, m.data as msg_data
                FROM message m 
                JOIN part p ON m.id = p.message_id 
                WHERE m.session_id = '${sessionId}' 
                ORDER BY m.time_created ASC;
            `;
            const { stdout: msgOut } = await execPromise(`sqlite3 -json ${dbPath} "${msgQuery}"`);
            
            if (msgOut.trim()) {
                const rows = JSON.parse(msgOut);
                const conversation: ConversationEntry[] = [];

                for (const row of rows) {
                    let role: 'user' | 'assistant' | 'system' = 'system';
                    
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
        } catch (err) {
            log.debug('Failed to extract OpenCode session detail', err);
        }

        return data;
    }
}
