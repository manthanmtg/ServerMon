'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExposeForm } from './schema';

interface CreatedRoute {
  _id: string;
  name: string;
  domain: string;
  nginxConfigRevisionId?: string;
}

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  back: () => void;
  onCreated?: (route: CreatedRoute) => void;
  onCancel?: () => void;
}

export function StepCreate({ form, back, onCreated, onCancel }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRoute | null>(null);
  const [autoInsertedProxy, setAutoInsertedProxy] = useState(false);
  const [applied, setApplied] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        domain: form.domain,
        nodeId: form.nodeId,
        proxyRuleName: form.proxyRuleName,
        target: form.target,
        tlsEnabled: form.tlsEnabled,
        tlsProvider: form.tlsProvider,
        accessMode: form.accessMode,
        templateId: form.templateSlug,
      };
      const res = await fetch('/api/fleet/routes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        route?: CreatedRoute;
        autoInsertedProxy?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.route) throw new Error('Route missing in response');
      const summary = {
        _id: String(data.route._id),
        name: data.route.name,
        domain: data.route.domain,
        nginxConfigRevisionId: data.route.nginxConfigRevisionId,
      };
      setCreated(summary);
      setAutoInsertedProxy(Boolean(data.autoInsertedProxy));
      if (onCreated) onCreated(summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const applyNow = async () => {
    if (!created?.nginxConfigRevisionId) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/fleet/revisions/${encodeURIComponent(created.nginxConfigRevisionId)}/apply`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setApplied(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (created) {
    return (
      <div className="space-y-3 text-sm">
        <h4 className="text-sm font-semibold">Route created</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Created</Badge>
          {applied && <Badge variant="success">Applied</Badge>}
        </div>
        {autoInsertedProxy && (
          <div
            role="status"
            className="rounded-lg border border-success/30 bg-success/10 p-2 text-xs text-success"
          >
            Proxy rule auto-inserted: <span className="font-mono">{form.proxyRuleName}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Name: </span>
          {created.name}
        </div>
        <div>
          <span className="text-muted-foreground">Domain: </span>
          <span className="font-mono">{created.domain}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Route ID: </span>
          <span className="font-mono">{created._id}</span>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {created.nginxConfigRevisionId && !applied && (
            <Button type="button" onClick={applyNow} loading={applying} disabled={applying}>
              Apply now
            </Button>
          )}
          <a
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            href={`/fleet/routes/${encodeURIComponent(created._id)}`}
          >
            Open route
          </a>
          {onCancel && (
            <Button variant="outline" type="button" onClick={onCancel}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Create &amp; apply</h4>
        <p className="text-xs text-muted-foreground">
          Creating the route will save the Nginx revision and optionally apply it.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <ul className="space-y-1 text-sm">
        <li>
          <span className="text-muted-foreground">Name: </span>
          {form.name}
        </li>
        <li>
          <span className="text-muted-foreground">Slug: </span>
          <span className="font-mono">{form.slug}</span>
        </li>
        <li>
          <span className="text-muted-foreground">Domain: </span>
          <span className="font-mono">{form.domain}</span>
        </li>
        <li>
          <span className="text-muted-foreground">Proxy rule: </span>
          <span className="font-mono">{form.proxyRuleName}</span>
        </li>
        <li>
          <span className="text-muted-foreground">Access: </span>
          {form.accessMode} · TLS {form.tlsEnabled ? 'on' : 'off'}
        </li>
      </ul>
      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" type="button" onClick={back}>
          Back
        </Button>
        <Button type="button" onClick={submit} loading={submitting} disabled={submitting}>
          Create
        </Button>
      </div>
    </div>
  );
}
