import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execPromise, getProcessResourceUsage, detectGitInfo } from '../process-utils';
import { createLogger } from '@/lib/logger';
import type { AgentAdapter, AgentSession, AgentType, ConversationEntry } from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:claude-code');

export class ClaudeCodeAdapter implements AgentAdapter {
    readonly agentType: AgentType = 'claude-code';
    readonly displayName = 'Claude Code';

    async detect(): Promise<AgentSession[]> {
        const sessions: AgentSession[] = [];
        const projectsDir = path.join(os.homedir(), '.claude/projects');
        
        try {
            // 1. Find running processes
            const runningProcs = await this.findProcesses();
            
            // 2. Scan projects directory for all historical contexts
            if (fs.existsSync(projectsDir)) {
                const projectFolders = fs.readdirSync(projectsDir)
                    .filter(f => fs.statSync(path.join(projectsDir, f)).isDirectory());
                
                const claimedProjectFolders = new Set<string>();

                // Build sessions for running processes first
                for (const proc of runningProcs) {
                    const projectFolderName = proc.cwd.replace(/[^a-zA-Z0-9]/g, '-');
                    claimedProjectFolders.add(projectFolderName);
                    
                    try {
                        const session = await this.buildSessionFromProc(proc, projectFolderName);
                        if (session) sessions.push(session);
                    } catch (err) {
                        log.debug(`Failed to build running session for pid ${proc.pid}`, err);
                    }
                }

                // Build sessions for a few recent idle projects (limit to 10 for performance)
                const idleFolders = projectFolders
                    .filter(f => !claimedProjectFolders.has(f))
                    .map(f => ({ name: f, time: fs.statSync(path.join(projectsDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.time - a.time)
                    .slice(0, 10);

                for (const folder of idleFolders) {
                    try {
                        const session = await this.buildIdleSession(folder.name);
                        if (session) sessions.push(session);
                    } catch (err) {
                        log.debug(`Failed to build idle session for ${folder.name}`, err);
                    }
                }
            } else {
                // Fallback to just running processes if projects dir not found
                for (const proc of runningProcs) {
                    const session = await this.buildSessionFromProc(proc, proc.cwd.replace(/[^a-zA-Z0-9]/g, '-'));
                    if (session) sessions.push(session);
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
                // Try lsof (macOS)
                try {
                    const lsof = await execPromise(`lsof -p ${pid} -Fn | grep "^n" | head -1`);
                    cwd = lsof.stdout.trim().replace(/^n/, '');
                } catch { 
                    // Try /proc (Linux)
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

    private async buildSessionFromProc(proc: { pid: number; user: string; cwd: string; cmd: string }, projectFolderName: string): Promise<AgentSession | null> {
        const resources = await getProcessResourceUsage(proc.pid);
        const gitInfo = await detectGitInfo(proc.cwd);
        const historyData = await this.extractSessionData(projectFolderName);
        const now = new Date().toISOString();

        return {
            id: `claude-code-${proc.pid}`,
            agent: {
                type: 'claude-code',
                displayName: 'Claude Code',
                model: historyData.model || 'Claude',
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

    private async buildIdleSession(projectFolderName: string): Promise<AgentSession | null> {
        const historyData = await this.extractSessionData(projectFolderName);
        if (historyData.conversation.length === 0) return null;

        // Try to guess the working directory from the folder name
        // (This is imperfect but better than nothing; hyphenated names are hard to reverse)
        // For now, we'll just show the project folder name as human-readable activity
        const mockNow = historyData.lastActivity || new Date().toISOString();

        return {
            id: `claude-code-past-${projectFolderName}`,
            agent: {
                type: 'claude-code',
                displayName: 'Claude Code',
                model: historyData.model || 'Claude',
            },
            owner: {
                user: os.userInfo().username,
                pid: 0,
            },
            environment: {
                workingDirectory: projectFolderName, // Show hyphenated name if path unknown
                host: (await execPromise('hostname').catch(() => ({ stdout: 'localhost' }))).stdout.trim(),
            },
            lifecycle: {
                startTime: historyData.startTime || mockNow,
                lastActivity: historyData.lastActivity || mockNow,
                durationSeconds: historyData.durationSeconds || 0,
            },
            status: 'idle',
            currentActivity: `Past: ${projectFolderName}`,
            resources: { cpuPercent: 0, memoryBytes: 0, memoryPercent: 0 },
            filesModified: [],
            commandsExecuted: [],
            conversation: historyData.conversation,
            timeline: [],
            logs: [],
        };
    }

    private async extractSessionData(projectFolderName: string): Promise<{
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
            const projectsDir = path.join(os.homedir(), '.claude/projects');
            const projectPath = path.join(projectsDir, projectFolderName);

            if (!fs.existsSync(projectPath)) return data;

            // Find latest .jsonl file
            const files = fs.readdirSync(projectPath)
                .filter(f => f.endsWith('.jsonl'))
                .map(f => ({ name: f, time: fs.statSync(path.join(projectPath, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);

            if (files.length === 0) return data;

            const latestFile = path.join(projectPath, files[0].name);
            const content = fs.readFileSync(latestFile, 'utf8');
            const conversation: ConversationEntry[] = [];

            for (const line of content.trim().split('\n')) {
                if (!line.trim()) continue;
                try {
                    const item = JSON.parse(line);
                    if (item.type === 'user' || item.type === 'assistant') {
                        const msg = item.message;
                        let text = '';
                        
                        if (typeof msg.content === 'string') {
                            text = msg.content;
                        } else if (Array.isArray(msg.content)) {
                            text = (msg.content as Array<{ type: string; text?: string }>)
                                .map(c => c.type === 'text' ? (c.text || '') : '')
                                .join('\n')
                                .trim();
                        }

                        if (text) {
                            conversation.push({
                                role: (item.type === 'user' ? 'user' : 'assistant'),
                                content: text,
                                timestamp: item.timestamp || new Date().toISOString(),
                            });
                        }

                        if (item.type === 'assistant' && msg.model && !data.model) {
                            data.model = msg.model;
                        }
                    }
                } catch { /* ignore parse errors */ }
            }

            data.conversation = conversation;
            if (conversation.length > 0) {
                data.startTime = conversation[0].timestamp;
                data.lastActivity = conversation[conversation.length - 1].timestamp;
                data.durationSeconds = Math.floor(
                    (new Date(data.lastActivity).getTime() - new Date(data.startTime).getTime()) / 1000
                );
                // Use last user message as summary if needed, but Claude doesn't have titles like OpenCode
                data.summary = 'Active conversation';
            }
        } catch (err) {
            log.debug(`Failed to extract Claude Code session data for ${projectFolderName}`, err);
        }

        return data;
    }
}
