interface FileBrowserSummary {
  directories: number;
  files: number;
  totalSize: number;
}

interface FileBrowserSummaryBarProps {
  summary: FileBrowserSummary;
}

interface FileBrowserUploadProgressBarProps {
  progress: number;
}

function formatBytesCompact(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function FileBrowserSummaryBar({ summary }: FileBrowserSummaryBarProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 md:px-6 md:py-2.5 border-t border-border/40 bg-secondary/5 text-[10px] md:text-[11px] font-medium text-muted-foreground shrink-0">
      <span>
        {summary.directories} folder{summary.directories !== 1 ? 's' : ''}
      </span>
      <span className="opacity-30">&middot;</span>
      <span>
        {summary.files} file{summary.files !== 1 ? 's' : ''}
      </span>
      {summary.totalSize > 0 && (
        <>
          <span className="opacity-30">&middot;</span>
          <span>{formatBytesCompact(summary.totalSize)}</span>
        </>
      )}
    </div>
  );
}

export function FileBrowserUploadProgressBar({ progress }: FileBrowserUploadProgressBarProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 p-4 bg-background/80 backdrop-blur border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Uploading files...
        </span>
        <span className="text-xs font-mono font-bold text-primary">{progress}%</span>
      </div>
      <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
        <div
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="h-full bg-primary transition-all duration-300"
          role="progressbar"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
