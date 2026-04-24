'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ACCESS_MODES } from '@/lib/fleet/enums';

interface RouteTemplate {
  _id: string;
  name: string;
  slug: string;
  kind: 'builtin' | 'custom';
  description?: string;
  defaults: {
    localPort?: number;
    protocol: 'http' | 'https' | 'tcp';
    websocket: boolean;
    timeoutSec: number;
    uploadBodyMb: number;
    headers: Record<string, string>;
    accessMode: string;
    healthPath?: string;
    logLevel: string;
  };
}

interface NewTemplateForm {
  name: string;
  slug: string;
  description: string;
  protocol: 'http' | 'https' | 'tcp';
  websocket: boolean;
  timeoutSec: number;
  uploadBodyMb: number;
  accessMode: (typeof ACCESS_MODES)[number];
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const INITIAL_FORM: NewTemplateForm = {
  name: '',
  slug: '',
  description: '',
  protocol: 'http',
  websocket: false,
  timeoutSec: 60,
  uploadBodyMb: 32,
  accessMode: 'servermon_auth',
  logLevel: 'info',
};

export function RouteTemplatePicker() {
  const [templates, setTemplates] = useState<RouteTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewTemplateForm>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RouteTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/templates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.templates ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        defaults: {
          protocol: form.protocol,
          websocket: form.websocket,
          timeoutSec: form.timeoutSec,
          uploadBodyMb: form.uploadBodyMb,
          headers: {},
          accessMode: form.accessMode,
          logLevel: form.logLevel,
        },
      };
      const res = await fetch('/api/fleet/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        throw new Error(respBody.error ?? `HTTP ${res.status}`);
      }
      setShowNew(false);
      setForm(INITIAL_FORM);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/templates/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Route templates</CardTitle>
          <Button onClick={() => setShowNew((v) => !v)}>
            {showNew ? 'Close' : 'New template'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {showNew && (
            <div className="space-y-3 rounded border border-border p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  label="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  label="Slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
                <Input
                  label="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                <div className="space-y-1.5">
                  <label htmlFor="tpl-proto" className="block text-sm font-medium text-foreground">
                    Protocol
                  </label>
                  <select
                    id="tpl-proto"
                    value={form.protocol}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        protocol: e.target.value as NewTemplateForm['protocol'],
                      })
                    }
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="http">http</option>
                    <option value="https">https</option>
                    <option value="tcp">tcp</option>
                  </select>
                </div>
                <Input
                  label="Timeout (sec)"
                  type="number"
                  value={form.timeoutSec}
                  onChange={(e) => setForm({ ...form, timeoutSec: Number(e.target.value) })}
                />
                <Input
                  label="Upload body (MB)"
                  type="number"
                  value={form.uploadBodyMb}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      uploadBodyMb: Number(e.target.value),
                    })
                  }
                />
                <div className="space-y-1.5">
                  <label htmlFor="tpl-access" className="block text-sm font-medium text-foreground">
                    Access mode
                  </label>
                  <select
                    id="tpl-access"
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
                <label className="flex items-center gap-2 text-sm pt-5">
                  <input
                    type="checkbox"
                    checked={form.websocket}
                    onChange={(e) => setForm({ ...form, websocket: e.target.checked })}
                  />
                  Websocket
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowNew(false)} type="button">
                  Cancel
                </Button>
                <Button
                  onClick={createTemplate}
                  disabled={busy || !form.name || !form.slug}
                  loading={busy}
                  type="button"
                >
                  Save template
                </Button>
              </div>
            </div>
          )}
          {!templates && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {templates && templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No templates available.</p>
          )}
          {templates && templates.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t._id} className="rounded border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium text-sm">{t.name}</h3>
                    <Badge variant={t.kind === 'builtin' ? 'secondary' : 'outline'}>{t.kind}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground min-h-[32px]">
                    {t.description ?? '—'}
                  </p>
                  <div className="text-xs space-y-0.5">
                    <div>
                      <span className="text-muted-foreground">Protocol: </span>
                      {t.defaults.protocol}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Access: </span>
                      {t.defaults.accessMode}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Timeout: </span>
                      {t.defaults.timeoutSec}s
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max body: </span>
                      {t.defaults.uploadBodyMb} MB
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelected(t)}>
                      Use template
                    </Button>
                    {t.kind === 'custom' && (
                      <Button variant="ghost" size="sm" onClick={() => removeTemplate(t._id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Template ${selected.name}`}
        >
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Create a public route pre-filled from this template by using the Expose Service
                wizard on a node page. The defaults shown below will be used.
              </p>
              <pre className="rounded border border-border bg-muted/30 p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap font-mono">
                {JSON.stringify(selected.defaults, null, 2)}
              </pre>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
