export const DEFAULT_CWD = '/var/lib/servermon-script';
export const DEFAULT_TIMEOUT_SECONDS = 900;
export const DEFAULT_RETENTION_DAYS = 3;
export const DEFAULT_MAX_CONCURRENT_RUNS = 2;
export const MAX_SCRIPT_FOLDER_LENGTH = 64;
export const RUNNER_USER = 'servermon-script';
export const SCRIPT_LANGUAGES = ['bash', 'python', 'node'] as const;
export type ScriptLanguage = (typeof SCRIPT_LANGUAGES)[number];

export const SCRIPT_RUNTIMES = {
  bash: { label: 'Bash', filename: 'script.sh' },
  python: { label: 'Python', filename: 'script.py' },
  node: { label: 'Node.js', filename: 'script.cjs' },
} satisfies Record<ScriptLanguage, { label: string; filename: string }>;

export const MAX_ENV_VARS = 32;
export const MAX_ENV_NAME_LENGTH = 128;
export const MAX_ENV_VALUE_LENGTH = 4096;
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ScriptEnvironmentVariable {
  key: string;
  value: string;
}

export interface SavedEnvVariable {
  id: string;
  key: string;
  secret: boolean;
  updatedAt: string;
}

export interface SavedEnvVariableDetail extends SavedEnvVariable {
  value?: string;
}

export interface ScriptRunnerDefaults {
  defaultWorkingDirectory: string;
  defaultTimeoutSeconds: number;
  maxConcurrentRuns: number;
  logRetentionDays: number;
}

export const SCRIPT_RUNNER_DEFAULTS: ScriptRunnerDefaults = {
  defaultWorkingDirectory: DEFAULT_CWD,
  defaultTimeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_RUNS,
  logRetentionDays: DEFAULT_RETENTION_DAYS,
};

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
  language: ScriptLanguage;
  env: ScriptEnvironmentVariable[];
  envVarIds?: string[];
  folder?: string;
  cwd: string;
  args: string[];
  timeoutSeconds: number;
}

export interface SavedScript extends ScriptDraft {
  id: string;
  updatedAt: string;
}

export type ScriptSummary = Pick<
  SavedScript,
  'id' | 'title' | 'cwd' | 'language' | 'folder' | 'updatedAt'
>;

export interface ScriptRun {
  id: string;
  scriptId?: string;
  title: string;
  cwd: string;
  args: string[];
  timeoutSeconds: number;
  status: RunStatus;
  language: ScriptLanguage;
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

export interface RunSnapshot extends ScriptRun {
  source: string;
  env: ScriptEnvironmentVariable[];
  linkedEnvKeys?: string[];
}

export interface RunnerOverview extends ScriptRunnerDefaults {
  variables: SavedEnvVariable[];
  scripts: ScriptSummary[];
  active: ScriptRun[];
  history: ScriptRun[];
  nextHistoryCursor?: string;
  recentDirectories: string[];
  online: boolean;
  supported: boolean;
  runtimes: ScriptLanguage[];
  environmentSupport: boolean;
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
