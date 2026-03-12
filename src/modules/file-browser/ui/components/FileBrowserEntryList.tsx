'use client';

import React, { useMemo, useState } from 'react';
import {
    Copy,
    Download,
    FileCode2,
    FileImage,
    FileText,
    Folder,
    Logs,
    Pencil,
    Settings2,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    onNavigate: (path: string) => void;
    onPreview: (entry: FileEntry) => void;
    onEdit: (entry: FileEntry) => void;
    onRename: (entry: FileEntry) => void;
    onDelete: (entry: FileEntry) => void;
    onDownload: (entry: FileEntry) => void;
    onCopyPath: (entry: FileEntry) => void;
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

export function FileBrowserEntryList({
    entries,
    onNavigate,
    onPreview,
    onEdit,
    onRename,
    onDelete,
    onDownload,
    onCopyPath,
}: Props) {
    const [scrollTop, setScrollTop] = useState(0);
    const rowHeight = 44; // Reduced from 52
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

    return (
        <div className="flex flex-col min-h-0 flex-1 bg-background/30">
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar" onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                <div style={{ height: totalHeight === 'auto' ? 'auto' : `${totalHeight}px` }} className="relative">
                    <table className="w-full border-separate border-spacing-0 table-fixed">
                        <thead className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                            <tr>
                                <th className="w-[45%] px-6 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">Name</th>
                                <th className="w-[100px] px-6 py-3 text-right text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">Size</th>
                                <th className="w-[160px] px-6 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">Modified</th>
                                <th className="w-[110px] px-6 py-3 text-left text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50">Perms</th>
                                <th className="w-[180px] px-6 py-3 text-right text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest border-b border-border/50 pr-8">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="relative">
                            {visibleEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                        No files found in this directory
                                    </td>
                                </tr>
                            )}
                            {visibleEntries.map((entry, idx) => {
                                const Icon = fileIcon(entry);
                                const topOffset = useVirtualization ? (startIndex + idx) * rowHeight : 0;
                                
                                return (
                                    <tr
                                        key={entry.path}
                                        className="group hover:bg-accent/30 transition-colors"
                                        style={useVirtualization ? { 
                                            position: 'absolute', 
                                            top: topOffset, 
                                            left: 0, 
                                            width: '100%',
                                            height: rowHeight,
                                            display: 'table'
                                        } : {}}
                                    >
                                        <td className="px-6 py-1.5 min-w-0 border-b border-border/10">
                                            <button
                                                className="flex items-center gap-3 w-full text-left transition-colors hover:text-primary group/link"
                                                onClick={() => (entry.isDirectory ? onNavigate(entry.path) : onPreview(entry))}
                                            >
                                                <div className={cn(
                                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors shadow-sm",
                                                    entry.isDirectory ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground group-hover/link:bg-primary/20 group-hover/link:text-primary border border-border/50"
                                                )}>
                                                    <Icon className="h-3.5 w-3.5" />
                                                </div>
                                                <span className="truncate font-medium text-[13px]">{entry.name}</span>
                                            </button>
                                        </td>
                                        <td className="px-6 py-1.5 text-right border-b border-border/10">
                                            <span className="font-mono text-[11px] text-muted-foreground">
                                                {entry.isDirectory ? '—' : formatBytes(entry.size)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-1.5 border-b border-border/10">
                                            <span className="text-[11px] text-muted-foreground">
                                                {new Date(entry.modifiedAt).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: '2-digit'
                                                })}
                                            </span>
                                        </td>
                                        <td className="px-6 py-1.5 border-b border-border/10">
                                            <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                                                {entry.permissions}
                                            </code>
                                        </td>
                                        <td className="px-6 py-1.5 text-right pr-8 border-b border-border/10">
                                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCopyPath(entry)} title="Copy Path">
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                                {!entry.isDirectory && (
                                                    <>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDownload(entry)} title="Download">
                                                            <Download className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(entry)} title="Edit">
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRename(entry)} title="Rename">
                                                            <Settings2 className="h-3 w-3" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(entry)} title="Delete">
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
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
