'use client';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { renderServerBlock } from '@/lib/fleet/nginx';
import { renderFrpcToml } from '@/lib/fleet/toml';
import { ExposeForm } from './schema';

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  back: () => void;
}

export function StepPreview({ form, next, back }: Props) {
  const nginx = useMemo(() => {
    try {
      return renderServerBlock(
        {
          domain: form.domain || 'app.example.com',
          path: '/',
          tlsEnabled: form.tlsEnabled,
          http2Enabled: true,
          websocketEnabled: false,
          maxBodyMb: 32,
          timeoutSeconds: 60,
          compression: true,
          accessMode: form.accessMode,
          headers: {},
          slug: form.slug || 'route',
        },
        { frpsVhostPort: 8080 }
      );
    } catch (e) {
      return `# preview error: ${(e as Error).message}`;
    }
  }, [form]);

  const frpc = useMemo(() => {
    try {
      const type: 'http' | 'tcp' = form.target.protocol === 'tcp' ? 'tcp' : 'http';
      return renderFrpcToml({
        serverAddr: 'hub.example.com',
        serverPort: 7000,
        authToken: '<redacted>',
        node: {
          slug: 'node',
          frpcConfig: {
            protocol: 'tcp',
            tlsEnabled: true,
            tlsVerify: true,
            transportEncryptionEnabled: true,
            compressionEnabled: false,
            heartbeatInterval: 30,
            heartbeatTimeout: 90,
            poolCount: 1,
            advanced: {},
          },
          capabilities: {
            terminal: true,
            endpointRuns: true,
            processes: true,
            metrics: true,
            publishRoutes: true,
            tcpForward: true,
            fileOps: false,
            updates: true,
          },
          proxyRules: [
            {
              name: form.proxyRuleName || 'route',
              type,
              localIp: form.target.localIp,
              localPort: form.target.localPort,
              subdomain: type === 'http' ? form.slug || 'route' : undefined,
              customDomains: type === 'http' && form.domain ? [form.domain] : [],
              enabled: true,
              status: 'disabled',
            },
          ],
        },
      });
    } catch (e) {
      return `# preview error: ${(e as Error).message}`;
    }
  }, [form]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Preview</h4>
        <p className="text-xs text-muted-foreground">
          Configuration previews rendered from the form. TLS tokens shown are placeholders.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Nginx snippet</label>
          <pre
            aria-label="nginx snippet preview"
            className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre"
          >
            {nginx}
          </pre>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">frpc.toml</label>
          <pre
            aria-label="frpc toml preview"
            className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre"
          >
            {frpc}
          </pre>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Domain: <span className="font-mono">{form.domain || '—'}</span> · Target:{' '}
        <span className="font-mono">
          {form.target.localIp}:{form.target.localPort} ({form.target.protocol})
        </span>
      </div>
      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" type="button" onClick={back}>
          Back
        </Button>
        <Button type="button" onClick={next}>
          Next
        </Button>
      </div>
    </div>
  );
}
