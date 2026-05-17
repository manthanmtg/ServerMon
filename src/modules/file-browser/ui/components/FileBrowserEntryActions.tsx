'use client';

import { useState } from 'react';
import { Copy, Download, Heart, MoreHorizontal, Pencil, PenLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FileEntry } from './FileBrowserEntryList';

interface FileBrowserEntryActionHandlers {
  onEdit: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onCopyPath: (entry: FileEntry) => void;
  onFavorite?: (entry: FileEntry) => void;
}

interface FileBrowserEntryActionsProps extends FileBrowserEntryActionHandlers {
  entry: FileEntry;
  isFavorited: boolean;
}

export function MobileEntryActions({
  entry,
  isFavorited,
  onEdit,
  onRename,
  onDelete,
  onDownload,
  onCopyPath,
  onFavorite,
}: FileBrowserEntryActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="More file actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            {onFavorite && (
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onFavorite(entry);
                  setOpen(false);
                }}
              >
                <Heart
                  className={cn(
                    'h-3.5 w-3.5',
                    isFavorited ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                  )}
                />{' '}
                {isFavorited ? 'Unfavorite' : 'Favorite'}
              </button>
            )}
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCopyPath(entry);
                setOpen(false);
              }}
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" /> Copy Path
            </button>
            {!entry.isDirectory && (
              <>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(entry);
                    setOpen(false);
                  }}
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" /> Download
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(entry);
                    setOpen(false);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit
                </button>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(entry);
                    setOpen(false);
                  }}
                >
                  <PenLine className="h-3.5 w-3.5 text-muted-foreground" /> Rename
                </button>
              </>
            )}
            {entry.isDirectory && (
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs hover:bg-accent transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(entry);
                  setOpen(false);
                }}
              >
                <PenLine className="h-3.5 w-3.5 text-muted-foreground" /> Rename
              </button>
            )}
            <div className="my-1 h-px bg-border/50" />
            <button
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(entry);
                setOpen(false);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function DesktopEntryActions({
  entry,
  isFavorited,
  onEdit,
  onRename,
  onDelete,
  onDownload,
  onCopyPath,
  onFavorite,
}: FileBrowserEntryActionsProps) {
  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      {onFavorite && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', isFavorited && 'text-red-500 hover:text-red-600')}
          onClick={() => onFavorite(entry)}
          title={isFavorited ? 'Remove from shortcuts' : 'Add to shortcuts'}
          aria-label={isFavorited ? 'Remove from shortcuts' : 'Add to shortcuts'}
        >
          <Heart className={cn('h-3 w-3', isFavorited && 'fill-red-500')} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onCopyPath(entry)}
        title="Copy Path"
        aria-label="Copy path"
      >
        <Copy className="h-3 w-3" />
      </Button>
      {!entry.isDirectory && (
        <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onDownload(entry)}
        title="Download"
        aria-label="Download file"
      >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(entry)}
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onRename(entry)}
        title="Rename"
      >
        <PenLine className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(entry)}
        title="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
