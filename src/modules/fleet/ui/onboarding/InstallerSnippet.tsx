'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderInstallSnippet } from '@/lib/fleet/install-script';

type Kind = 'linux' | 'docker' | 'macos';

export function InstallerSnippet({
  token,
  nodeId,
  hubUrl,
}: {
  token: string;
  nodeId: string;
  hubUrl: string;
}) {
  const [kind, setKind] = useState<Kind>('linux');
  const [copied, setCopied] = useState(false);
  const script = renderInstallSnippet({ kind, token, nodeId, hubUrl });
  const copy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b border-border">
        {(['linux', 'docker', 'macos'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              'px-3 py-2 text-sm border-b-2 transition-colors',
              kind === k
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {k === 'linux' ? 'Linux (systemd)' : k === 'docker' ? 'Docker' : 'macOS'}
          </button>
        ))}
      </div>
      <div className="relative">
        <pre className="rounded-lg border border-border bg-card/50 p-3 text-xs overflow-auto font-mono whitespace-pre-wrap pr-12">
          {script}
        </pre>
        <Button
          variant="ghost"
          size="icon"
          onClick={copy}
          className="absolute top-2 right-2"
          aria-label="Copy install command"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
