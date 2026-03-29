'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, GitCommit, User, Calendar, Hash, ChevronRight, LoaderCircle, ArrowLeft, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GitCommitInfo } from '@/modules/file-browser/lib/file-browser';

interface Props {
  root: string;
  onClose: () => void;
}

export default function GitHistoryModal({ root, onClose }: Props) {
  console.log('GitHistoryModal mounted with root:', root);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/modules/file-browser/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, action: 'log', limit: 50 }),
      });
      const data = await res.json();
      if (data.success) {
        setCommits(data.result);
      }
    } catch (err) {
      console.error('Failed to fetch git logs', err);
    } finally {
      setLoading(false);
    }
  }, [root]);

  const fetchDiff = useCallback(async (hash: string) => {
    setLoadingDiff(true);
    try {
      const res = await fetch('/api/modules/file-browser/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, action: 'diff', hash }),
      });
      const data = await res.json();
      if (data.success) {
        setDiff(data.result);
      }
    } catch (err) {
      console.error('Failed to fetch diff', err);
    } finally {
      setLoadingDiff(false);
    }
  }, [root]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (selectedHash) {
      fetchDiff(selectedHash);
    } else {
      setDiff(null);
    }
  }, [selectedHash, fetchDiff]);

  const formatDiff = (rawDiff: string) => {
    return rawDiff.split('\n').map((line, i) => {
      let colorClass = 'text-foreground/70';
      if (line.startsWith('+') && !line.startsWith('+++')) colorClass = 'text-success bg-success/10';
      else if (line.startsWith('-') && !line.startsWith('---')) colorClass = 'text-destructive bg-destructive/10';
      else if (line.startsWith('@@')) colorClass = 'text-primary/70 bg-primary/5 font-bold';
      else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) colorClass = 'text-muted-foreground font-semibold';

      return (
        <div key={i} className={cn('px-4 py-0.5 font-mono text-[11px] whitespace-pre-wrap break-all', colorClass)}>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-md">
      <div className="relative w-full max-w-5xl h-full max-h-[800px] flex flex-col bg-slate-900 border border-border rounded-3xl shadow-2xl overflow-hidden shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <GitCommit className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Git Repository History</h2>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{root}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-accent" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0 divide-x divide-border">
          {/* Commit List */}
          <div className={cn(
            "flex flex-col min-h-0 transition-all duration-300",
            selectedHash ? "w-1/3" : "w-full"
          )}>
            <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <LoaderCircle className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs font-medium">Crunching logs...</span>
                </div>
              ) : commits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <Terminal className="w-8 h-8 opacity-20" />
                  <span className="text-xs">No commits found</span>
                </div>
              ) : (
                commits.map((c) => (
                  <button
                    key={c.hash}
                    onClick={() => setSelectedHash(c.hash === selectedHash ? null : c.hash)}
                    className={cn(
                      "group w-full text-left p-3 rounded-2xl transition-all duration-200 border border-transparent",
                      selectedHash === c.hash 
                        ? "bg-primary/10 border-primary/20 shadow-sm" 
                        : "hover:bg-accent hover:border-border/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <span className={cn(
                        "text-xs font-bold transition-colors truncate",
                        selectedHash === c.hash ? "text-primary" : "text-foreground"
                      )}>
                        {c.subject}
                      </span>
                      <Badge variant="outline" className="h-5 px-1.5 font-mono text-[9px] shrink-0 border-border/50 bg-background/50">
                        {c.hash.slice(0, 7)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(c.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Diff View */}
          {selectedHash && (
            <div className="flex-1 flex flex-col min-h-0 bg-background/30 animate-in slide-in-from-right-4 fade-in duration-300">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-card/30 shrink-0">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" className="h-8 px-2 gap-1.5 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => setSelectedHash(null)}>
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                  </Button>
                  <div className="h-4 w-px bg-border/50" />
                  <div className="flex items-center gap-2">
                    <Hash className="w-3 h-3 text-primary/70" />
                    <span className="text-[11px] font-mono font-bold text-primary">{selectedHash}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto py-4 custom-scrollbar bg-accent/5">
                {loadingDiff ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <LoaderCircle className="w-6 h-6 animate-spin text-primary" />
                    <span className="text-xs font-medium">Reconstructing diff...</span>
                  </div>
                ) : diff ? (
                  <div className="min-w-0">
                    {formatDiff(diff)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <span className="text-xs">Select a commit to view details</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--muted-foreground);
        }
      `}</style>
    </div>
  );
}
