'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderManagedServerBlock } from '@/lib/nginx/renderer';

interface NginxHostWizardProps {
  onCreated?: () => void;
}

type Mode = 'guided' | 'raw';

function recordName(domain: string): string {
  const labels = domain.toLowerCase().split('.');
  if (labels.length <= 2) return '@';
  return labels.slice(0, -2).join('.');
}

function sampleName(domain: string): string {
  return domain.startsWith('*.') ? domain.replace('*.', 'test.') : domain;
}

function apexName(domain: string): string {
  return domain.startsWith('*.') ? domain.slice(2) : domain;
}

export function NginxHostWizard({ onCreated }: NginxHostWizardProps) {
  const [mode, setMode] = useState<Mode>('guided');
  const [fileName, setFileName] = useState('life.conf');
  const [domain, setDomain] = useState('life.manthanby.cv');
  const [upstreamHost, setUpstreamHost] = useState('127.0.0.1');
  const [upstreamPort, setUpstreamPort] = useState('8912');
  const [websocket, setWebsocket] = useState(true);
  const [rawConfig, setRawConfig] = useState(
    'server {\n  listen 80;\n  server_name life.manthanby.cv;\n}\n'
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (mode === 'raw') return rawConfig;
    try {
      return renderManagedServerBlock({
        domainPattern: domain,
        upstreamProtocol: 'http',
        upstreamHost,
        upstreamPort: Number(upstreamPort),
        redirectHttp: false,
        websocket,
        tlsMode: 'none',
        maxBodyMb: 32,
        timeoutSeconds: 60,
        headers: {},
      });
    } catch (previewError) {
      return `# ${previewError instanceof Error ? previewError.message : 'Preview failed'}`;
    }
  }, [domain, mode, rawConfig, upstreamHost, upstreamPort, websocket]);

  const dnsRecordName = recordName(domain);
  const wildcard = domain.startsWith('*.');

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        mode === 'raw'
          ? { mode, fileName, rawConfig }
          : {
              mode,
              fileName,
              domainPattern: domain,
              upstreamProtocol: 'http',
              upstreamHost,
              upstreamPort: Number(upstreamPort),
              redirectHttp: false,
              websocket,
              tlsMode: 'none',
              maxBodyMb: 32,
              timeoutSeconds: 60,
              headers: {},
            };
      const res = await fetch('/api/modules/nginx/vhosts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        result?: { path?: string; output?: string };
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessage(`Created ${data.result?.path ?? fileName}`);
      if (onCreated) onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Add host</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'guided' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('guided')}
            >
              Guided
            </Button>
            <Button
              type="button"
              variant={mode === 'raw' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('raw')}
            >
              Raw config
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          />
          <Input
            label="File name"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
          />
          {mode === 'guided' && (
            <Input
              label="Upstream port"
              type="number"
              value={upstreamPort}
              onChange={(event) => setUpstreamPort(event.target.value)}
            />
          )}
        </div>

        {mode === 'guided' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="Upstream host"
              value={upstreamHost}
              onChange={(event) => setUpstreamHost(event.target.value)}
            />
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input
                type="checkbox"
                checked={websocket}
                onChange={(event) => setWebsocket(event.target.checked)}
              />
              Websocket
            </label>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="nginx-raw-config" className="block text-sm font-medium">
              Raw config
            </label>
            <textarea
              id="nginx-raw-config"
              value={rawConfig}
              onChange={(event) => setRawConfig(event.target.value)}
              className="min-h-40 w-full rounded-lg border border-input bg-background p-3 font-mono text-xs"
            />
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <div className="font-medium text-foreground">DNS records</div>
          <div className="mt-1 font-mono">A {dnsRecordName} -&gt; &lt;server-ip&gt;</div>
          <div className="font-mono">AAAA {dnsRecordName} -&gt; &lt;server-ipv6&gt;</div>
          <div className="text-muted-foreground">Verify name: {sampleName(domain)}</div>
          {wildcard && (
            <div className="mt-1 text-warning">
              Wildcard DNS does not cover {apexName(domain)}; add a separate apex record if needed.
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium">Preview</div>
          <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 text-xs font-mono whitespace-pre">
            {preview}
          </pre>
        </div>

        {message && (
          <div className="rounded border border-success/30 bg-success/5 p-2 text-sm">{message}</div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={submit} loading={submitting}>
            Create host
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
