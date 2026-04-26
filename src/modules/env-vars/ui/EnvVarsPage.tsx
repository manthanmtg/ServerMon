'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, LoaderCircle, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import ProShell from '@/components/layout/ProShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import type { EnvVarRecord, EnvVarsSnapshot } from '../types';
import { EnvVarsAddModal, type ScopeChoice } from './EnvVarsAddModal';
import { EnvVarsTable } from './EnvVarsTable';

type ActiveView = 'persistent' | 'session' | 'system';

const VIEW_LABELS: Record<ActiveView, string> = {
  session: 'Env command',
  persistent: 'Saved',
  system: 'System',
};

export default function EnvVarsPage() {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState<EnvVarsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('session');
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

  return (
    <ProShell title="EnvVars" subtitle="Host Environment Variables">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{sessionRows.length}</p>
              <p className="text-xs text-muted-foreground">Env command</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <p className="text-2xl font-bold">{persistentRows.length}</p>
              <p className="text-xs text-muted-foreground">Saved</p>
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
                {(['session', 'persistent', 'system'] as const).map((view) => (
                  <Button
                    key={view}
                    type="button"
                    variant={activeView === view ? 'default' : 'outline'}
                    onClick={() => setActiveView(view)}
                  >
                    {VIEW_LABELS[view]}
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
                  <EnvVarsTable
                    rows={persistentRows}
                    canDelete={true}
                    revealed={revealed}
                    onToggleReveal={toggleReveal}
                    onDelete={deleteVariable}
                  />
                )}
                {activeView === 'session' && (
                  <EnvVarsTable
                    rows={sessionRows}
                    canDelete={false}
                    revealed={revealed}
                    onToggleReveal={toggleReveal}
                  />
                )}
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
          <EnvVarsAddModal
            keyName={key}
            onKeyNameChange={setKey}
            value={value}
            onValueChange={setValue}
            scope={scope}
            onScopeChange={setScope}
            saving={saving}
            onSave={saveVariable}
            onCancel={resetForm}
          />
        )}
      </div>
    </ProShell>
  );
}
