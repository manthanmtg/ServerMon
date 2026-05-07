'use client';

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Play,
  Rocket,
  Server,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppTemplateId, ManagedAppDTO } from '../types';

interface FormState {
  templateId: AppTemplateId;
  name: string;
  sourcePath: string;
  domain: string;
  port: string;
  install: string;
  build: string;
  start: string;
  healthCheckPath: string;
  envText: string;
}

const initialForm: FormState = {
  templateId: 'nextjs',
  name: '',
  sourcePath: '',
  domain: '',
  port: '3010',
  install: 'pnpm install --frozen-lockfile',
  build: 'pnpm build',
  start: 'pnpm start',
  healthCheckPath: '/',
  envText: '',
};

const templates: Array<{ id: AppTemplateId; label: string; description: string }> = [
  {
    id: 'nextjs',
    label: 'Next.js App',
    description: 'Pure Next.js app deployed with managed releases, systemd, and Nginx.',
  },
];

function parseEnvText(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function statusBadge(app: ManagedAppDTO) {
  if (app.status === 'running') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Running
      </Badge>
    );
  }
  if (app.status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return <Badge variant="secondary">{app.status}</Badge>;
}

function fieldClassName() {
  return 'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20';
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function AppsPage() {
  const [apps, setApps] = useState<ManagedAppDTO[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/apps', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load apps');
      setApps(data.apps || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(
    () => ({
      total: apps.length,
      running: apps.filter((app) => app.status === 'running').length,
      failed: apps.filter((app) => app.status === 'failed').length,
    }),
    [apps]
  );

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const createApp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/modules/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: form.templateId,
          name: form.name,
          sourcePath: form.sourcePath,
          domain: form.domain,
          port: Number(form.port),
          commands: {
            install: form.install,
            build: form.build,
            start: form.start,
          },
          healthCheckPath: form.healthCheckPath || '/',
          envVars: parseEnvText(form.envText),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create app');
      setForm(initialForm);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    } finally {
      setSubmitting(false);
    }
  };

  const deployApp = async (appId: string) => {
    setDeployingId(appId);
    setError(null);
    try {
      const response = await fetch(`/api/modules/apps/${appId}/deploy`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.deployment?.error || 'Deploy failed');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
      await load();
    } finally {
      setDeployingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Boxes className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xl font-semibold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Managed apps</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Server className="h-5 w-5 text-success" />
            <div>
              <div className="text-xl font-semibold">{summary.running}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <div className="text-xl font-semibold">{summary.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              New App
            </CardTitle>
            <CardDescription>
              Pick a template, point ServerMon at the source repo, and configure how it should run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createApp} className="space-y-4">
              <Field
                id="app-template"
                label="Template"
                hint={templates.find((template) => template.id === form.templateId)?.description}
              >
                <select
                  id="app-template"
                  className={fieldClassName()}
                  value={form.templateId}
                  onChange={(event) =>
                    updateForm('templateId', event.target.value as AppTemplateId)
                  }
                  required
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="app-name" label="App name">
                  <input
                    id="app-name"
                    className={fieldClassName()}
                    placeholder="Inventory Portal"
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    required
                  />
                </Field>
                <Field id="source-path" label="Source path">
                  <input
                    id="source-path"
                    className={fieldClassName()}
                    placeholder="/srv/apps/inventory-portal"
                    value={form.sourcePath}
                    onChange={(event) => updateForm('sourcePath', event.target.value)}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <Field id="app-domain" label="Domain">
                  <input
                    id="app-domain"
                    className={fieldClassName()}
                    placeholder="app.example.com"
                    value={form.domain}
                    onChange={(event) => updateForm('domain', event.target.value)}
                    required
                  />
                </Field>
                <Field id="local-port" label="Local port">
                  <input
                    id="local-port"
                    className={fieldClassName()}
                    placeholder="3010"
                    type="number"
                    min="1"
                    max="65535"
                    value={form.port}
                    onChange={(event) => updateForm('port', event.target.value)}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="install-command" label="Install command">
                  <input
                    id="install-command"
                    className={fieldClassName()}
                    placeholder="pnpm install --frozen-lockfile"
                    value={form.install}
                    onChange={(event) => updateForm('install', event.target.value)}
                    required
                  />
                </Field>
                <Field id="build-command" label="Build command">
                  <input
                    id="build-command"
                    className={fieldClassName()}
                    placeholder="pnpm build"
                    value={form.build}
                    onChange={(event) => updateForm('build', event.target.value)}
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="start-command" label="Start command">
                  <input
                    id="start-command"
                    className={fieldClassName()}
                    placeholder="pnpm start"
                    value={form.start}
                    onChange={(event) => updateForm('start', event.target.value)}
                    required
                  />
                </Field>
                <Field id="health-check-path" label="Health check path">
                  <input
                    id="health-check-path"
                    className={fieldClassName()}
                    placeholder="/"
                    value={form.healthCheckPath}
                    onChange={(event) => updateForm('healthCheckPath', event.target.value)}
                  />
                </Field>
              </div>

              <Field
                id="environment-variables"
                label="Environment variables"
                hint="One KEY=value pair per line. Secret-looking values are masked after saving."
              >
                <textarea
                  id="environment-variables"
                  className={`${fieldClassName()} min-h-[132px] resize-y`}
                  placeholder={
                    'NEXT_PUBLIC_APP_URL=https://app.example.com\nAPI_BASE_URL=https://api.example.com'
                  }
                  value={form.envText}
                  onChange={(event) => updateForm('envText', event.target.value)}
                />
              </Field>

              <Button type="submit" className="w-full" loading={submitting}>
                <Rocket className="h-4 w-4" />
                Create App
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 text-primary" />
                      {app.name}
                    </CardTitle>
                    <CardDescription className="mt-1">{app.sourcePath}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(app)}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => deployApp(app.id)}
                      loading={deployingId === app.id}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Deploy
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Public URL</div>
                    <a
                      href={`https://${app.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 font-medium text-primary"
                    >
                      {app.domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Local port</div>
                    <div className="mt-1 font-medium">127.0.0.1:{app.port}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Current release</div>
                    <div className="mt-1 truncate font-medium">
                      {app.currentReleaseId || 'Not deployed'}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                  <div className="mb-2 font-medium">DNS</div>
                  <code>
                    {app.dns?.summary ||
                      `Create A record for ${app.domain} pointing at this server public IP.`}
                  </code>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Commands</div>
                    <pre className="whitespace-pre-wrap text-xs">{`${app.commands.install}\n${app.commands.build}\n${app.commands.start}`}</pre>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Latest logs
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                      {app.releases.at(-1)?.logs.join('\n') || 'No deployments yet.'}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {apps.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Create your first app to start managing deployments from ServerMon.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
