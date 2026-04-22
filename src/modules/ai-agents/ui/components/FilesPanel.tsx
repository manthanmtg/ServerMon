'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
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
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {files.map((file, i) => (
        <motion.div
          key={`${file}-${i}`}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.02 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs shadow-[0_0_18px_hsl(var(--primary)/0.08)] backdrop-blur-md transition-colors hover:border-primary/30 hover:bg-accent/40"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/70 text-primary shadow-[0_0_14px_hsl(var(--primary)/0.14)] transition-colors group-hover:border-primary/40 group-hover:bg-primary/10">
            <FileCode className="h-3.5 w-3.5" />
          </div>
          <span className="truncate font-mono text-foreground/90">{file}</span>
        </motion.div>
      ))}
    </div>
  );
}

export const FilesPanel = memo(FilesPanelInner);
