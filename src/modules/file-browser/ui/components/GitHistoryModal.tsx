'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, GitCommit, User, Calendar, Hash, LoaderCircle, ArrowLeft, Terminal, Search, Clock, Copy, Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GitCommitInfo } from '@/modules/file-browser/lib/file-browser';
import { useToast } from '@/components/ui/toast';

interface Props {
  root: string;
  onClose: () => void;
}

const TIME_RANGES = [
  { label: '7 Days', value: '7 days ago' },
  { label: '30 Days', value: '30 days ago' },
  { label: '3 Months', value: '3 months ago' },
  { label: '6 Months', value: '6 months ago' },
  { label: 'All Time', value: 'all' },
];

export default function GitHistoryModal({ root, onClose }: Props) {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [since, setSince] = useState('30 days ago');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/modules/file-browser/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root, action: 'log', limit: 100, since }),
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
  }, [root, since]);

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

  const formatDate = (dateStr: string) => {
    try {
      if (!dateStr) return 'No date';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Invalid Date';
      return d.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied', description: 'Commit hash copied to clipboard', variant: 'success' });
  };

  const filteredCommits = commits.filter(c => 
    c.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.hash.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCommit = commits.find(c => c.hash === selectedHash);

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl h-full max-h-[850px] flex flex-col bg-background border border-border rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col border-b border-border bg-card/50 backdrop-blur-xl shrink-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-primary/10 text-primary shadow-inner">
                <GitCommit className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground tracking-tight">Git Repository History</h2>
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate max-w-[400px]">{root}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Time Range Selector */}
              <div className="flex items-center bg-muted/30 p-1 rounded-xl border border-border/50">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setSince(range.value)}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-200",
                      since === range.value 
                        ? "bg-primary text-primary-foreground shadow-lg" 
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              
              <div className="h-8 w-px bg-border/50 mx-1" />
              
              <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-all" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="px-6 pb-4 flex items-center gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input 
                type="text"
                placeholder="Search by subject, author, or hash..."
                className="w-full bg-muted/20 border border-border/50 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="text-[10px] font-bold text-muted-foreground/60 flex items-center gap-1.5 px-3 py-2 bg-muted/10 rounded-lg">
              <Clock className="w-3 h-3" />
              Showing {filteredCommits.length} commits
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0 divide-x divide-border overflow-hidden">
          {/* Commit List */}
          <div className={cn(
            "flex flex-col min-h-0 transition-all duration-300 bg-muted/5",
            selectedHash ? "w-2/5" : "w-full"
          )}>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <LoaderCircle className="w-10 h-10 animate-spin text-primary" />
                  <span className="text-sm font-semibold tracking-wide">Retrieving history...</span>
                </div>
              ) : filteredCommits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <Terminal className="w-12 h-12 opacity-10" />
                  <div className="text-center">
                    <p className="text-sm font-bold">No results found</p>
                    <p className="text-[11px] opacity-60">Try adjusting your time range or search query</p>
                  </div>
                </div>
              ) : (
                filteredCommits.map((c) => (
                  <button
                    key={c.hash}
                    onClick={() => setSelectedHash(c.hash === selectedHash ? null : c.hash)}
                    className={cn(
                      "group w-full text-left p-4 rounded-2xl transition-all duration-300 border",
                      selectedHash === c.hash 
                        ? "bg-primary/10 border-primary/30 shadow-lg shadow-primary/5" 
                        : "bg-card/40 border-border/30 hover:bg-accent/40 hover:border-primary/20 hover:-translate-y-0.5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <span className={cn(
                        "text-[13px] font-bold transition-colors leading-relaxed",
                        selectedHash === c.hash ? "text-primary" : "text-foreground group-hover:text-primary/80"
                      )}>
                        {c.subject}
                      </span>
                      <Badge variant="outline" className="h-6 px-2 font-mono text-[10px] shrink-0 border-border/50 bg-background/50 font-bold text-muted-foreground">
                        {c.hash.slice(0, 7)}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground/80 font-semibold">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[9px] text-primary shrink-0">
                          {c.author.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{c.author}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto bg-muted/10 px-2 py-0.5 rounded-md">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(c.date).split(',')[0]}</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Diff View */}
          {selectedHash && (
            <div className="flex-1 flex flex-col min-h-0 bg-accent/5 animate-in slide-in-from-right-8 fade-in duration-500">
              {/* Commit Detailed Info Header */}
              <div className="px-6 py-5 border-b border-border bg-card/40 shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="h-9 px-3 gap-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-xl" onClick={() => setSelectedHash(null)}>
                      <ArrowLeft className="w-4 h-4" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Full List</span>
                    </Button>
                    <div className="h-5 w-px bg-border/50 mx-1" />
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyToClipboard(selectedHash)}>
                      <Hash className="w-4 h-4 text-primary" />
                      <code className="text-xs font-mono font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10 transition-all group-hover:bg-primary/10">
                        {selectedHash}
                      </code>
                      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />}
                    </div>
                  </div>
                </div>
                
                <div className="bg-muted/10 rounded-2xl p-4 border border-border/50">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 rounded-xl bg-card border border-border/50 shadow-sm">
                      <MessageSquare className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-foreground mb-1 leading-normal">{selectedCommit?.subject}</h3>
                      {selectedCommit?.body && (
                        <p className="text-xs text-muted-foreground leading-relaxed italic">{selectedCommit.body}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-background/50 rounded-xl border border-border/30">
                      <User className="w-4 h-4 text-primary/70" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Author</p>
                        <p className="text-[11px] font-bold text-foreground truncate">{selectedCommit?.author} <span className="opacity-40 italic font-normal">&lt;{selectedCommit?.authorEmail}&gt;</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 px-3 py-2 bg-background/50 rounded-xl border border-border/30">
                      <Calendar className="w-4 h-4 text-primary/70" />
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Committed On</p>
                        <p className="text-[11px] font-bold text-foreground truncate">{selectedCommit ? formatDate(selectedCommit.date) : 'Loading...'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto py-6 custom-scrollbar bg-card/10">
                {loadingDiff ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <LoaderCircle className="w-10 h-10 animate-spin text-primary opacity-50" />
                    <span className="text-xs font-bold tracking-widest uppercase opacity-70">Synthesizing Diff...</span>
                  </div>
                ) : diff ? (
                  <div className="px-6">
                    <div className="bg-card/50 border border-border rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Changes Overview</span>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-success" />
                            <span className="text-[9px] font-bold text-success/80">Added</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-[9px] font-bold text-destructive/80">Removed</span>
                          </div>
                        </div>
                      </div>
                      <div className="py-2">
                        {formatDiff(diff)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest opacity-30">Select a commit to view diff</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 20px;
          border: 2px solid transparent;
          background-clip: content-box;
          min-height: 40px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.4);
          background-clip: content-box;
        }
      `}</style>
    </div>
  );
}
