import Link from 'next/link';
import { ArrowUpRight, Boxes } from 'lucide-react';

export default function PythonEnvironmentsWidget() {
  return (
    <Link
      href="/python-environments"
      className="flex min-h-24 items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="rounded-lg bg-success/10 p-2 text-success">
        <Boxes size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block">Python Environments</strong>
        <span className="text-muted-foreground">Manage dependencies and revisions</span>
      </span>
      <ArrowUpRight size={17} className="text-muted-foreground" />
    </Link>
  );
}
