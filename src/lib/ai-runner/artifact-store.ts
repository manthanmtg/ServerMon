import { mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  AIRunnerArtifactOutputDTO,
  AIRunnerArtifactPathsDTO,
  AIRunnerExecutionExitDTO,
  AIRunnerExecutionMetadataDTO,
} from '@/modules/ai-runner/types';
import { DEFAULT_OUTPUT_LIMIT } from './shared';

const RUNS_DIR = 'runs';

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '-').slice(0, 160) || 'run';
}

export function getDefaultAIRunnerArtifactBaseDir(): string {
  if (process.env.AI_RUNNER_ARTIFACT_DIR) {
    return path.resolve(process.env.AI_RUNNER_ARTIFACT_DIR);
  }

  if (process.platform === 'linux' && process.env.NODE_ENV === 'production') {
    return '/var/lib/servermon/ai-runner';
  }

  return path.join(os.homedir(), '.servermon', 'ai-runner');
}

export function resolveAIRunnerArtifactPaths(
  baseDir: string,
  runId: string
): AIRunnerArtifactPathsDTO {
  const artifactDir = path.join(path.resolve(baseDir), RUNS_DIR, sanitizePathSegment(runId));
  return {
    artifactDir,
    metadataPath: path.join(artifactDir, 'metadata.json'),
    stdoutPath: path.join(artifactDir, 'stdout.log'),
    stderrPath: path.join(artifactDir, 'stderr.log'),
    combinedPath: path.join(artifactDir, 'combined.log'),
    exitPath: path.join(artifactDir, 'exit.json'),
    wrapperLogPath: path.join(artifactDir, 'wrapper.log'),
  };
}

export async function ensureAIRunnerArtifactDir(paths: AIRunnerArtifactPathsDTO): Promise<void> {
  await mkdir(paths.artifactDir, { recursive: true, mode: 0o700 });
}

export async function writeAIRunnerMetadata(
  paths: AIRunnerArtifactPathsDTO,
  metadata: AIRunnerExecutionMetadataDTO
): Promise<void> {
  await ensureAIRunnerArtifactDir(paths);
  await writeFile(paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function readAIRunnerMetadata(
  paths: Pick<AIRunnerArtifactPathsDTO, 'metadataPath'>
): Promise<AIRunnerExecutionMetadataDTO | null> {
  try {
    const raw = await readFile(paths.metadataPath, 'utf8');
    return JSON.parse(raw) as AIRunnerExecutionMetadataDTO;
  } catch {
    return null;
  }
}

export async function writeAIRunnerExit(
  paths: AIRunnerArtifactPathsDTO,
  exit: AIRunnerExecutionExitDTO
): Promise<void> {
  await ensureAIRunnerArtifactDir(paths);
  await writeFile(paths.exitPath, `${JSON.stringify(exit, null, 2)}\n`, { mode: 0o600 });
}

export async function readAIRunnerExit(
  paths: Pick<AIRunnerArtifactPathsDTO, 'exitPath'>
): Promise<AIRunnerExecutionExitDTO | null> {
  try {
    const raw = await readFile(paths.exitPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AIRunnerExecutionExitDTO>;
    if (!parsed.runId || !parsed.jobId || !parsed.startedAt || !parsed.finishedAt) {
      return null;
    }
    return {
      jobId: String(parsed.jobId),
      runId: String(parsed.runId),
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      signal: parsed.signal ? String(parsed.signal) : null,
      startedAt: String(parsed.startedAt),
      finishedAt: String(parsed.finishedAt),
      durationSeconds:
        typeof parsed.durationSeconds === 'number' ? Number(parsed.durationSeconds) : 0,
    };
  } catch {
    return null;
  }
}

async function readTail(
  filePath: string,
  limitBytes: number
): Promise<{ text: string; truncated: boolean }> {
  try {
    const info = await stat(filePath);
    const start = Math.max(0, info.size - limitBytes);
    const handle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(info.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return {
        text: buffer.toString('utf8'),
        truncated: start > 0,
      };
    } finally {
      await handle.close();
    }
  } catch {
    return { text: '', truncated: false };
  }
}

export async function tailAIRunnerArtifactOutput(
  paths: Pick<AIRunnerArtifactPathsDTO, 'stdoutPath' | 'stderrPath' | 'combinedPath'>,
  limitBytes = DEFAULT_OUTPUT_LIMIT
): Promise<AIRunnerArtifactOutputDTO> {
  const [stdout, stderr, combined] = await Promise.all([
    readTail(paths.stdoutPath, limitBytes),
    readTail(paths.stderrPath, limitBytes),
    readTail(paths.combinedPath, limitBytes),
  ]);
  const fallbackRaw = `${stdout.text}${stderr.text}`;
  const rawOutput = combined.text || fallbackRaw.slice(-limitBytes);
  return {
    stdout: stdout.text,
    stderr: stderr.text,
    rawOutput,
    truncatedStdout: stdout.truncated,
    truncatedStderr: stderr.truncated,
    truncatedRaw:
      combined.truncated || stdout.truncated || stderr.truncated || fallbackRaw.length > limitBytes,
  };
}

export async function cleanupAIRunnerArtifacts(input: {
  baseDir: string;
  retentionDays: number;
  activeRunIds: Set<string>;
  now?: Date;
}): Promise<string[]> {
  const runsDir = path.join(path.resolve(input.baseDir), RUNS_DIR);
  const cutoff = (input.now ?? new Date()).getTime() - input.retentionDays * 24 * 60 * 60 * 1000;
  const deleted: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return deleted;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (input.activeRunIds.has(entry)) return;
      const artifactDir = path.join(runsDir, entry);
      try {
        const info = await stat(artifactDir);
        if (!info.isDirectory() || info.mtimeMs > cutoff) return;
        await rm(artifactDir, { recursive: true, force: true });
        deleted.push(artifactDir);
      } catch {
        return;
      }
    })
  );

  return deleted.sort();
}
