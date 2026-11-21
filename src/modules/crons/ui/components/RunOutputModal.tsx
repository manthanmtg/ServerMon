'use client';

import { useState } from 'react';
import { OperationLogDialog } from '@/components/operations/OperationLogDialog';
import { useOperationLogControls } from '@/components/operations/useOperationLogControls';
import { Button } from '@/components/ui/button';
import type { OperationStatus } from '@/components/operations/operation-status';
import type { CronRunStatus } from '../../types';

interface RunOutputModalProps {
  activeRun: CronRunStatus;
  onClose: () => void;
}

function cronRunOperationStatus(status: CronRunStatus['status']): OperationStatus {
  return status === 'completed' ? 'succeeded' : status;
}

function combinedOutput(run: CronRunStatus) {
  return [run.stdout, run.stderr ? `[stderr]\n${run.stderr}` : ''].filter(Boolean).join('\n');
}

export function RunOutputModal({ activeRun, onClose }: RunOutputModalProps) {
  const controls = useOperationLogControls(activeRun.runId);
  const [frozenOutput, setFrozenOutput] = useState('');
  const currentOutput = combinedOutput(activeRun);
  const output = controls.follow ? currentOutput : frozenOutput;
  const isRunning = activeRun.status === 'running';

  const setFollow = (follow: boolean) => {
    if (!follow) setFrozenOutput(currentOutput);
    controls.setFollow(follow);
  };

  return (
    <OperationLogDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Run output"
      target={`PID ${activeRun.pid}`}
      operationId={activeRun.runId}
      startedAt={activeRun.startedAt}
      status={cronRunOperationStatus(activeRun.status)}
      output={output}
      follow={controls.follow}
      onFollowChange={setFollow}
      autoscroll={controls.autoscroll}
      onAutoscrollChange={controls.setAutoscroll}
      wrap={controls.wrap}
      onWrapChange={controls.setWrap}
      emptyMessage={isRunning ? 'Waiting for output…' : 'No output was produced by this run.'}
      downloadableFilename={`cron-${activeRun.runId}.log`}
      details={
        <dl className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Command</dt>
            <dd className="mt-1 break-all font-mono text-foreground">{activeRun.command}</dd>
          </div>
          {activeRun.exitCode !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">Exit code</dt>
              <dd className="mt-1 font-mono text-foreground">{activeRun.exitCode}</dd>
            </div>
          )}
          {activeRun.finishedAt && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Finished</dt>
              <dd className="mt-1 text-foreground">
                {new Date(activeRun.finishedAt).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
      }
      footer={
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          {isRunning ? 'Run in Background' : 'Close'}
        </Button>
      }
    />
  );
}
