'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldAlert,
  Terminal,
  Trash2,
} from 'lucide-react';
import ProShell from '@/components/layout/ProShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { EnvVarRecord, EnvVarsSnapshot } from '../types';

type ActiveView = 'persistent' | 'session' | 'system';
type ScopeChoice = 'user' | 'system';

const MASK = '••••••••';

function displayValue(record: EnvVarRecord, revealed: boolean): string {
  if (record.sensitive && !revealed) return MASK;
  return record.value || '(empty)';
}

function scopeText(scope: ScopeChoice) {
  if (scope === 'user') {
    return 'User scope is written to the OS user environment so a fresh terminal can see it with env.';
  }
  return 'System scope affects the whole machine and is shown as an admin command to run manually.';
}

export default function EnvVarsPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<EnvVarsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('persistent');
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<ScopeChoice>('user');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/env-vars', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load environment variables');
      setSnapshot(data);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load environment variables';
      toast({ title: 'EnvVars unavailable', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const persistentRows = useMemo(() => snapshot?.persistent ?? [], [snapshot]);
  const sessionRows = useMemo(() => snapshot?.session ?? [], [snapshot]);
  const secretCount = useMemo(
    () => persistentRows.filter((record) => record.sensitive).length,
    [persistentRows]
  );

  const toggleReveal = (recordKey: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(recordKey)) next.delete(recordKey);
      else next.add(recordKey);
      return next;
    });
  };

  const resetForm = () => {
    setKey('');
    setValue('');
    setScope('user');
    setShowAdd(false);
  };

  const saveVariable = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/modules/env-vars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, scope }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save variable');
      toast({
        title: data.applied ? 'Variable saved' : 'Admin command generated',
        description: data.message,
        variant: 'success',
      });
      resetForm();
      await load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save variable';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const deleteVariable = async (record: EnvVarRecord) => {
    if (!window.confirm(`Delete ${record.key}?`)) return;
    try {
      const response = await fetch('/api/modules/env-vars', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: record.key, scope: 'user' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete variable');
      toast({ title: 'Variable deleted', description: data.message, variant: 'success' });
      await load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete variable';
      toast({ title: 'Delete failed', description: message, variant: 'destructive' });
    }
  };

  const renderRows = (rows: EnvVarRecord[], canDelete: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-accent/10">
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Name
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Value
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Scope
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => {
            const isRevealed = revealed.has(record.key);
            return (
              <tr key={`${record.scope}-${record.key}`} className="border-b border-border/40">
                <td className="px-4 py-3 font-mono text-xs font-semibold">{record.key}</td>
                <td className="px-4 py-3 font-mono text-xs max-w-[280px] truncate">
                  {displayValue(record, isRevealed)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={record.scope === 'session' ? 'secondary' : 'default'}>
                    {record.scope}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={record.inCurrentSession ? 'success' : 'warning'}>
                    {record.inCurrentSession ? 'current' : 'new session'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {record.sensitive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`${isRevealed ? 'Hide' : 'Reveal'} ${record.key}`}
                        onClick={() => toggleReveal(record.key)}
                      >
                        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${record.key}`}
                        onClick={() => deleteVariable(record)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">No variables found.</div>
      )}
    </div>
  );

  return (
    <ProShell title="EnvVars" subtitle="Host Environment Variables">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{persistentRows.length}</p>
              <p className="text-xs text-muted-foreground">Persistent</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{sessionRows.length}</p>
              <p className="text-xs text-muted-foreground">Current Session</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{secretCount}</p>
              <p className="text-xs text-muted-foreground">Masked</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm font-mono truncate">
                {snapshot?.target.userFile ?? snapshot?.target.note ?? 'Detecting'}
              </p>
              <p className="text-xs text-muted-foreground">User Target</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Environment
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {(['persistent', 'session', 'system'] as const).map((view) => (
                  <Button
                    key={view}
                    type="button"
                    variant={activeView === view ? 'default' : 'outline'}
                    onClick={() => setActiveView(view)}
                    className="capitalize"
                  >
                    {view}
                  </Button>
                ))}
                <Button type="button" variant="outline" onClick={load} aria-label="Refresh">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={() => setShowAdd(true)} aria-label="Add variable">
                  <Plus className="h-4 w-4" />
                  Add variable
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && !snapshot ? (
              <div className="flex items-center justify-center py-20">
                <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {activeView === 'persistent' && (
                  <div className="space-y-5">
                    {renderRows(persistentRows, true)}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground">
                        Current Session Env
                      </h4>
                      {renderRows(sessionRows, false)}
                    </div>
                  </div>
                )}
                {activeView === 'session' && renderRows(sessionRows, false)}
                {activeView === 'system' && snapshot && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      snapshot.systemInstructions.addTemplate,
                      snapshot.systemInstructions.deleteTemplate,
                    ].map((instruction) => (
                      <div
                        key={instruction.title}
                        className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3"
                      >
                        <div className="flex items-center gap-2 font-semibold">
                          <ShieldAlert className="h-4 w-4 text-warning" />
                          {instruction.title}
                        </div>
                        <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs">
                          {instruction.command}
                        </pre>
                        <p className="text-xs text-muted-foreground">{instruction.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
            <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Add variable</h2>
                <p className="text-sm text-muted-foreground">{scopeText(scope)}</p>
              </div>
              <Input
                id="env-var-name"
                label="Name"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
              <Input
                id="env-var-value"
                label="Value"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                {(['user', 'system'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setScope(choice)}
                    className={cn(
                      'min-h-[44px] rounded-lg border px-3 text-sm font-semibold capitalize',
                      scope === choice
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border'
                    )}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveVariable} loading={saving}>
                  <Terminal className="h-4 w-4" />
                  Save variable
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProShell>
  );
}
