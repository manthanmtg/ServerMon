export function nextRetryAt(
  failedAt: Date,
  consecutiveFailures: number,
  intervalMinutes: number
): Date {
  const minutes = [1, 5, 15, 60][Math.max(0, consecutiveFailures - 1)] ?? intervalMinutes;
  return new Date(failedAt.getTime() + Math.min(minutes, intervalMinutes) * 60_000);
}

export function shouldDeployCommit(remoteSha: string, deployedSha?: string): boolean {
  return !deployedSha || remoteSha !== deployedSha;
}
