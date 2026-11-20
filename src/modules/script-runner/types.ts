export const DEFAULT_CWD = '/var/lib/servermon-script';
export const DEFAULT_TIMEOUT_SECONDS = 900;
export const DEFAULT_RETENTION_DAYS = 3;
export const RUNNER_USER = 'servermon-script';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'stopped'
  | 'timed_out'
  | 'interrupted';

export interface ScriptDraft {
  title: string;
  source: string;
  cwd: string;
  args: string[];
  timeoutSeconds: number;
}

export interface SavedScript extends ScriptDraft {
  id: string;
  updatedAt: string;
}

export type ScriptSummary = Pick<SavedScript, 'id' | 'title' | 'cwd' | 'updatedAt'>;

export interface ScriptRun {
  id: string;
  scriptId?: string;
  title: string;
  cwd: string;
  args: string[];
  timeoutSeconds: number;
  status: RunStatus;
  requestedBy: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: number | null;
  message?: string;
  stopRequestedAt?: string;
  outputTruncated?: boolean;
  logsPurgedAt?: string;
}

export interface RunnerOverview {
  scripts: ScriptSummary[];
  active: ScriptRun[];
  history: ScriptRun[];
  nextHistoryCursor?: string;
  recentDirectories: string[];
  online: boolean;
  supported: boolean;
  logRetentionDays: number;
}

export interface OutputEntry {
  time: string;
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface OutputBatch {
  cursor: number;
  entries: OutputEntry[];
  run: ScriptRun;
}

export interface DirectoryListing {
  path: string;
  directories: string[];
}

export const isActiveRun = (status: RunStatus) => status === 'queued' || status === 'running';
