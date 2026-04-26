import * as fs from 'fs';
import * as path from 'path';
import {
  execPromise,
  detectGitInfo,
  discoverHomeDirs,
  getHostnameCached,
  readFileHeadAndTailSync,
} from '../process-utils';
import { createLogger } from '@/lib/logger';
import type {
  AgentAdapter,
  AgentSession,
  AgentType,
  ConversationEntry,
  ActionTimelineEntry,
  GeminiSession,
  GeminiLogEntry,
  GeminiMessage,
} from '@/modules/ai-agents/types';

const log = createLogger('ai-agents:gemini-cli');

const ACTIVE_THRESHOLD_MS = 120_000;

export class GeminiCLIAdapter implements AgentAdapter {
  readonly agentType: AgentType = 'gemini-cli';
  readonly displayName = 'Gemini CLI';

  async detect(): Promise<AgentSession[]> {
    const sessions: AgentSession[] = [];

    for (const { username, homeDir } of discoverHomeDirs()) {
      const geminiDir = path.join(homeDir, '.gemini');
      const tmpDir = path.join(geminiDir, 'tmp');
      const projectsFile = path.join(geminiDir, 'projects.json');

      try {
        if (!fs.existsSync(tmpDir)) continue;

        const projectMap: Record<string, string> = {};
        if (fs.existsSync(projectsFile)) {
          try {
            const projectsData = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
            if (projectsData.projects) {
              for (const [pPath, slug] of Object.entries(projectsData.projects)) {
                projectMap[slug as string] = pPath;
              }
            }
          } catch (e) {
            log.debug(`Failed to parse projects.json for ${username}`, e);
          }
        }

        const projectFolders = fs
          .readdirSync(tmpDir)
          .map((f) => {
            try {
              const stat = fs.statSync(path.join(tmpDir, f));
              return { name: f, time: stat.mtime.getTime(), isDirectory: stat.isDirectory() };
            } catch {
              return { name: f, time: 0, isDirectory: false };
            }
          })
          .filter((f) => f.isDirectory && f.name !== 'bin')
          .sort((a, b) => b.time - a.time)
          .slice(0, 20)
          .map((f) => f.name);

        for (const projectSlug of projectFolders) {
          const projectDir = path.join(tmpDir, projectSlug);
          const chatsDir = path.join(projectDir, 'chats');
          if (!fs.existsSync(chatsDir)) continue;

          // Read logs.json for this project to associate with sessions later
          let projectLogs: GeminiLogEntry[] = [];
          const logsFile = path.join(projectDir, 'logs.json');
          if (fs.existsSync(logsFile)) {
            try {
              projectLogs = JSON.parse(fs.readFileSync(logsFile, 'utf8'));
            } catch {
              /* ignore */
            }
          }

          const sessionFiles = fs
            .readdirSync(chatsDir)
            .filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'))
            .map((f) => ({
              name: f,
              path: path.join(chatsDir, f),
              time: fs.statSync(path.join(chatsDir, f)).mtime.getTime(),
            }))
            .sort((a, b) => b.time - a.time)
            .slice(0, 10);

          for (const fileInfo of sessionFiles) {
            try {
              const session = await this.buildSession(
                fileInfo.path,
                projectSlug,
                projectMap[projectSlug],
                username,
                projectLogs
              );
              if (session) sessions.push(session);
            } catch (err) {
              log.debug(`Failed to build session for ${username}:${fileInfo.name}`, err);
            }
          }
        }
      } catch (err) {
        log.debug(`Gemini CLI detection failed for user ${username}`, err);
      }
    }
    return sessions;
  }

  private async buildSession(
    sessionFilePath: string,
    projectSlug: string,
    projectPath: string | undefined,
    username: string,
    projectLogs: GeminiLogEntry[]
  ): Promise<AgentSession | null> {
    const content = readFileHeadAndTailSync(sessionFilePath, 256 * 1024);
    let sessionData: GeminiSession;

    if (sessionFilePath.endsWith('.jsonl')) {
      sessionData = this.parseJsonl(content);
    } else {
      sessionData = JSON.parse(content);
    }

    if (!sessionData.messages || sessionData.messages.length === 0) return null;

    const sessionId = sessionData.sessionId;
    const lastUpdated = new Date(sessionData.lastUpdated || sessionData.startTime).getTime();
    const isActive = Date.now() - lastUpdated < ACTIVE_THRESHOLD_MS;

    let pid = 0;
    // ... rest of the method remains same ...
    if (isActive && projectPath) {
      try {
        // Find all gemini processes and check their CWD
        const { stdout } = await execPromise(`pgrep -f "gemini"`);
        const pids = stdout
          .trim()
          .split('\n')
          .map((p) => parseInt(p, 10))
          .filter((p) => !isNaN(p));

        for (const candidatePid of pids) {
          try {
            const { stdout: cwd } = await execPromise(`readlink /proc/${candidatePid}/cwd`);
            if (cwd.trim() === projectPath) {
              pid = candidatePid;
              break;
            }
          } catch {
            /* ignore permission errors or process exits */
          }
        }
      } catch {
        /* ignore */
      }
    } else if (isActive) {
      // Fallback to broad search if no project path
      try {
        const { stdout } = await execPromise(
          `ps aux | grep "gemini" | grep -v grep | awk '{print $2}' | head -n 1`
        );
        if (stdout.trim()) {
          pid = parseInt(stdout.trim(), 10);
        }
      } catch {
        /* ignore */
      }
    }

    const conversation: ConversationEntry[] = [];
    const timeline: ActionTimelineEntry[] = [];
    const filesModified = new Set<string>();
    const commandsExecuted = new Set<string>();
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for (const msg of sessionData.messages) {
      const timestamp = msg.timestamp || new Date().toISOString();
      let text = '';

      if (typeof msg.content === 'string') {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        text = msg.content
          .map((c) => c.text || '')
          .join('\n')
          .trim();
      }

      if (text || msg.type === 'gemini' || msg.type === 'info') {
        let role: 'user' | 'assistant' | 'system' = 'user';
        if (msg.type === 'gemini') role = 'assistant';
        else if (msg.type === 'system' || msg.type === 'info') role = 'system';

        conversation.push({
          role,
          content: text || (msg.type === 'gemini' ? '(Thinking...)' : ''),
          timestamp,
          thoughts: msg.thoughts,
        });
      }

      if (msg.tokens) {
        usage.inputTokens += msg.tokens.input || 0;
        usage.outputTokens += msg.tokens.output || 0;
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const args = tc.args;
          timeline.push({
            timestamp,
            action: `Tool: ${tc.name}`,
            detail: typeof args.description === 'string' ? args.description : JSON.stringify(args),
          });

          if (tc.name === 'run_shell_command' && typeof args.command === 'string') {
            commandsExecuted.add(args.command);
          } else if (
            (tc.name === 'write_file' || tc.name === 'replace') &&
            typeof args.file_path === 'string'
          ) {
            filesModified.add(args.file_path);
          }
        }
      }
    }

    usage.totalTokens = usage.inputTokens + usage.outputTokens;

    // Filter logs for this session
    const sessionLogs = projectLogs
      .filter((l) => l.sessionId === sessionId)
      .map((l) => `[${l.timestamp}] ${l.type}: ${l.message}`);

    const gitInfo = projectPath ? await detectGitInfo(projectPath) : {};

    return {
      id: `gemini-cli-${username}-${sessionId}`,
      agent: {
        type: 'gemini-cli',
        displayName: 'Gemini CLI',
        model: sessionData.messages.find((m: GeminiMessage) => m.model)?.model || 'Gemini',
      },
      owner: {
        user: username,
        pid,
      },
      environment: {
        workingDirectory: projectPath || projectSlug,
        repository: gitInfo.repository,
        gitBranch: gitInfo.branch,
        host: getHostnameCached(),
      },
      lifecycle: {
        startTime: sessionData.startTime,
        lastActivity: sessionData.lastUpdated || sessionData.startTime,
        durationSeconds: Math.floor(
          (lastUpdated - new Date(sessionData.startTime).getTime()) / 1000
        ),
      },
      status: isActive ? 'running' : 'idle',
      currentActivity: sessionData.summary || (isActive ? 'Active session' : 'Past session'),
      usage,
      filesModified: Array.from(filesModified),
      commandsExecuted: Array.from(commandsExecuted),
      conversation,
      timeline,
      logs: sessionLogs,
    };
  }

  private parseJsonl(content: string): GeminiSession {
    const lines = content.trim().split('\n');
    if (lines.length === 0) {
      throw new Error('Empty session file');
    }

    const firstLine = JSON.parse(lines[0]);
    const session: GeminiSession = {
      sessionId: firstLine.sessionId || '',
      projectHash: firstLine.projectHash || '',
      startTime: firstLine.startTime || new Date().toISOString(),
      lastUpdated: firstLine.lastUpdated || firstLine.startTime || new Date().toISOString(),
      messages: [],
    };

    const messageMap = new Map<string, GeminiMessage>();

    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.$set) {
          if (entry.$set.lastUpdated) {
            session.lastUpdated = entry.$set.lastUpdated;
          }
          if (entry.$set.summary) {
            session.summary = entry.$set.summary;
          }
        } else if (entry.id && entry.type) {
          // It's a message (user, gemini, system, info)
          // Use a map to keep only the latest version of a message if it appears multiple times (updates)
          messageMap.set(entry.id, entry as GeminiMessage);
        }
      } catch (e) {
        log.debug('Failed to parse JSONL line', e);
      }
    }

    session.messages = Array.from(messageMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return session;
  }
}
