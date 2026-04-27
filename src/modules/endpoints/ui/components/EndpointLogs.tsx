'use client';

import { useState } from 'react';
import {
  Copy,
  FileText,
  LoaderCircle,
  ChevronRight,
  Terminal,
  Braces,
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, relativeTime } from '@/lib/utils';
import type { EndpointExecutionLogDTO } from '../../types';

interface EndpointLogsProps {
  logs: EndpointExecutionLogDTO[];
  logsLoading: boolean;
  isCreating: boolean;
}

export function EndpointLogs({ logs, logsLoading, isCreating }: EndpointLogsProps) {
  if (logsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 rounded-[3rem] border border-border/20 bg-muted/5 backdrop-blur-sm">
        <LoaderCircle className="w-10 h-10 animate-spin text-primary/40 mb-4" />
        <span className="text-xs font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
          Intercepting Logs...
        </span>
      </div>
    );
  }

  if (isCreating) {
    return (
      <div className="flex flex-col items-center py-20 text-center bg-muted/5 rounded-[3rem] border border-dashed border-border/40">
        <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-6">
          <FileText className="w-8 h-8 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-black text-foreground uppercase tracking-tight mb-2">
          No active history
        </p>
        <p className="text-[11px] text-muted-foreground/60 max-w-[240px] leading-relaxed">
          The execution ledger will appear here once the endpoint has been instantiated and
          triggered.
        </p>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center bg-muted/5 rounded-[3rem] border border-dashed border-border/40">
        <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-6">
          <Terminal className="w-8 h-8 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-black text-foreground uppercase tracking-tight mb-2">
          Virgin Endpoint
        </p>
        <p className="text-[11px] text-muted-foreground/60 max-w-[240px] leading-relaxed">
          Awaiting the first interaction. All incoming calls will be logged with full payload
          transparency.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-10">
      <div className="flex items-center justify-between px-2 mb-4">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
          Execution Ledger
        </label>
        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
          {logs.length} Entries
        </span>
      </div>
      {logs.map((entry) => (
        <LogEntry key={entry._id} entry={entry} />
      ))}
    </div>
  );
}

function LogEntry({ entry }: { entry: EndpointExecutionLogDTO }) {
  const [expanded, setExpanded] = useState(false);
  const requestBody = entry.requestBody ? entry.requestBody : '{ "empty": true }';
  const responseBody = entry.responseBody ? entry.responseBody : '{ "no_body": true }';

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-300 overflow-hidden group/log',
        expanded
          ? 'border-border shadow-xl bg-card scale-[1.01] ring-1 ring-primary/10'
          : 'border-border/40 bg-card/50 hover:bg-card hover:border-border/80 hover:shadow-md'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
      >
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors shadow-inner',
            entry.statusCode < 400
              ? 'bg-success/10 text-success shadow-success/10'
              : 'bg-destructive/10 text-destructive shadow-destructive/10'
          )}
        >
          <span className="text-xs font-black font-mono">{entry.statusCode}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-black text-foreground uppercase tracking-tighter">
              {entry.method} interaction
            </span>
            <span className="text-[10px] text-muted-foreground/40 font-medium">•</span>
            <span className="text-[10px] text-muted-foreground font-mono font-bold">
              {entry.duration}ms latency
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={entry.triggeredBy === 'test' ? 'secondary' : 'default'}
              className="text-[9px] h-4.5 px-1.5 font-black uppercase tracking-[0.1em] rounded-md scale-90 -ml-1 border-none"
            >
              {entry.triggeredBy}
            </Badge>
            <span className="text-[10px] text-muted-foreground/60 font-medium lowercase">
              {relativeTime(entry.createdAt)}
            </span>
          </div>
        </div>

        <ChevronRight
          className={cn(
            'w-4 h-4 text-muted-foreground/40 transition-transform duration-300 group-hover/log:text-muted-foreground',
            expanded && 'rotate-90 text-primary'
          )}
        />
      </button>

      {expanded && (
        <div className="px-6 py-6 border-t border-border/40 bg-muted/5 space-y-6 text-xs animate-in slide-in-from-top-1 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Request */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary/60" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Payload Ingress
                </p>
                <CopyLogButton label="Copy payload ingress" value={requestBody} />
              </div>
              <pre className={logBlockClassName}>{requestBody}</pre>
            </div>

            {/* Response */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Braces className="w-3.5 h-3.5 text-primary/60" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Payload Egress
                </p>
                <CopyLogButton label="Copy payload egress" value={responseBody} />
              </div>
              <pre className={logBlockClassName}>{responseBody}</pre>
            </div>
          </div>

          {(entry.stdout || entry.stderr) && (
            <div className="space-y-4 pt-4 border-t border-border/20">
              {entry.stdout && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Terminal className="w-3.5 h-3.5 text-success/60" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Standard Output
                    </p>
                    <CopyLogButton label="Copy standard output" value={entry.stdout} />
                  </div>
                  <pre className={cn(logBlockClassName, 'max-h-60 px-5 py-4')}>{entry.stdout}</pre>
                </div>
              )}
              {entry.stderr && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive/60" />
                    <p className="text-[10px] font-bold text-destructive/70 uppercase tracking-widest">
                      Standard Error
                    </p>
                  </div>
                  <pre className="font-mono text-destructive/80 bg-destructive/5 rounded-2xl px-5 py-4 whitespace-pre-wrap break-all max-h-60 overflow-y-auto border border-destructive/20 shadow-inner custom-scrollbar leading-relaxed">
                    {entry.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}

          {entry.error && (
            <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20 animate-pulse">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <p className="text-[10px] font-bold text-destructive uppercase tracking-widest leading-none">
                  Kernel Fault Exception
                </p>
              </div>
              <p className="text-destructive/90 font-medium italic pl-5.5">{entry.error}</p>
            </div>
          )}

          <div className="flex items-center gap-6 px-2 pt-4 border-t border-border/20">
            {entry.requestMeta.ip && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter">
                  Source IP
                </span>
                <span className="text-[10px] font-bold text-muted-foreground group-hover/log:text-foreground transition-colors">
                  {entry.requestMeta.ip}
                </span>
              </div>
            )}
            {entry.requestMeta.userAgent && (
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-tighter">
                  Client Agent
                </span>
                <span className="text-[10px] font-bold text-muted-foreground truncate group-hover/log:text-foreground transition-colors">
                  {entry.requestMeta.userAgent}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const logBlockClassName =
  'font-mono text-foreground bg-muted/70 rounded-2xl px-4 py-3 whitespace-pre-wrap break-all max-h-48 overflow-y-auto border border-border/70 shadow-inner custom-scrollbar leading-relaxed';

function CopyLogButton({ label, value }: { label: string; value: string }) {
  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={handleCopy}
      className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}
