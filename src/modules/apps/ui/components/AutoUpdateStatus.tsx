import type { AppsAutomationHealth, ManagedAppDTO } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Props {
  git: NonNullable<ManagedAppDTO['git']>;
  health?: AppsAutomationHealth;
  snapshotUnavailable?: boolean;
  now?: Date;
  onOpenLogs?: (operationId: string) => void;
}

function timestamp(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function CheckTime({ value, now, fallback }: { value?: string; now: Date; fallback: string }) {
  const date = timestamp(value);
  if (!date) return <span>{fallback}</span>;
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  const relative =
    Math.abs(minutes) < 1 ? 'now' : minutes > 0 ? `in ${minutes} min` : `${-minutes} min ago`;
  return (
    <time dateTime={value}>
      {date.toLocaleString()} <span className="text-muted-foreground">({relative})</span>
    </time>
  );
}

export function AutoUpdateStatus({
  git,
  health,
  snapshotUnavailable,
  now = new Date(),
  onOpenLogs,
}: Props) {
  const state = git.autoUpdate;
  const due = timestamp(state.retryAt ?? state.nextRunAt);
  const overdue = !due || due.getTime() < now.getTime() - 90_000;
  let label = 'Scheduled';
  let detail = 'The next check will deploy any upstream changes.';
  let warning = false;

  if (snapshotUnavailable) {
    label = 'Status unavailable';
    detail =
      'Could not refresh Apps. Last known timestamps are shown below; current progress is unknown.';
    warning = true;
  } else if (state.pauseReason === 'rollback' && !state.enabled) {
    label = 'Paused after rollback';
    detail = 'Enable auto-update to resume. The selected release will remain in place until then.';
  } else if (!state.enabled) {
    label = 'Disabled';
    detail = 'Automatic checks are off. You can still check and deploy updates manually.';
  } else if (
    (health && health.worker.status !== 'healthy') ||
    state.blockReason === 'worker_unavailable'
  ) {
    label = 'Blocked';
    detail =
      'Apps worker is unavailable. Restore the Apps worker service to resume scheduled checks.';
    warning = true;
  } else if (state.operationStatus === 'queued') {
    label = 'Queued';
    detail = 'An update is waiting for the Apps worker. The Git check has not started yet.';
  } else if (state.operationStatus === 'cancel_requested') {
    label = 'Cancelling';
    detail =
      'Cancellation was requested. The operation still owns the app until the worker confirms it has stopped.';
  } else if (state.operationStatus === 'running') {
    label =
      state.operationPhase &&
      [
        'install',
        'build',
        'stage',
        'activate',
        'health',
        'routing',
        'tls',
        'finalize',
        'cleanup',
      ].includes(state.operationPhase)
        ? 'Deploying'
        : 'Checking';
    detail =
      'The worker is checking the branch and will deploy changes. Open the operation logs for progress.';
  } else if (
    (health && !['healthy', 'starting'].includes(health.scheduler.status)) ||
    state.blockReason === 'scheduler_stale'
  ) {
    label = 'Blocked';
    detail =
      health?.scheduler.lastError ||
      'The scheduler has stopped reporting successful scans. Inspect the Apps worker logs.';
    warning = true;
  } else if (state.blockReason === 'operation_active') {
    label = 'Blocked';
    detail = 'Another app operation is active. The automatic check will resume after it finishes.';
  } else if (state.retryAt && due && due.getTime() > now.getTime()) {
    label = 'Retry scheduled';
    detail =
      'The previous attempt failed. The same upstream commit remains eligible for deployment.';
    warning = true;
  } else if (overdue) {
    label = 'Overdue';
    detail = state.lastAttemptAt
      ? 'The next attempt is overdue. Check worker availability and active operations.'
      : 'No attempt has started. The check is due; inspect worker availability and active operations.';
    warning = true;
  } else if (state.lastStatus === 'failed') {
    label = 'Failed';
    detail = 'The previous attempt failed. See the error and next check time below.';
    warning = true;
  } else if (
    git.deployedSha &&
    state.observedRemoteSha === git.deployedSha &&
    state.lastCheckCompletedAt
  ) {
    label = 'Up to date';
    detail = 'The deployed commit matched upstream at the last successful check.';
  }

  return (
    <section aria-label="Automatic updates" className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          Auto update ·{' '}
          {state.intervalMinutes === 1440
            ? 'Every 24 hours'
            : `Every ${state.intervalMinutes} minutes`}
        </span>
        <Badge variant={warning ? 'destructive' : 'secondary'}>{label}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        “Check & deploy” fetches the branch and deploys available changes.
      </p>
      {label === 'Blocked' &&
        state.operationStatus &&
        ['queued', 'running', 'cancel_requested'].includes(state.operationStatus) && (
          <p className="mt-1 text-xs text-muted-foreground">
            Last known operation state: {state.operationStatus}. Current progress needs
            verification.
          </p>
        )}
      {state.lastError && (
        <p className="mt-2 break-words text-xs text-destructive">{state.lastError}</p>
      )}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Latest outcome</dt>
          <dd className="mt-1">
            {state.lastStatus === 'failed'
              ? 'Failed'
              : state.lastStatus === 'updated'
                ? 'Deployed successfully'
                : state.lastStatus === 'unchanged'
                  ? 'Unchanged'
                  : 'No completed attempt'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next check</dt>
          <dd className="mt-1">
            <CheckTime
              value={state.enabled ? (state.retryAt ?? state.nextRunAt) : undefined}
              now={now}
              fallback={state.enabled ? 'Due now' : 'Not scheduled'}
            />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last attempt</dt>
          <dd className="mt-1">
            <CheckTime value={state.lastAttemptAt} now={now} fallback="Not attempted yet" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last successful check</dt>
          <dd className="mt-1">
            <CheckTime
              value={state.lastCheckCompletedAt}
              now={now}
              fallback="No successful check recorded"
            />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last successful deployment</dt>
          <dd className="mt-1">
            <CheckTime
              value={state.lastSuccessfulDeployAt}
              now={now}
              fallback="No successful deployment recorded"
            />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Deployed commit</dt>
          <dd className="mt-1 font-mono">
            {git.deployedSha?.slice(0, 7) || 'Deployed version unknown'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observed upstream commit</dt>
          <dd className="mt-1 font-mono">
            {state.observedRemoteSha?.slice(0, 7) || 'Not checked yet'}
          </dd>
        </div>
      </dl>
      {state.lastOperationId && onOpenLogs && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-[44px]"
          onClick={() => onOpenLogs(state.lastOperationId!)}
        >
          View latest update logs
        </Button>
      )}
    </section>
  );
}

export function AutomationHealthNotice({ health }: { health?: AppsAutomationHealth }) {
  if (!health)
    return (
      <p className="text-sm text-muted-foreground">
        Automation health is unavailable. Refresh Apps or verify the server version.
      </p>
    );
  const healthy = health.worker.status === 'healthy' && health.scheduler.status === 'healthy';
  const starting = health.worker.status === 'healthy' && health.scheduler.status === 'starting';
  return (
    <div
      role={healthy || starting ? 'status' : 'alert'}
      className={`rounded-lg border px-4 py-3 text-sm ${healthy || starting ? 'border-border bg-muted/20' : 'border-destructive/20 bg-destructive/5'}`}
    >
      <div className="font-medium">
        {healthy
          ? 'Automatic update scheduler is running'
          : health.worker.status !== 'healthy'
            ? 'Automatic updates blocked: Apps worker unavailable'
            : health.scheduler.status === 'starting'
              ? 'Automatic update scheduler is starting'
              : 'Automatic updates blocked: scheduler needs attention'}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Worker last seen: {timestamp(health.worker.lastSeenAt)?.toLocaleString() || 'Never'}. Last
        successful scan:{' '}
        {timestamp(health.scheduler.lastSuccessfulScanAt)?.toLocaleString() || 'Never'}.
        {!healthy &&
          !starting &&
          ' Inspect the Apps worker service and its logs to restore scheduled checks.'}
      </p>
      {health.scheduler.lastError && (
        <p className="mt-1 break-words text-xs text-destructive">{health.scheduler.lastError}</p>
      )}
    </div>
  );
}
