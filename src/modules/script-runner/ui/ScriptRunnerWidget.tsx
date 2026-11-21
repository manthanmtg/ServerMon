'use client';

import Link from 'next/link';
import { ArrowUpRight, SquareTerminal } from 'lucide-react';

export default function ScriptRunnerWidget() {
  return (
    <Link
      href="/scripts"
      className="flex min-h-24 items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="rounded-lg bg-success/10 p-2 text-success">
        <SquareTerminal size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-foreground">Script Runner</strong>
        <span className="text-muted-foreground">Open scripts and runs</span>
      </span>
      <ArrowUpRight size={17} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
