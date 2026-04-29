'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderInstallSnippet } from '@/lib/fleet/install-script';

type Kind = 'linux' | 'docker' | 'macos';
type InstallSource = 'latest' | 'version' | 'source';

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
  const [installSource, setInstallSource] = useState<InstallSource>('latest');
  const [versionTarget, setVersionTarget] = useState('v0.1.1');
  const [sourceRef, setSourceRef] = useState('main');
  const [releaseBaseUrl, setReleaseBaseUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const isShellInstaller = kind !== 'docker';
  const script = renderInstallSnippet({
    kind,
    token,
    nodeId,
    hubUrl,
    installMode: installSource === 'source' ? 'source' : 'release',
    releaseChannel: installSource === 'version' ? 'version' : 'latest',
    versionTarget: installSource === 'version' ? versionTarget : undefined,
    sourceRef: installSource === 'source' ? sourceRef : undefined,
    releaseBaseUrl: releaseBaseUrl.trim() || undefined,
  });
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
      {isShellInstaller && (
        <div className="grid grid-cols-1 gap-2 rounded border border-border p-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Install source</span>
            <select
              aria-label="Install source"
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value as InstallSource)}
              className="flex h-9 w-full rounded border border-input bg-background px-2 text-sm"
            >
              <option value="latest">Latest release artifact</option>
              <option value="version">Pinned release artifact</option>
              <option value="source">Build from source</option>
            </select>
          </label>
          {installSource === 'version' && (
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Release version</span>
              <input
                aria-label="Release version"
                value={versionTarget}
                onChange={(e) => setVersionTarget(e.target.value)}
                className="flex h-9 w-full rounded border border-input bg-background px-2 text-sm"
                placeholder="v0.1.1"
              />
            </label>
          )}
          {installSource === 'source' && (
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Source ref</span>
              <input
                aria-label="Source ref"
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                className="flex h-9 w-full rounded border border-input bg-background px-2 text-sm"
                placeholder="main"
              />
            </label>
          )}
          {installSource !== 'source' && (
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-foreground">Release base URL</span>
              <input
                aria-label="Release base URL"
                value={releaseBaseUrl}
                onChange={(e) => setReleaseBaseUrl(e.target.value)}
                className="flex h-9 w-full rounded border border-input bg-background px-2 text-sm"
                placeholder="Optional mirror URL"
              />
            </label>
          )}
        </div>
      )}
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
