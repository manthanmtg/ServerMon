'use client';

import { memo } from 'react';
import { FileCode } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Props {
  files: string[];
}

function FilesPanelInner({ files }: Props) {
  if (files.length === 0) {
    return <EmptyState label="No files modified in this session" />;
  }
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {files.map((file, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 text-xs"
        >
          <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="font-mono truncate">{file}</span>
        </div>
      ))}
    </div>
  );
}

export const FilesPanel = memo(FilesPanelInner);
