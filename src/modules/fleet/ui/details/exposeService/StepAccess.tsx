'use client';
import { Button } from '@/components/ui/button';
import { ACCESS_MODES } from '@/lib/fleet/enums';
import { ExposeForm } from './schema';

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  back: () => void;
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
          <label className="block text-sm font-medium text-foreground" htmlFor="expose-access">
            Access mode
          </label>
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
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="expose-tls-provider"
          >
            TLS provider
          </label>
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
