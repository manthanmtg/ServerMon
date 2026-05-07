'use client';

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Eye,
  EyeOff,
  Globe2,
  HardDrive,
  LoaderCircle,
  Lock,
  Logs,
  Play,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DatabaseTemplateId, ManagedDatabaseDTO } from '../types';

interface TemplateOption {
  id: DatabaseTemplateId;
  label: string;
  versions: string[];
  defaultVersion: string;
  defaultPort: string;
  defaultUsername: string;
  defaultDatabaseName: string;
  description: string;
}

interface FormState {
  templateId: DatabaseTemplateId;
  version: string;
  name: string;
  port: string;
  username: string;
  password: string;
  databaseName: string;
  publicRoute: boolean;
  publicHost: string;
  sslMode: 'disable' | 'prefer' | 'require';
  confirmedPublicExposure: boolean;
}

const templates: TemplateOption[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    versions: ['15', '16', '17'],
    defaultVersion: '17',
    defaultPort: '5432',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
    description: 'Reliable SQL database for transactional application workloads.',
  },
  {
    id: 'mongo',
    label: 'MongoDB',
    versions: ['7', '8'],
    defaultVersion: '8',
    defaultPort: '27017',
    defaultUsername: 'root',
    defaultDatabaseName: 'appdb',
    description: 'Document database with simple JSON-style persistence.',
  },
  {
    id: 'mysql',
    label: 'MySQL',
    versions: ['8', '9'],
    defaultVersion: '8',
    defaultPort: '3306',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
    description: 'Popular relational database for web application stacks.',
  },
];

const templateMap = Object.fromEntries(
  templates.map((template) => [template.id, template])
) as Record<DatabaseTemplateId, TemplateOption>;

const initialForm: FormState = {
  templateId: 'postgres',
  version: '17',
  name: '',
  port: '5432',
  username: 'servermon',
  password: '',
  databaseName: 'servermon',
  publicRoute: false,
  publicHost: '',
  sslMode: 'disable',
  confirmedPublicExposure: false,
};

const DEPLOY_PROGRESS_MESSAGES = [
  'Deploy request sent to ServerMon.',
  'Preparing host data directory.',
  'Removing any existing container with the same managed name.',
  'Pulling the Docker image. First pulls can take a few minutes.',
  'Starting the database container and waiting for Docker to return.',
];

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

function statusBadge(status: ManagedDatabaseDTO['status']) {
  const variants: Record<ManagedDatabaseDTO['status'], BadgeVariant> = {
    draft: 'secondary',
    deploying: 'warning',
    running: 'success',
    stopped: 'outline',
    failed: 'destructive',
    unknown: 'secondary',
  };
  return <Badge variant={variants[status]}>{status}</Badge>;
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function formToPayload(form: FormState) {
  return {
    name: form.name,
    templateId: form.templateId,
    version: form.version,
    port: Number(form.port),
    username: form.username,
    password: form.password,
    databaseName: form.databaseName,
    publicRoute: form.publicRoute,
    publicHost: form.publicRoute && form.publicHost.trim() ? form.publicHost.trim() : undefined,
    sslMode: form.sslMode,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<ManagedDatabaseDTO[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [operationLogs, setOperationLogs] = useState<Record<string, string[]>>({});
  const [revealedPassword, setRevealedPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/databases', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load databases');
      setDatabases(data.databases || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load databases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(
    () => ({
      total: databases.length,
      running: databases.filter((database) => database.status === 'running').length,
      failed: databases.filter((database) => database.status === 'failed').length,
      publicCount: databases.filter((database) => database.publicRoute).length,
    }),
    [databases]
  );

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTemplate = (templateId: DatabaseTemplateId) => {
    const template = templateMap[templateId];
    setForm((current) => ({
      ...current,
      templateId,
      version: template.defaultVersion,
      port: template.defaultPort,
      username: template.defaultUsername,
      databaseName: template.defaultDatabaseName,
    }));
  };

  const copyText = async (value: string) => {
    await navigator.clipboard?.writeText(value);
  };

  const appendOperationLog = (databaseId: string, message: string) => {
    setOperationLogs((current) => ({
      ...current,
      [databaseId]: [...(current[databaseId] ?? []), `[UI] ${message}`].slice(-12),
    }));
  };

  const pollDatabaseUntilDone = async (databaseId: string) => {
    let sawDeploying = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(1500);
      const response = await fetch('/api/modules/databases', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to refresh databases');

      const nextDatabases = data.databases || [];
      setDatabases(nextDatabases);
      const target = nextDatabases.find(
        (database: ManagedDatabaseDTO) => database.id === databaseId
      );
      if (!target) return;
      if (target.status === 'deploying') sawDeploying = true;
      if (target.status === 'running' || target.status === 'failed') return;
      if (sawDeploying && target.status !== 'deploying') return;
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.publicRoute && !form.confirmedPublicExposure) {
      setError('Confirm public exposure before creating a public database route.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/modules/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create database');
      setForm(initialForm);
      setFormOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setSubmitting(false);
    }
  };

  const deploy = async (database: ManagedDatabaseDTO) => {
    setWorkingId(database.id);
    setError(null);
    setDatabases((current) =>
      current.map((item) =>
        item.id === database.id
          ? {
              ...item,
              status: 'deploying',
            }
          : item
      )
    );
    setOperationLogs((current) => ({
      ...current,
      [database.id]: DEPLOY_PROGRESS_MESSAGES.map((message) => `[UI] ${message}`),
    }));
    try {
      const response = await fetch(`/api/modules/databases/${database.id}/deploy`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to queue database deploy');
      appendOperationLog(database.id, 'Deployment accepted. Watching backend status and logs.');
      await pollDatabaseUntilDone(database.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deploy database');
    } finally {
      setWorkingId(null);
    }
  };

  const action = async (database: ManagedDatabaseDTO, nextAction: 'start' | 'stop' | 'restart') => {
    setWorkingId(database.id);
    setError(null);
    try {
      const response = await fetch(`/api/modules/databases/${database.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update database');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update database');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Database Deployments</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Docker-only database instances with host-owned data directories, masked connection
            details, and explicit public exposure controls.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          New Database
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: 'Instances', value: summary.total, icon: Database },
          { label: 'Running', value: summary.running, icon: CheckCircle2 },
          { label: 'Public routes', value: summary.publicCount, icon: Globe2 },
          { label: 'Failed', value: summary.failed, icon: XCircle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Loading databases
            </CardContent>
          </Card>
        ) : databases.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Database className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-base font-semibold">No databases yet</h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Create a Docker-backed MongoDB, PostgreSQL, or MySQL instance with persistent data
                on this machine.
              </p>
            </CardContent>
          </Card>
        ) : (
          databases.map((database) => (
            <Card key={database.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{database.name}</CardTitle>
                      {statusBadge(database.status)}
                      <Badge variant="outline">{database.image}</Badge>
                      <Badge variant={database.publicRoute ? 'warning' : 'secondary'}>
                        {database.publicRoute ? (
                          <Globe2 className="h-3 w-3" />
                        ) : (
                          <Lock className="h-3 w-3" />
                        )}
                        {database.publicRoute ? 'Public' : 'Local only'}
                      </Badge>
                    </div>
                    <CardDescription className="mt-2">
                      {database.bindAddress}:{database.port} to container {database.internalPort}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => deploy(database)}
                      loading={workingId === database.id}
                      aria-label={`Deploy ${database.name}`}
                    >
                      <Play className="h-4 w-4" />
                      Deploy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => action(database, 'restart')}
                      disabled={database.status === 'draft'}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Restart
                    </Button>
                    {database.status === 'running' ? (
                      <Button variant="outline" size="sm" onClick={() => action(database, 'stop')}>
                        <Square className="h-4 w-4" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => action(database, 'start')}
                        disabled={database.status === 'draft'}
                      >
                        <Power className="h-4 w-4" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/25 p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      Data path
                    </div>
                    <code className="break-all text-xs text-foreground">{database.dataPath}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(database.connection.maskedUri)}
                    className="w-full rounded-lg border border-border bg-muted/25 p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Copy className="h-3.5 w-3.5" />
                      Connection string
                    </div>
                    <code className="break-all text-xs text-foreground">
                      {database.connection.maskedUri}
                    </code>
                  </button>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Security notes
                  </div>
                  <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
                    {database.securityNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 rounded-lg border border-border bg-background p-3 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Logs className="h-3.5 w-3.5" />
                      Activity
                    </div>
                    {workingId === database.id && (
                      <Badge variant="warning">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        Deploying
                      </Badge>
                    )}
                  </div>
                  <div
                    aria-label={`${database.name} activity log`}
                    className="max-h-40 overflow-auto rounded-md bg-muted/25 p-3 font-mono text-[11px] leading-5 text-muted-foreground"
                  >
                    {[...(database.logs ?? []), ...(operationLogs[database.id] ?? [])].length >
                    0 ? (
                      [...(database.logs ?? []), ...(operationLogs[database.id] ?? [])]
                        .slice(-16)
                        .map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
                    ) : (
                      <div>No deployment activity yet.</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-database-title"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
              <div>
                <h2 id="new-database-title" className="text-lg font-semibold">
                  New Database
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a Docker deployment with data stored on this machine.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close new database dialog"
                onClick={() => setFormOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                <Field id="database-template" label="Template">
                  <select
                    id="database-template"
                    className={fieldClassName()}
                    value={form.templateId}
                    onChange={(event) => updateTemplate(event.target.value as DatabaseTemplateId)}
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm text-muted-foreground">
                  {templateMap[form.templateId].description}
                </div>
                <Field id="database-version" label="Major version">
                  <select
                    id="database-version"
                    className={fieldClassName()}
                    value={form.version}
                    onChange={(event) => updateForm('version', event.target.value)}
                  >
                    {templateMap[form.templateId].versions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="database-name" label="Database name">
                  <input
                    id="database-name"
                    className={fieldClassName()}
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Main Postgres"
                    required
                  />
                </Field>
                <Field id="database-port" label="Host port">
                  <input
                    id="database-port"
                    className={fieldClassName()}
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(event) => updateForm('port', event.target.value)}
                    required
                  />
                </Field>
              </div>

              <div className="space-y-4">
                <Field id="database-username" label="Username">
                  <input
                    id="database-username"
                    className={fieldClassName()}
                    value={form.username}
                    onChange={(event) => updateForm('username', event.target.value)}
                    required
                  />
                </Field>
                <Field id="database-password" label="Password">
                  <div className="flex gap-2">
                    <input
                      id="database-password"
                      className={fieldClassName()}
                      type={revealedPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(event) => updateForm('password', event.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={revealedPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setRevealedPassword((value) => !value)}
                    >
                      {revealedPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => updateForm('password', randomPassword())}
                    >
                      Generate
                    </Button>
                  </div>
                </Field>
                <Field id="database-initial-db" label="Initial database">
                  <input
                    id="database-initial-db"
                    className={fieldClassName()}
                    value={form.databaseName}
                    onChange={(event) => updateForm('databaseName', event.target.value)}
                    required
                  />
                </Field>
                <Field id="database-ssl-mode" label="SSL mode">
                  <select
                    id="database-ssl-mode"
                    className={fieldClassName()}
                    value={form.sslMode}
                    onChange={(event) =>
                      updateForm('sslMode', event.target.value as FormState['sslMode'])
                    }
                  >
                    <option value="disable">Disable</option>
                    <option value="prefer">Prefer</option>
                    <option value="require">Require</option>
                  </select>
                </Field>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4 lg:col-span-2">
                <div>
                  <h3 className="text-sm font-semibold">Exposure</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Public route binds the native database TCP port on all interfaces. Local only
                    binds it to 127.0.0.1. The data lives on this machine under the managed
                    databases directory.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="database-exposure"
                      checked={!form.publicRoute}
                      onChange={() => updateForm('publicRoute', false)}
                    />
                    Local only
                  </label>
                  <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="database-exposure"
                      checked={form.publicRoute}
                      onChange={() => updateForm('publicRoute', true)}
                    />
                    Public route
                  </label>
                </div>
                {form.publicRoute && (
                  <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <Field
                      id="database-public-host"
                      label="Public host"
                      hint="Optional. Leave blank to use SERVERMON_PUBLIC_HOST, SERVERMON_PUBLIC_IP, PUBLIC_IP, or a placeholder in connection details."
                    >
                      <input
                        id="database-public-host"
                        className={fieldClassName()}
                        value={form.publicHost}
                        onChange={(event) => updateForm('publicHost', event.target.value)}
                        placeholder="db.example.com"
                      />
                    </Field>
                    <p className="text-xs leading-5 text-warning">
                      If this machine is part of ServerMon Fleet with no public IP, do not use
                      public route here. Deploy the database first, then configure your public route
                      once the database is up with host 127.0.0.1 and port {form.port}.
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.confirmedPublicExposure}
                        onChange={(event) =>
                          updateForm('confirmedPublicExposure', event.target.checked)
                        }
                      />
                      I understand this exposes the database port
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Create Database
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
