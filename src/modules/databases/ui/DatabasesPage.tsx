'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Database, LoaderCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resilientFetch } from '@/lib/fetch-utils';
import { DatabaseDeploymentCard, type DatabaseAction } from './DatabaseDeploymentCard';
import { DatabaseSummaryCards, deriveDatabaseSummary } from './DatabaseSummaryCards';
import {
  databaseFormToPayload,
  databaseTemplateMap,
  initialDatabaseForm,
  NewDatabaseFormModal,
  type DatabaseFormState,
} from './NewDatabaseFormModal';
import type { DatabaseTemplateId, ManagedDatabaseDTO } from '../types';

const DEPLOY_PROGRESS_MESSAGES = [
  'Deploy request sent to ServerMon.',
  'Preparing host data directory.',
  'Removing any existing container with the same managed name.',
  'Pulling the Docker image. First pulls can take a few minutes.',
  'Starting the database container and waiting for Docker to return.',
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<ManagedDatabaseDTO[]>([]);
  const [form, setForm] = useState<DatabaseFormState>(initialDatabaseForm);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [operationLogs, setOperationLogs] = useState<Record<string, string[]>>({});
  const [expandedDatabaseIds, setExpandedDatabaseIds] = useState<Set<string>>(() => new Set());
  const [copiedConnectionId, setCopiedConnectionId] = useState<string | null>(null);
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

  const summary = useMemo(() => deriveDatabaseSummary(databases), [databases]);

  const updateForm = <K extends keyof DatabaseFormState>(key: K, value: DatabaseFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTemplate = (templateId: DatabaseTemplateId) => {
    const template = databaseTemplateMap[templateId];
    setForm((current) => ({
      ...current,
      templateId,
      version: template.defaultVersion,
      port: template.defaultPort,
      username: template.defaultUsername,
      databaseName: template.defaultDatabaseName,
    }));
  };

  const copyText = async (value: string, databaseId?: string) => {
    await navigator.clipboard?.writeText(value);
    if (databaseId) {
      setCopiedConnectionId(databaseId);
      window.setTimeout(() => {
        setCopiedConnectionId((current) => (current === databaseId ? null : current));
      }, 2000);
    }
  };

  const appendOperationLog = (databaseId: string, message: string) => {
    setOperationLogs((current) => ({
      ...current,
      [databaseId]: [...(current[databaseId] ?? []), `[UI] ${message}`].slice(-12),
    }));
  };

  const toggleDatabaseExpanded = (databaseId: string) => {
    setExpandedDatabaseIds((current) => {
      const next = new Set(current);
      if (next.has(databaseId)) {
        next.delete(databaseId);
      } else {
        next.add(databaseId);
      }
      return next;
    });
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
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
        body: JSON.stringify(databaseFormToPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create database');
      setForm(initialDatabaseForm);
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
    setExpandedDatabaseIds((current) => new Set(current).add(database.id));
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

  const action = async (database: ManagedDatabaseDTO, nextAction: DatabaseAction) => {
    setWorkingId(database.id);
    setError(null);
    try {
      const response = await resilientFetch(`/api/modules/databases/${database.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
        timeout: 15_000,
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

      <DatabaseSummaryCards summary={summary} />

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
            <DatabaseDeploymentCard
              key={database.id}
              database={database}
              isWorking={workingId === database.id}
              isExpanded={expandedDatabaseIds.has(database.id)}
              copiedConnectionId={copiedConnectionId}
              operationLogs={operationLogs[database.id] ?? []}
              onDeploy={deploy}
              onAction={action}
              onCopyConnection={copyText}
              onToggleExpanded={toggleDatabaseExpanded}
            />
          ))
        )}
      </div>

      {formOpen && (
        <NewDatabaseFormModal
          form={form}
          submitting={submitting}
          revealedPassword={revealedPassword}
          onClose={() => setFormOpen(false)}
          onSubmit={submit}
          onUpdateForm={updateForm}
          onUpdateTemplate={updateTemplate}
          onTogglePassword={() => setRevealedPassword((value) => !value)}
        />
      )}
    </div>
  );
}
