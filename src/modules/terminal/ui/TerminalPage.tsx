'use client';

import React from 'react';
import TerminalUI from './TerminalUI';

export default function TerminalPage() {
    const handleTerminalData = (data: string) => {
        // Basic terminal feedback for demonstration
        // In a real implementation, this would send data to the backend pty
        console.log('Terminal data:', data);
    };

    return (
        <div className="h-full flex flex-col animate-fade-in">
            <div className="flex-1 flex flex-col rounded-2xl border border-white/5 shadow-2xl overflow-hidden bg-slate-950/40 backdrop-blur-md">
                <div className="h-10 border-b border-white/5 bg-white/5 flex items-center px-4 gap-2 shrink-0">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-rose-500/80 shadow-lg shadow-rose-500/20" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/80 shadow-lg shadow-amber-500/20" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-lg shadow-emerald-500/20" />
                    </div>
                    <div className="flex-1 text-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 opacity-80">Secure Terminal — sm-term-01</span>
                    </div>
                    <div className="w-12 h-3" /> {/* Spacer to balance dots */}
                </div>
                <div className="flex-1 relative">
                    <TerminalUI onData={handleTerminalData} />
                </div>
            </div>

            <div className="mt-6 flex items-center justify-between px-2">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PTY Stream Active</span>
                    </div>
                    <div className="h-3 w-[1px] bg-slate-800" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">SSH-RSA 4096 Valid</span>
                </div>
                <span className="text-[10px] font-bold text-slate-600 font-mono">127.0.0.1:8912</span>
            </div>
        </div>
    );
}
