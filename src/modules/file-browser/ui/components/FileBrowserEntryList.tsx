'use client';

import React, { useMemo, useState } from 'react';
import { FileCode2, FileImage, FileText, FolderOpen, Folder, Logs, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DesktopEntryActions, MobileEntryActions } from './FileBrowserEntryActions';

export type FileKind = 'directory' | 'image' | 'log' | 'archive' | 'code' | 'text' | 'binary';

export interface FileEntry {
  name: string;
  path: string;
  parentPath: string;
  extension: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
  canRead: boolean;
  canWrite: boolean;
  kind: FileKind;
}

interface Props {
  entries: FileEntry[];
  selectedPath?: string | null;
  favoritePaths?: Set<string>;
  onNavigate: (path: string) => void;
  onPreview: (entry: FileEntry) => void;
  onEdit: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onCopyPath: (entry: FileEntry) => void;
  onFavorite?: (entry: FileEntry) => void;
}

function formatBytes(bytes: number) {
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

function fileIcon(entry: Pick<FileEntry, 'isDirectory' | 'kind'>) {
  if (entry.isDirectory) return Folder;
  if (entry.kind === 'image') return FileImage;
  if (entry.kind === 'code') return FileCode2;
  if (entry.kind === 'log') return Logs;
  return FileText;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function FileBrowserEntryList({
  entries,
  selectedPath,
  favoritePaths,
  onNavigate,
  onPreview,
  onEdit,
  onRename,
  onDelete,
  onDownload,
  onCopyPath,
  onFavorite,
}: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 44;
  const visibleHeight = 800;
  const useVirtualization = entries.length > 200;

  const { startIndex, visibleEntries, totalHeight } = useMemo(() => {
    if (!useVirtualization) {
      return {
        startIndex: 0,
        visibleEntries: entries,
        totalHeight: 'auto' as const,
      };
    }

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
    const count = Math.ceil(visibleHeight / rowHeight) + 10;
    return {
      startIndex: start,
      visibleEntries: entries.slice(start, start + count),
      totalHeight: entries.length * rowHeight,
    };
  }, [entries, scrollTop, useVirtualization]);

  if (visibleEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mb-4 border border-border/30">
          <FolderOpen className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">This folder is empty</h3>
        <p className="text-xs text-muted-foreground max-w-[240px]">
          Drop files here to upload, or use the toolbar to create new files and folders.
        </p>
        <div className="flex items-center gap-2 mt-4">
          <Upload className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-bold">
            Drag &amp; drop supported
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-background/30">
      {/* Mobile card list */}
      <div className="flex flex-col md:hidden min-h-0 flex-1 overflow-y-auto custom-scrollbar divide-y divide-border/30">
        {visibleEntries.map((entry) => {
          const Icon = fileIcon(entry);
          const isSelected = selectedPath === entry.path;

          return (
            <div
              key={entry.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors active:bg-accent/40',
                isSelected && 'bg-primary/5 border-l-2 border-l-primary'
              )}
            >
              <button
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                onClick={() => (entry.isDirectory ? onNavigate(entry.path) : onPreview(entry))}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors shadow-sm',
                    entry.isDirectory
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'bg-muted text-muted-foreground border border-border/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{entry.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {entry.isDirectory ? 'Folder' : formatBytes(entry.size)}
                    <span className="mx-1.5 opacity-30">·</span>
                    {formatDate(entry.modifiedAt)}
                  </p>
                </div>
              </button>
              <MobileEntryActions
                entry={entry}
                isFavorited={!!favoritePaths?.has(entry.path)}
                onEdit={onEdit}
                onRename={onRename}
                onDelete={onDelete}
                onDownload={onDownload}
                onCopyPath={onCopyPath}
                onFavorite={onFavorite}
              />
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div
        className="hidden md:flex min-h-0 flex-1 overflow-y-auto custom-scrollbar"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div
          style={{ height: totalHeight === 'auto' ? 'auto' : `${totalHeight}px` }}
          className="relative w-full"
        >
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">
                  Name
                </th>
                <th className="w-[100px] px-6 py-3 text-right text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">
                  Size
                </th>
                <th className="w-[140px] px-6 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50 hidden lg:table-cell">
                  Modified
                </th>
                <th className="w-[100px] px-4 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50 hidden xl:table-cell">
                  Perms
                </th>
                <th className="w-[160px] px-6 py-3 text-right text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50 pr-6">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="relative">
              {visibleEntries.map((entry, idx) => {
                const Icon = fileIcon(entry);
                const topOffset = useVirtualization ? (startIndex + idx) * rowHeight : 0;
                const isSelected = selectedPath === entry.path;

                return (
                  <tr
                    key={entry.path}
                    className={cn(
                      'group transition-colors',
                      isSelected ? 'bg-primary/5' : 'hover:bg-accent/30'
                    )}
                    style={
                      useVirtualization
                        ? {
                            position: 'absolute',
                            top: topOffset,
                            left: 0,
                            width: '100%',
                            height: rowHeight,
                            display: 'table',
                          }
                        : {}
                    }
                  >
                    <td className="px-6 py-1.5 min-w-0 border-b border-border/10">
                      <button
                        className="flex items-center gap-3 w-full text-left transition-colors hover:text-primary group/link"
                        onClick={() =>
                          entry.isDirectory ? onNavigate(entry.path) : onPreview(entry)
                        }
                      >
                        <div
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors shadow-sm',
                            entry.isDirectory
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : 'bg-muted text-muted-foreground group-hover/link:bg-primary/20 group-hover/link:text-primary border border-border/50',
                            isSelected &&
                              !entry.isDirectory &&
                              'bg-primary/20 text-primary border-primary/20'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span
                          className={cn(
                            'truncate font-medium text-[13px]',
                            isSelected && 'text-primary'
                          )}
                        >
                          {entry.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-1.5 text-right border-b border-border/10 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {entry.isDirectory ? '—' : formatBytes(entry.size)}
                      </span>
                    </td>
                    <td className="px-6 py-1.5 border-b border-border/10 hidden lg:table-cell whitespace-nowrap">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(entry.modifiedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 border-b border-border/10 hidden xl:table-cell whitespace-nowrap">
                      <code
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono"
                        title={entry.permissions}
                      >
                        {entry.permissions}
                      </code>
                    </td>
                    <td className="px-6 py-1.5 text-right pr-6 border-b border-border/10">
                      <DesktopEntryActions
                        entry={entry}
                        isFavorited={!!favoritePaths?.has(entry.path)}
                        onEdit={onEdit}
                        onRename={onRename}
                        onDelete={onDelete}
                        onDownload={onDownload}
                        onCopyPath={onCopyPath}
                        onFavorite={onFavorite}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
