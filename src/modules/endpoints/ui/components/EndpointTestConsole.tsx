'use client';

import {
  X,
  Copy,
  ChevronDown,
  LoaderCircle,
  Play,
  Terminal,
  Braces,
  ArrowRightLeft,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EndpointSnippetFormat, EndpointTestResult } from '../../types';

const copySnippetOptions: ReadonlyArray<{ label: string; format: EndpointSnippetFormat }> = [
  { label: 'Canonical URL', format: 'url' },
  { label: 'cURL command', format: 'curl' },
  { label: 'PowerShell script', format: 'powershell' },
  { label: 'JavaScript fetch', format: 'fetch' },
  { label: 'Node.js fetch', format: 'node' },
  { label: 'Python requests', format: 'python' },
];

interface EndpointTestConsoleProps {
  testBody: string;
  testResult: EndpointTestResult | null;
  testLoading: boolean;
  showCopyRequestMenu: boolean;
  copyRequestMenuRef: React.RefObject<HTMLDivElement | null>;
  onSetTestBody: (val: string) => void;
  onToggleCopyMenu: () => void;
  onClose: () => void;
  onCopySnippet: (format: EndpointSnippetFormat) => void;
  onCopyResponse: () => void;
  onRun: () => void;
}

export function EndpointTestConsole({
  testBody,
  testResult,
  testLoading,
  showCopyRequestMenu,
  copyRequestMenuRef,
  onSetTestBody,
  onToggleCopyMenu,
  onClose,
  onCopySnippet,
  onCopyResponse,
  onRun,
}: EndpointTestConsoleProps) {
  return (
    <div className="border-t border-border/40 bg-[#1e1e2e] animate-in slide-in-from-bottom-4 duration-500 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] backdrop-blur-2xl relative z-50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20 ring-1 ring-primary/20">
            <Terminal className="w-4 h-4 text-primary" />
          </div>
          <div>
            <span className="text-xs font-black text-white/90 uppercase tracking-widest">
              Interactive Test Console
            </span>
            <p className="text-[10px] text-white/40 font-medium">
              Draft and dispatch a test payload to your live endpoint
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRun}
            disabled={testLoading}
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {testLoading ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Fire Request
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all ring-1 ring-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5 h-[400px]">
        {/* Request Side */}
        <div className="p-6 overflow-y-auto relative custom-scrollbar bg-white/[0.01]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-primary/60" />
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest">
                Payload Ingress (JSON)
              </p>
            </div>
            <div className="relative" ref={copyRequestMenuRef}>
              <button
                onClick={onToggleCopyMenu}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest',
                  showCopyRequestMenu &&
                    'bg-white/10 border-primary/40 text-primary ring-2 ring-primary/20 shadow-lg'
                )}
              >
                <Copy className="w-3.5 h-3.5" />
                Export
                <ChevronDown
                  className={cn(
                    'w-3 h-3 transition-transform duration-300',
                    showCopyRequestMenu && 'rotate-180'
                  )}
                />
              </button>

              {showCopyRequestMenu && (
                <div className="absolute right-0 bottom-full mb-3 w-56 py-2 rounded-2xl border border-white/10 bg-[#2d2d3d] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-3 py-2 border-b border-white/5 mb-1.5">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                      Code Generator
                    </span>
                  </div>
                  {copySnippetOptions.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => onCopySnippet(opt.format)}
                      className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-between group"
                    >
                      {opt.label}
                      <ChevronDown className="w-3 h-3 -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="relative group/editor h-[300px]">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl blur opacity-0 group-hover/editor:opacity-100 transition duration-500" />
            <textarea
              value={testBody}
              onChange={(e) => onSetTestBody(e.target.value)}
              placeholder='{ "action": "test", "payload": { "key": "value" } }'
              className="relative w-full h-full bg-[#0d0d0d] p-5 rounded-2xl text-primary/90 text-xs font-mono outline-none resize-none ring-1 ring-white/5 focus:ring-primary/40 shadow-inner custom-scrollbar leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Response Side */}
        <div className="p-6 overflow-y-auto relative custom-scrollbar bg-white/[0.02]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Braces className="w-3.5 h-3.5 text-blue-500/60" />
              <p className="text-[11px] font-black text-white/40 uppercase tracking-widest">
                Payload Egress (RESPONSE)
              </p>
            </div>
            {testResult && (
              <button
                onClick={onCopyResponse}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                title="Copy response body to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
                Snapshot
              </button>
            )}
          </div>

          {testLoading ? (
            <div className="flex flex-col items-center justify-center h-[300px] rounded-2xl bg-[#0d0d0d] border border-dashed border-white/10 animate-pulse">
              <LoaderCircle className="w-10 h-10 animate-spin text-primary/40 mb-4" />
              <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                Interpreting Response...
              </span>
            </div>
          ) : testResult ? (
            <div className="space-y-4 animate-in fade-in duration-500">
              <div className="flex items-center gap-3 p-1 bg-[#0d0d0d] rounded-2xl border border-white/5">
                <div
                  className={cn(
                    'px-4 py-2 rounded-xl text-[11px] font-black font-mono shadow-lg h-10 flex items-center',
                    testResult.statusCode < 400
                      ? 'bg-success/20 text-success shadow-success/10'
                      : 'bg-destructive/20 text-destructive shadow-destructive/10'
                  )}
                >
                  HTTP {testResult.statusCode}
                </div>
                <div className="flex-1 flex items-center gap-4 px-3 text-[10px] font-black text-white/30 uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    {testResult.duration}ms
                  </div>
                </div>
              </div>

              <div className="relative group/response h-[244px]">
                <pre className="w-full h-full p-5 rounded-2xl bg-[#0d0d0d] text-white/80 text-[11px] font-mono leading-relaxed overflow-y-auto border border-white/5 shadow-inner custom-scrollbar whitespace-pre-wrap break-all ring-1 ring-white/5">
                  {testResult.body}
                </pre>
              </div>

              {testResult.stderr && (
                <div className="mt-4 p-4 rounded-2xl bg-destructive/5 border border-destructive/10 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-3.5 h-3.5 text-destructive/60" />
                    <p className="text-[9px] font-black text-destructive/60 uppercase tracking-widest leading-none">
                      ERROR STREAM (STDERR)
                    </p>
                  </div>
                  <pre className="text-destructive/80 text-[10px] font-mono whitespace-pre-wrap leading-tight italic pl-5.5">
                    {testResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] rounded-2xl bg-[#0d0d0d] border border-dashed border-white/5 group transition-all hover:border-white/10">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6 transition-transform group-hover:scale-110">
                <Play className="w-8 h-8 text-white/10 group-hover:text-primary transition-colors pl-1" />
              </div>
              <p className="text-xs font-black text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">
                Awaiting Dispatch
              </p>
              <p className="text-[10px] text-white/10 mt-2 font-medium">
                Press Fire Request or{' '}
                <kbd className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                  ⌘Enter
                </kbd>{' '}
                to launch
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
