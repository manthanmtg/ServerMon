export interface UpdateRunStatus {
  runId: string;
  timestamp: string;
  status: 'running' | 'completed' | 'failed';
  pid: number;
  exitCode: number | null;
  startedAt: string;
  finishedAt?: string;
  logContent?: string;
}
