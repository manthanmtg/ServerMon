import { appendFile, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export type AIRunnerLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AIRunnerLogEntry {
  id: string;
  timestamp: string;
  level: AIRunnerLogLevel;
  component: string;
  event: string;
  message: string;
  sessionId: string;
  pid: number;
  data?: Record<string, unknown>;
}

const LOG_PREFIX = 'servermon-ai-runner-';
const LOG_SUFFIX = '.ndjson';
const LOG_PATH_ENV = 'AI_RUNNER_LOG_PATH';
const LOG_SESSION_ENV = 'AI_RUNNER_LOG_SESSION_ID';

function ensureSessionId(): string {
  const existing = process.env[LOG_SESSION_ENV];
  if (existing) return existing;

  const sessionId = randomUUID();
  process.env[LOG_SESSION_ENV] = sessionId;
  return sessionId;
}

export function getAIRunnerLogSessionId(): string {
  return ensureSessionId();
}

export function getAIRunnerLogFilePath(): string {
  const existing = process.env[LOG_PATH_ENV];
  if (existing) return existing;

  const filePath = join(tmpdir(), `${LOG_PREFIX}${ensureSessionId()}${LOG_SUFFIX}`);
  process.env[LOG_PATH_ENV] = filePath;
  return filePath;
}

export async function resetAIRunnerLogSession(): Promise<string> {
  const sessionId = randomUUID();
  const filePath = join(tmpdir(), `${LOG_PREFIX}${sessionId}${LOG_SUFFIX}`);

  process.env[LOG_SESSION_ENV] = sessionId;
  process.env[LOG_PATH_ENV] = filePath;

  try {
    const entries = await readdir(tmpdir());
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(LOG_PREFIX) && entry.endsWith(LOG_SUFFIX))
        .map((entry) => rm(join(tmpdir(), entry), { force: true }))
    );
  } catch {
    /* best-effort cleanup */
  }

  await writeFile(filePath, '', 'utf8');
  await writeAIRunnerLogEntry({
    level: 'info',
    component: 'ai-runner:logs',
    event: 'session.started',
    message: 'Started new AI Runner debug log session',
    data: {
      filePath,
      restartedAt: new Date().toISOString(),
    },
  });

  return filePath;
}

export async function writeAIRunnerLogEntry(input: {
  level: AIRunnerLogLevel;
  component: string;
  event: string;
  message: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const entry: AIRunnerLogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level: input.level,
    component: input.component,
    event: input.event,
    message: input.message,
    sessionId: getAIRunnerLogSessionId(),
    pid: process.pid,
    data: input.data,
  };

  try {
    await appendFile(getAIRunnerLogFilePath(), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* best-effort debug logging must never break runner flow */
  }
}

export function parseAIRunnerLogLine(line: string): AIRunnerLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as Partial<AIRunnerLogEntry>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.level !== 'string' ||
      typeof parsed.component !== 'string' ||
      typeof parsed.event !== 'string' ||
      typeof parsed.message !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.pid !== 'number'
    ) {
      return null;
    }

    return {
      id: parsed.id,
      timestamp: parsed.timestamp,
      level: parsed.level as AIRunnerLogLevel,
      component: parsed.component,
      event: parsed.event,
      message: parsed.message,
      sessionId: parsed.sessionId,
      pid: parsed.pid,
      data:
        parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
          ? (parsed.data as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function readAIRunnerLogEntries(limit = 200): Promise<{
  entries: AIRunnerLogEntry[];
  filePath: string;
  sessionId: string;
}> {
  const filePath = getAIRunnerLogFilePath();
  const sessionId = getAIRunnerLogSessionId();

  try {
    const raw = await readFile(filePath, 'utf8');
    const entries = raw
      .split('\n')
      .map(parseAIRunnerLogLine)
      .filter((entry): entry is AIRunnerLogEntry => entry !== null)
      .slice(-Math.max(1, limit));

    return { entries, filePath, sessionId };
  } catch {
    return { entries: [], filePath, sessionId };
  }
}

export async function readAIRunnerLogSlice(offset: number): Promise<{
  text: string;
  nextOffset: number;
}> {
  const filePath = getAIRunnerLogFilePath();

  try {
    const fileStat = await stat(filePath);
    const safeOffset = Math.min(Math.max(offset, 0), fileStat.size);
    if (safeOffset >= fileStat.size) {
      return { text: '', nextOffset: fileStat.size };
    }

    const raw = await readFile(filePath);
    return {
      text: raw.subarray(safeOffset).toString('utf8'),
      nextOffset: raw.length,
    };
  } catch {
    return { text: '', nextOffset: 0 };
  }
}

export async function getAIRunnerLogSize(): Promise<number> {
  try {
    const fileStat = await stat(getAIRunnerLogFilePath());
    return fileStat.size;
  } catch {
    return 0;
  }
}
