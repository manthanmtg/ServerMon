'use client';
import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACCESS_MODES } from '@/lib/fleet/enums';
import { ExposeForm } from './schema';

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  back: () => void;
}

function FieldLabel({
  htmlFor,
  children,
  help,
}: {
  htmlFor: string;
  children: ReactNode;
  help: string;
}) {
  return (
    <label
      className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      htmlFor={htmlFor}
    >
      {children}
      <span title={help} aria-label={`${children} help`}>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </span>
    </label>
  );
}

export function StepAccess({ form, setForm, next, back }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Access &amp; TLS</h4>
        <p className="text-xs text-muted-foreground">
          Choose who can reach the route and whether TLS is terminated by ServerMon.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="expose-access"
            help="Controls whether the public route is open, uses ServerMon auth, or is constrained by a separate policy."
          >
            Access mode
          </FieldLabel>
          <select
            id="expose-access"
            value={form.accessMode}
            onChange={(e) =>
              setForm({
                ...form,
                accessMode: e.target.value as (typeof ACCESS_MODES)[number],
              })
            }
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {ACCESS_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="expose-tls-provider"
            help="Let's Encrypt lets ServerMon request the certificate. Use manual or reverse proxy only when certificates are managed outside this Hub."
          >
            TLS provider
          </FieldLabel>
          <select
            id="expose-tls-provider"
            value={form.tlsProvider ?? 'letsencrypt'}
            onChange={(e) =>
              setForm({
                ...form,
                tlsProvider: e.target.value as 'letsencrypt' | 'manual' | 'reverse_proxy',
              })
            }
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            disabled={!form.tlsEnabled}
          >
            <option value="letsencrypt">Let&apos;s Encrypt</option>
            <option value="manual">Manual certificate</option>
            <option value="reverse_proxy">Reverse proxy</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.tlsEnabled}
            onChange={(e) => setForm({ ...form, tlsEnabled: e.target.checked })}
          />
          TLS enabled
        </label>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.websocketEnabled}
            onChange={(e) => setForm({ ...form, websocketEnabled: e.target.checked })}
          />
          WebSocket support
          <span title="Enable for apps that use Socket.IO, live dashboards, terminals, or hot-reload channels.">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
        </label>

        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="expose-timeout"
            help="How long Nginx waits for the upstream service before closing an idle request."
          >
            Timeout seconds
          </FieldLabel>
          <Input
            id="expose-timeout"
            type="number"
            min={1}
            max={3600}
            value={form.timeoutSeconds}
            onChange={(e) =>
              setForm({
                ...form,
                timeoutSeconds: Math.max(1, Math.min(3600, Number(e.target.value) || 1)),
              })
            }
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="expose-body"
            help="Maximum upload/request body size accepted by Nginx for this route."
          >
            Max body MB
          </FieldLabel>
          <Input
            id="expose-body"
            type="number"
            min={1}
            max={1024}
            value={form.maxBodyMb}
            onChange={(e) =>
              setForm({
                ...form,
                maxBodyMb: Math.max(1, Math.min(1024, Number(e.target.value) || 1)),
              })
            }
          />
        </div>

        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.compression}
            onChange={(e) => setForm({ ...form, compression: e.target.checked })}
          />
          Compression
          <span title="Enables gzip for text, JSON, JavaScript, CSS, XML, and similar responses.">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
        </label>
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
