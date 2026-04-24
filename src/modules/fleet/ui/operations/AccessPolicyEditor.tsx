'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ACCESS_MODES } from '@/lib/fleet/enums';

interface AccessPolicy {
  _id: string;
  name: string;
  mode: string;
  ipAllowlist: string[];
  allowedUserRoles: string[];
  description?: string;
  temporaryShare?: { enabled: boolean };
}

interface FormState {
  id?: string;
  name: string;
  mode: (typeof ACCESS_MODES)[number];
  ipAllowlist: string;
  allowedUserRoles: string;
  description: string;
  temporaryShareEnabled: boolean;
}

const INITIAL_FORM: FormState = {
  name: '',
  mode: 'servermon_auth',
  ipAllowlist: '',
  allowedUserRoles: '',
  description: '',
  temporaryShareEnabled: false,
};

function parseList(input: string): string[] {
  return input
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function AccessPolicyEditor() {
  const [policies, setPolicies] = useState<AccessPolicy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/access-policies');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPolicies(data.policies ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        mode: form.mode,
        ipAllowlist: parseList(form.ipAllowlist),
        allowedUserRoles: parseList(form.allowedUserRoles),
        description: form.description || undefined,
        temporaryShare: { enabled: form.temporaryShareEnabled },
      };
      const url = form.id ? `/api/fleet/access-policies/${form.id}` : '/api/fleet/access-policies';
      const method = form.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        throw new Error(respBody.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm(INITIAL_FORM);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (p: AccessPolicy) => {
    setForm({
      id: p._id,
      name: p.name,
      mode: p.mode as FormState['mode'],
      ipAllowlist: (p.ipAllowlist ?? []).join(', '),
      allowedUserRoles: (p.allowedUserRoles ?? []).join(', '),
      description: p.description ?? '',
      temporaryShareEnabled: p.temporaryShare?.enabled === true,
    });
    setShowForm(true);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/access-policies/${id}`, {
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Access policies</CardTitle>
        <Button
          onClick={() => {
            setForm(INITIAL_FORM);
            setShowForm((v) => !v);
          }}
        >
          {showForm ? 'Close' : 'New policy'}
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
        {showForm && (
          <div className="space-y-3 rounded border border-border p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="space-y-1.5">
                <label htmlFor="acp-mode" className="block text-sm font-medium text-foreground">
                  Mode
                </label>
                <select
                  id="acp-mode"
                  value={form.mode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      mode: e.target.value as FormState['mode'],
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
              <Input
                label="IP allowlist (comma-separated)"
                value={form.ipAllowlist}
                onChange={(e) => setForm({ ...form, ipAllowlist: e.target.value })}
                placeholder="10.0.0.0/8, 192.168.1.1"
              />
              <Input
                label="Allowed user roles (comma-separated)"
                value={form.allowedUserRoles}
                onChange={(e) => setForm({ ...form, allowedUserRoles: e.target.value })}
                placeholder="admin, operator"
              />
              <Input
                label="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm pt-5">
                <input
                  type="checkbox"
                  checked={form.temporaryShareEnabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      temporaryShareEnabled: e.target.checked,
                    })
                  }
                />
                Temporary share enabled
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Basic auth credential management arrives in Phase 2.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} type="button">
                Cancel
              </Button>
              <Button onClick={save} disabled={busy || !form.name} loading={busy} type="button">
                {form.id ? 'Save changes' : 'Create policy'}
              </Button>
            </div>
          </div>
        )}
        {!policies && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {policies && policies.length === 0 && (
          <p className="text-sm text-muted-foreground">No access policies yet.</p>
        )}
        {policies && policies.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Name</th>
                  <th className="py-2 pr-2 font-medium">Mode</th>
                  <th className="py-2 pr-2 font-medium">IPs</th>
                  <th className="py-2 pr-2 font-medium">Roles</th>
                  <th className="py-2 pr-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p._id} className="border-b border-border/50 last:border-none">
                    <td className="py-2 pr-2">{p.name}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="outline">{p.mode}</Badge>
                    </td>
                    <td className="py-2 pr-2 text-xs">{(p.ipAllowlist ?? []).length}</td>
                    <td className="py-2 pr-2 text-xs">{(p.allowedUserRoles ?? []).length}</td>
                    <td className="py-2 pr-2 text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => edit(p)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(p._id)}
                        aria-label={`Delete policy ${p.name}`}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
