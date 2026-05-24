'use client';

import { Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  LoaderCircle,
  Pause,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CronJob, CronRunStatus } from '../../types';
import { NextRunsPanel } from './NextRunsPanel';
import { PastRunsPanel } from './PastRunsPanel';
import { LiveCountdown } from './LiveTime';

interface CronJobRowProps {
  job: CronJob;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggle: (job: CronJob) => void;
  onEdit: (job: CronJob) => void;
  onRun: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
  onCopy: (expr: string, id: string) => void;
  copiedId: string | null;
  pendingAction: string | null;
  onShowOutput: (run: CronRunStatus) => void;
}

export function CronJobRow({
  job,
  isExpanded,
  onToggleExpand,
  onToggle,
  onEdit,
  onRun,
  onDelete,
  onCopy,
  copiedId,
  pendingAction,
  onShowOutput,
}: CronJobRowProps) {
  return (
    <Fragment>
      <tr
        data-testid="cron-job-row"
        className={cn(
          'border-t border-border/60 transition-colors hover:bg-muted/10',
          isExpanded && 'bg-muted/10'
        )}
      >
        <td className="py-3 px-4">
          <motion.button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} next runs for ${job.command}`}
            onClick={onToggleExpand}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded hover:bg-accent transition-colors flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </motion.button>
        </td>
        <td className="py-3 px-4">
          <Badge variant={job.enabled ? 'success' : 'secondary'}>
            {job.enabled ? 'active' : 'disabled'}
          </Badge>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              {job.expression}
            </code>
            <motion.button
              type="button"
              onClick={() => onCopy(job.expression, job.id)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded hover:bg-accent transition-colors flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]"
              title="Copy expression"
            >
              {copiedId === job.id ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <Copy className="w-3 h-3 text-muted-foreground" />
              )}
            </motion.button>
          </div>
          {job.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{job.description}</p>
          )}
        </td>
        <td className="py-3 px-4">
          <span className="font-mono text-xs max-w-[280px] truncate block" title={job.command}>
            {job.command}
          </span>
          {job.comment && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[280px]">
              {job.comment}
            </p>
          )}
        </td>
        <td className="py-3 px-4 text-xs">{job.user}</td>
        <td className="py-3 px-4">
          <Badge variant="outline" className="text-[10px]">
            {job.source}
          </Badge>
        </td>
        <td className="py-3 px-4 text-xs">
          {job.nextRuns[0] ? (
            <span
              className="text-foreground font-mono whitespace-nowrap cursor-help underline decoration-dashed decoration-border/50 underline-offset-4"
              title={new Date(job.nextRuns[0]).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            >
              <LiveCountdown targetIso={job.nextRuns[0]} />
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1">
            {job.source === 'user' && (
              <>
                <motion.button
                  type="button"
                  title={job.enabled ? 'Disable' : 'Enable'}
                  disabled={pendingAction === `${job.id}:toggle`}
                  onClick={() => onToggle(job)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center"
                >
                  {pendingAction === `${job.id}:toggle` ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : job.enabled ? (
                    <Pause className="w-3.5 h-3.5 text-warning" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-success" />
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  title="Edit"
                  onClick={() => onEdit(job)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center"
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.button>
                <motion.button
                  type="button"
                  title="Run Now"
                  disabled={pendingAction === `${job.id}:run`}
                  onClick={() => onRun(job)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center"
                >
                  {pendingAction === `${job.id}:run` ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  title="Delete"
                  disabled={pendingAction === `${job.id}:delete`}
                  onClick={() => onDelete(job)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] flex items-center justify-center"
                >
                  {pendingAction === `${job.id}:delete` ? (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  )}
                </motion.button>
              </>
            )}
            {job.source !== 'user' && (
              <span className="text-[10px] text-muted-foreground">read-only</span>
            )}
          </div>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <tr className="border-t border-border/40 overflow-hidden">
            <td colSpan={8} className="p-0 bg-muted/5">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="p-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <NextRunsPanel job={job} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Details
                    </p>
                    <div className="text-xs space-y-1">
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">Full command:</span>
                        <code className="font-mono text-foreground break-all">{job.command}</code>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">Expression:</span>
                        <code className="font-mono text-foreground">{job.expression}</code>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">User:</span>
                        <span className="text-foreground">{job.user}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">Source:</span>
                        <span className="text-foreground">
                          {job.source}
                          {job.sourceFile ? ` (${job.sourceFile})` : ''}
                        </span>
                      </div>
                      {job.comment && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-20 shrink-0">Comment:</span>
                          <span className="text-foreground">{job.comment}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {job.source === 'user' && (
                    <div className="pt-2">
                      <PastRunsPanel jobId={job.id} onShowOutput={onShowOutput} />
                    </div>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </Fragment>
  );
}
