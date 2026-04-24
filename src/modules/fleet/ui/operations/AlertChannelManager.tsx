'use client';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type ChannelKind = 'webhook' | 'slack' | 'email';
type Severity = 'info' | 'warn' | 'error';

interface AlertChannel {
  _id: string;
  name: string;
  slug: string;
  kind: ChannelKind;
  config: Record<string, unknown>;
  enabled: boolean;
  minSeverity: Severity;
  description?: string;
  lastTriggeredAt?: string;
  lastSuccess?: boolean;
  lastError?: string;
}

interface AlertSubscription {
  _id: string;
  name: string;
  channelId: string;
  eventKinds: string[];
  minSeverity: Severity;
  enabled: boolean;
}

interface FormState {
  id?: string;
  name: string;
  slug: string;
  kind: ChannelKind;
  enabled: boolean;
  minSeverity: Severity;
  description: string;
  webhookUrl: string;
  webhookMethod: 'POST' | 'PUT';
  slackWebhookUrl: string;
  slackChannel: string;
  emailTo: string;
  emailSubject: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  slug: '',
  kind: 'webhook',
  enabled: true,
  minSeverity: 'warn',
  description: '',
  webhookUrl: '',
  webhookMethod: 'POST',
  slackWebhookUrl: '',
  slackChannel: '',
  emailTo: '',
  emailSubject: '',
};

type Tab = 'channels' | 'subscriptions';

function buildConfig(form: FormState): Record<string, unknown> {
  if (form.kind === 'webhook') {
    return { url: form.webhookUrl, method: form.webhookMethod };
  }
  if (form.kind === 'slack') {
    return {
      webhookUrl: form.slackWebhookUrl,
      ...(form.slackChannel ? { channel: form.slackChannel } : {}),
    };
  }
  // email
  const to = form.emailTo
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    to,
    ...(form.emailSubject ? { subject: form.emailSubject } : {}),
  };
}

function seedFormFromChannel(c: AlertChannel): FormState {
  const form: FormState = {
    ...INITIAL_FORM,
    id: c._id,
    name: c.name,
    slug: c.slug,
    kind: c.kind,
    enabled: c.enabled,
    minSeverity: c.minSeverity,
    description: c.description ?? '',
  };
  const cfg = c.config ?? {};
  if (c.kind === 'webhook') {
    form.webhookUrl = typeof cfg.url === 'string' ? cfg.url : '';
    form.webhookMethod = cfg.method === 'PUT' ? 'PUT' : 'POST';
  } else if (c.kind === 'slack') {
    form.slackWebhookUrl = typeof cfg.webhookUrl === 'string' ? cfg.webhookUrl : '';
    form.slackChannel = typeof cfg.channel === 'string' ? cfg.channel : '';
  } else if (c.kind === 'email') {
    form.emailTo = Array.isArray(cfg.to) ? (cfg.to as string[]).join(', ') : '';
    form.emailSubject = typeof cfg.subject === 'string' ? cfg.subject : '';
  }
  return form;
}

export function AlertChannelManager() {
  const [tab, setTab] = useState<Tab>('channels');
  const [channels, setChannels] = useState<AlertChannel[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<AlertSubscription[] | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/alerts/channels');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChannels(data.channels ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/alerts/subscriptions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSubscriptions(data.subscriptions ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadChannels();
    loadSubscriptions();
  }, [loadChannels, loadSubscriptions]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const body = {
        name: form.name,
        slug: form.slug,
        kind: form.kind,
        enabled: form.enabled,
        minSeverity: form.minSeverity,
        description: form.description || undefined,
        config: buildConfig(form),
      };
      const url = form.id ? `/api/fleet/alerts/channels/${form.id}` : '/api/fleet/alerts/channels';
      const method = form.id ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resp = await res.json().catch(() => ({}));
        throw new Error(resp.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm(INITIAL_FORM);
      await loadChannels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (c: AlertChannel) => {
    setForm(seedFormFromChannel(c));
    setShowForm(true);
    setInfo(null);
    setError(null);
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/fleet/alerts/channels/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await loadChannels();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sendTest = async (id: string) => {
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/fleet/alerts/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? body.failures?.[0]?.error ?? `HTTP ${res.status}`);
      }
      setInfo(`Test alert dispatched to ${body.dispatched} target(s).`);
      await loadChannels();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'channels', label: 'Channels' },
    { id: 'subscriptions', label: 'Subscriptions' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'channels' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Alert channels</CardTitle>
            <Button
              onClick={() => {
                setForm(INITIAL_FORM);
                setShowForm((v) => !v);
              }}
            >
              {showForm ? 'Close' : 'New channel'}
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
            {info && (
              <div
                role="status"
                className="rounded border border-success/30 bg-success/5 p-2 text-sm text-success"
              >
                {info}
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
                  <Input
                    label="Slug"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="ops-webhook"
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="ac-kind" className="block text-sm font-medium text-foreground">
                      Kind
                    </label>
                    <select
                      id="ac-kind"
                      value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as ChannelKind })}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="webhook">webhook</option>
                      <option value="slack">slack</option>
                      <option value="email">email</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ac-severity"
                      className="block text-sm font-medium text-foreground"
                    >
                      Min severity
                    </label>
                    <select
                      id="ac-severity"
                      value={form.minSeverity}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          minSeverity: e.target.value as Severity,
                        })
                      }
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="info">info</option>
                      <option value="warn">warn</option>
                      <option value="error">error</option>
                    </select>
                  </div>
                  <Input
                    label="Description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm pt-5">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>

                {form.kind === 'webhook' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Input
                        label="Webhook URL"
                        value={form.webhookUrl}
                        onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                        placeholder="https://example.com/hook"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="ac-method"
                        className="block text-sm font-medium text-foreground"
                      >
                        Method
                      </label>
                      <select
                        id="ac-method"
                        value={form.webhookMethod}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            webhookMethod: e.target.value as 'POST' | 'PUT',
                          })
                        }
                        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.kind === 'slack' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="Slack webhook URL"
                      value={form.slackWebhookUrl}
                      onChange={(e) => setForm({ ...form, slackWebhookUrl: e.target.value })}
                      placeholder="https://hooks.slack.com/..."
                    />
                    <Input
                      label="Channel override (optional)"
                      value={form.slackChannel}
                      onChange={(e) => setForm({ ...form, slackChannel: e.target.value })}
                      placeholder="#ops"
                    />
                  </div>
                )}

                {form.kind === 'email' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="To (comma-separated)"
                      value={form.emailTo}
                      onChange={(e) => setForm({ ...form, emailTo: e.target.value })}
                      placeholder="ops@example.com, alerts@example.com"
                    />
                    <Input
                      label="Subject (optional)"
                      value={form.emailSubject}
                      onChange={(e) => setForm({ ...form, emailSubject: e.target.value })}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={save}
                    disabled={busy || !form.name || !form.slug}
                    loading={busy}
                    type="button"
                  >
                    {form.id ? 'Save changes' : 'Create channel'}
                  </Button>
                </div>
              </div>
            )}

            {!channels && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {channels && channels.length === 0 && (
              <p className="text-sm text-muted-foreground">No alert channels yet.</p>
            )}
            {channels && channels.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Name</th>
                      <th className="py-2 pr-2 font-medium">Slug</th>
                      <th className="py-2 pr-2 font-medium">Kind</th>
                      <th className="py-2 pr-2 font-medium">Enabled</th>
                      <th className="py-2 pr-2 font-medium">Min severity</th>
                      <th className="py-2 pr-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((c) => (
                      <tr key={c._id} className="border-b border-border/50 last:border-none">
                        <td className="py-2 pr-2">{c.name}</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{c.slug}</td>
                        <td className="py-2 pr-2">
                          <Badge variant="outline">{c.kind}</Badge>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge variant={c.enabled ? 'success' : 'secondary'}>
                            {c.enabled ? 'on' : 'off'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs">{c.minSeverity}</td>
                        <td className="py-2 pr-2 text-right space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendTest(c._id)}
                            aria-label={`Send test to ${c.name}`}
                          >
                            Send test
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => edit(c)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(c._id)}
                            aria-label={`Delete channel ${c.name}`}
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
      )}

      {tab === 'subscriptions' && (
        <Card>
          <CardHeader>
            <CardTitle>Alert subscriptions</CardTitle>
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
            {!subscriptions && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
            {subscriptions && subscriptions.length === 0 && (
              <p className="text-sm text-muted-foreground">No alert subscriptions configured.</p>
            )}
            {subscriptions && subscriptions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Name</th>
                      <th className="py-2 pr-2 font-medium">Channel</th>
                      <th className="py-2 pr-2 font-medium">Event kinds</th>
                      <th className="py-2 pr-2 font-medium">Min severity</th>
                      <th className="py-2 pr-2 font-medium">Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => (
                      <tr key={s._id} className="border-b border-border/50 last:border-none">
                        <td className="py-2 pr-2">{s.name}</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{s.channelId}</td>
                        <td className="py-2 pr-2 text-xs">{s.eventKinds.join(', ')}</td>
                        <td className="py-2 pr-2 text-xs">{s.minSeverity}</td>
                        <td className="py-2 pr-2">
                          <Badge variant={s.enabled ? 'success' : 'secondary'}>
                            {s.enabled ? 'on' : 'off'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Subscriptions are managed via the API. Full subscription editor arrives in a later
              wave.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
