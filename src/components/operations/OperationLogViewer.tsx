'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsDown, Copy, Download, Maximize2, Radio, WrapText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getOperationStatusPresentation,
  isLiveOperationStatus,
  type OperationStatus,
} from './operation-status';

export interface OperationLogViewerProps {
  output: string | string[];
  status: OperationStatus;
  label: string;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  autoscroll?: boolean;
  onAutoscrollChange?: (autoscroll: boolean) => void;
  wrap?: boolean;
  onWrapChange?: (wrap: boolean) => void;
  onRequestFullscreen?: () => void;
  downloadableFilename?: string;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
  maxHeightClassName?: string;
}

export function OperationLogViewer({
  output,
  status,
  label,
  follow,
  onFollowChange,
  autoscroll,
  onAutoscrollChange,
  wrap,
  onWrapChange,
  onRequestFullscreen,
  downloadableFilename = 'operation.log',
  error,
  emptyMessage = 'No logs were captured for this operation.',
  className,
  maxHeightClassName = 'max-h-[32rem]',
}: OperationLogViewerProps) {
  const [internalFollow, setInternalFollow] = useState(true);
  const [internalAutoscroll, setInternalAutoscroll] = useState(true);
  const [internalWrap, setInternalWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const scrollTargetRef = useRef<HTMLSpanElement>(null);
  const normalizedOutput = useMemo(
    () => (Array.isArray(output) ? output.join('\n') : output),
    [output]
  );
  const resolvedFollow = follow ?? internalFollow;
  const resolvedAutoscroll = autoscroll ?? internalAutoscroll;
  const resolvedWrap = wrap ?? internalWrap;
  const live = isLiveOperationStatus(status);
  const presentation = getOperationStatusPresentation(status);

  useEffect(() => {
    if (
      live &&
      resolvedAutoscroll &&
      typeof scrollTargetRef.current?.scrollIntoView === 'function'
    ) {
      scrollTargetRef.current.scrollIntoView({ block: 'end' });
    }
  }, [live, normalizedOutput, resolvedAutoscroll]);

  const updateFollow = () => {
    const next = !resolvedFollow;
    setInternalFollow(next);
    onFollowChange?.(next);
  };

  const updateAutoscroll = () => {
    const next = !resolvedAutoscroll;
    setInternalAutoscroll(next);
    onAutoscrollChange?.(next);
  };

  const updateWrap = () => {
    const next = !resolvedWrap;
    setInternalWrap(next);
    onWrapChange?.(next);
  };

  const copyOutput = () => {
    void navigator.clipboard.writeText(normalizedOutput);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const downloadOutput = () => {
    const url = URL.createObjectURL(
      new Blob([normalizedOutput], { type: 'text/plain;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadableFilename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={cn('min-w-0 space-y-3', className)}>
      <span className="sr-only" aria-live="polite">
        Status changed: {presentation.label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {live && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              aria-label="Follow live output"
              aria-pressed={resolvedFollow}
              onClick={updateFollow}
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              Follow
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              aria-label="Autoscroll output"
              aria-pressed={resolvedAutoscroll}
              onClick={updateAutoscroll}
            >
              <ChevronsDown className="h-4 w-4" aria-hidden="true" />
              Autoscroll
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11"
          aria-label="Wrap output"
          aria-pressed={resolvedWrap}
          onClick={updateWrap}
        >
          <WrapText className="h-4 w-4" aria-hidden="true" />
          Wrap
        </Button>
        {normalizedOutput && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              aria-label="Copy logs"
              onClick={copyOutput}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              aria-label="Download logs"
              onClick={downloadOutput}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download
            </Button>
          </>
        )}
        {onRequestFullscreen && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto h-11 w-11"
            aria-label="Open logs full screen"
            onClick={onRequestFullscreen}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div
        className={cn(
          'overflow-auto rounded-xl border border-border bg-muted/25',
          maxHeightClassName
        )}
      >
        <pre
          role="log"
          aria-label={label}
          aria-live="off"
          className={cn(
            'min-h-32 p-4 font-mono text-sm leading-relaxed text-foreground',
            resolvedWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
          )}
        >
          {normalizedOutput || (
            <span className="font-sans text-muted-foreground">{emptyMessage}</span>
          )}
          {live && resolvedAutoscroll && <span ref={scrollTargetRef} aria-hidden="true" />}
        </pre>
      </div>
    </section>
  );
}
