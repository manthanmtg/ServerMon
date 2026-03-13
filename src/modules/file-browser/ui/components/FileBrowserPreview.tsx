'use client';

import React from 'react';
import Image from 'next/image';
import { 
    Download, 
    Eye, 
    Pencil, 
    Save, 
    Terminal, 
    X,
    FileText,
    FileCode2,
    FileImage,
    Logs,
    Clock,
    Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { FileEntry, FileKind } from './FileBrowserEntryList';

interface PreviewFile {
    path: string;
    name: string;
    kind: FileKind;
    extension: string;
    size: number;
    modifiedAt: string;
    canWrite: boolean;
    permissions: string;
    content?: string;
    truncated?: boolean;
    encoding?: 'utf8' | 'base64';
    mimeType?: string;
    tailLines?: string[];
}

interface Props {
    entry: FileEntry | null;
    preview: PreviewFile | null;
    loading: boolean;
    isEditing: boolean;
    editorValue: string;
    saving: boolean;
    onEditorChange: (value: string) => void;
    onSave: () => void;
    onClose: () => void;
    onEdit: () => void;
    onDownload: () => void;
    autoRefreshLogs: boolean;
    onToggleAutoRefreshLogs: (value: boolean) => void;
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

export function FileBrowserPreview({
    entry,
    preview,
    loading,
    isEditing,
    editorValue,
    saving,
    onEditorChange,
    onSave,
    onClose,
    onEdit,
    onDownload,
    autoRefreshLogs,
    onToggleAutoRefreshLogs,
}: Props) {
    if (!entry) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-4">
                    <Eye className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Preview</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">
                    Select a file to preview or edit its contents.
                </p>
            </div>
        );
    }

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex h-full items-center justify-center">
                    <Spinner size="lg" />
                </div>
            );
        }

        if (!preview) return null;

        if (preview.kind === 'image' && preview.content) {
            return (
                <div className="flex h-full items-center justify-center p-8 bg-black/5 rounded-xl overflow-hidden">
                    <Image
                        src={`data:${preview.mimeType};base64,${preview.content}`}
                        alt={preview.name}
                        className="max-h-full max-w-full rounded-lg shadow-2xl object-contain animate-in zoom-in-95 duration-300"
                        width={800}
                        height={600}
                        unoptimized
                    />
                </div>
            );
        }

        if (isEditing) {
            return (
                <div className="relative flex flex-col h-full bg-secondary/10 rounded-xl border border-border overflow-hidden">
                    <textarea
                        value={editorValue}
                        onChange={(e) => onEditorChange(e.target.value)}
                        className="flex-1 resize-none bg-transparent p-6 font-mono text-sm focus:outline-none"
                        spellCheck={false}
                    />
                    <div className="flex items-center justify-between px-4 py-2 bg-background border-t border-border">
                        <span className="text-[10px] text-muted-foreground uppercase font-mono">
                            UTF-8 • {editorValue.length} chars
                        </span>
                        <Button size="sm" onClick={onSave} loading={saving} className="h-8 gap-2">
                            <Save className="w-3.5 h-3.5" />
                            Save Changes
                        </Button>
                    </div>
                </div>
            );
        }

        if (preview.kind === 'log' && preview.tailLines) {
            return (
                <div className="flex flex-col h-full bg-black/90 text-zinc-100 rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-primary" />
                            <span className="text-xs font-mono font-medium">Log Viewer</span>
                        </div>
                        <button 
                            onClick={() => onToggleAutoRefreshLogs(!autoRefreshLogs)}
                            className={cn(
                                "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors",
                                autoRefreshLogs ? "bg-primary text-primary-foreground" : "bg-white/10 text-zinc-400 hover:bg-white/20"
                            )}
                        >
                            {autoRefreshLogs ? 'Live ON' : 'Live OFF'}
                        </button>
                    </div>
                    <pre className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed selection:bg-primary/30">
                        {preview.tailLines.map((line, i) => (
                            <div key={i} className="whitespace-pre-wrap py-0.5 border-l-2 border-transparent hover:border-primary/40 hover:bg-white/5 px-2 transition-colors">
                                {line}
                            </div>
                        ))}
                    </pre>
                </div>
            );
        }

        if (preview.content) {
            return (
                <div className="flex flex-col h-full bg-secondary/5 rounded-xl border border-border overflow-hidden shadow-sm">
                    <pre className="flex-1 overflow-auto p-8 font-mono text-sm leading-relaxed selection:bg-primary/20">
                        {preview.content}
                    </pre>
                    {preview.truncated && (
                        <div className="px-5 py-3 bg-warning/10 border-t border-warning/20 text-warning text-xs font-medium">
                            Displaying first {formatBytes(preview.size)} of this large file.
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground bg-secondary/5 rounded-xl border border-dashed border-border/60">
                <FileText className="h-10 w-10 mb-4 opacity-20" />
                <p className="text-sm font-medium">No preview available for this file type.</p>
                <p className="text-xs mt-1">Try downloading it to view locally.</p>
            </div>
        );
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-background/60">
            {/* Header */}
                <div className="flex flex-col border-b border-border/40 shrink-0">
                    <div className="flex items-center justify-between px-4 py-4 md:px-6 md:py-6">
                        <div className="flex items-center gap-3 md:gap-5 min-w-0">
                            <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/10 shrink-0">
                                {entry.kind === 'image' ? <FileImage className="w-5 h-5 md:w-7 md:h-7" /> : 
                                 entry.kind === 'log' ? <Logs className="w-5 h-5 md:w-7 md:h-7" /> : 
                                 entry.kind === 'code' ? <FileCode2 className="w-5 h-5 md:w-7 md:h-7" /> : <FileText className="w-5 h-5 md:w-7 md:h-7" />}
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-foreground truncate text-base md:text-xl tracking-tight leading-tight mb-1 md:mb-2" title={entry.name}>
                                    {entry.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase font-black tracking-widest bg-primary/20 text-primary border-primary/20 ring-1 ring-primary/10">
                                        {entry.kind}
                                    </Badge>
                                    <div className="h-1 w-1 rounded-full bg-border" />
                                    <span className="text-[10px] md:text-xs font-semibold text-muted-foreground/70 uppercase tracking-tighter">
                                        {entry.extension || 'no ext'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2 ml-2 md:ml-4 shrink-0">
                            {preview?.canWrite && !isEditing && (
                                <Button variant="outline" size="sm" onClick={onEdit} className="h-8 md:h-10 gap-1.5 md:gap-2 shadow-sm border-border/60 hover:bg-accent hover:border-border font-semibold text-xs">
                                    <Pencil className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    <span className="hidden sm:inline">Edit</span>
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={onDownload} className="h-8 md:h-10 px-2.5 md:px-3.5 shadow-sm border-border/60 hover:bg-accent hover:border-border">
                                <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
                                <X className="w-4 h-4 md:w-5 md:h-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Metadata Section */}
                    <div className="flex flex-wrap md:grid md:grid-cols-3 md:divide-x divide-border/30 bg-secondary/5 border-t border-border/30 overflow-hidden">
                        <div className="px-4 py-2.5 md:px-6 md:py-4 flex items-center gap-2 md:flex-col md:items-start md:gap-1.5 transition-colors hover:bg-secondary/10">
                            <span className="text-[9px] md:text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.15em] md:tracking-[0.2em] leading-none">Modified</span>
                            <div className="flex items-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-bold text-foreground/90">
                                <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary/70 hidden md:block" />
                                {new Date(entry.modifiedAt).toLocaleString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        </div>
                        <div className="px-4 py-2.5 md:px-6 md:py-4 flex items-center gap-2 md:flex-col md:items-start md:gap-1.5 transition-colors hover:bg-secondary/10">
                            <span className="text-[9px] md:text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.15em] md:tracking-[0.2em] leading-none">Size</span>
                            <div className="flex items-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-bold text-foreground/90">
                                <FileText className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary/70 hidden md:block" />
                                {formatBytes(entry.size)}
                            </div>
                        </div>
                        <div className="px-4 py-2.5 md:px-6 md:py-4 flex items-center gap-2 md:flex-col md:items-start md:gap-1.5 transition-colors hover:bg-secondary/10">
                            <span className="text-[9px] md:text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.15em] md:tracking-[0.2em] leading-none">Perms</span>
                            <div className="flex items-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-bold text-foreground/90">
                                <Shield className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary/70 hidden md:block" />
                                <code className="text-[10px] md:text-[11px] font-mono bg-background/80 px-1.5 py-0.5 rounded border border-border/40 text-primary shadow-sm tracking-tight">
                                    {entry.permissions}
                                </code>
                            </div>
                        </div>
                    </div>
                </div>

            <div className="flex-1 min-h-0 p-3 md:p-6">
                {renderContent()}
            </div>
        </div>
    );
}
