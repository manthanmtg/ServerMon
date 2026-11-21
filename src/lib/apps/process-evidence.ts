import { readFileSync } from 'node:fs';

const PROC_STARTTIME_INDEX = 19;

interface NodeSystemError {
  code?: string;
}

function isNodeSystemError(error: unknown): error is NodeSystemError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function readProcessStartTime(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const commEnd = stat.lastIndexOf(')');
    if (commEnd < 0) return null;
    const fields = stat.slice(commEnd + 2).split(' ');
    const startTime = fields[PROC_STARTTIME_INDEX];
    return startTime ?? null;
  } catch {
    return null;
  }
}

/**
 * Proves that the process group recorded for a detached command no longer
 * exists. Returns true only when evidence confirms death: the group is gone,
 * or the group ID was reused by an unrelated process with a different start
 * time. Returns false whenever identity cannot be verified.
 */
export function isProcessGroupDead(pid: number, startTime?: string): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  let groupAlive = false;
  try {
    process.kill(-pid, 0);
    groupAlive = true;
  } catch (error: unknown) {
    if (isNodeSystemError(error)) {
      if (error.code === 'ESRCH') return true;
      if (error.code === 'EPERM') groupAlive = true;
    }
    if (!groupAlive) return false;
  }
  if (!startTime) return false;
  const current = readProcessStartTime(pid);
  if (current === null) return false;
  return current !== startTime;
}
