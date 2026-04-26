'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Check, ChevronRight, ChevronLeft, ExternalLink, Settings } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

type TlsProvider = 'letsencrypt' | 'manual' | 'reverse_proxy';

interface IngressForm {
  hubPublicUrl: string;
  subdomainHost: string;
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort: number;
  managedDir: string;
  binaryPath: string;
  provider: TlsProvider;
  acmeEmail: string;
}

interface PreflightResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'skip' | 'unknown';
  detail?: string;
  fix?: string;
}

interface FrpServerState {
  enabled?: boolean;
  runtimeState?: string;
  bindPort?: number;
  vhostHttpPort?: number;
  vhostHttpsPort?: number;
  subdomainHost?: string;
  configVersion?: number;
  generatedConfigHash?: string;
  lastRestartAt?: string;
  activeConnections?: number;
  connectedNodeIds?: string[];
}

interface NginxState {
  managed?: boolean;
  managedDir?: string;
  binaryPath?: string;
  runtimeState?: string;
  lastReloadAt?: string;
  lastReloadSuccess?: boolean;
  lastTestAt?: string;
  lastTestSuccess?: boolean;
  managedServerNames?: string[];
  detectedConflicts?: Array<{
    serverName: string;
    filePath: string;
    reason: string;
  }>;
}

const INITIAL: IngressForm = {
  hubPublicUrl: '',
  subdomainHost: '',
  bindPort: 7000,
  vhostHttpPort: 8080,
  vhostHttpsPort: 8443,
  managedDir: '/etc/nginx/servermon',
  binaryPath: 'nginx',
  provider: 'letsencrypt',
  acmeEmail: '',
};

function statusVariant(s: string): BadgeVariant {
  switch (s) {
    case 'pass':
      return 'success';
    case 'fail':
      return 'destructive';
    case 'warn':
      return 'warning';
    case 'skip':
      return 'outline';
    default:
      return 'secondary';
  }
}

export function IngressSetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<IngressForm>(INITIAL);
  const [frpResults, setFrpResults] = useState<PreflightResult[] | null>(null);
  const [nginxResults, setNginxResults] = useState<PreflightResult[] | null>(null);
  const [dnsResults, setDnsResults] = useState<PreflightResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [serverState, setServerState] = useState<FrpServerState | null>(null);
  const [nginxState, setNginxState] = useState<NginxState | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Load current state and env defaults on mount
  useEffect(() => {
    async function load() {
      try {
        const [serverRes, nginxRes] = await Promise.all([
          fetch('/api/fleet/server'),
          fetch('/api/fleet/nginx').catch(() => null),
        ]);
        if (!serverRes.ok) return;
        const data = await serverRes.json();
        const nextServerState = data.state ?? null;
        setServerState(nextServerState);

        if (nginxRes?.ok) {
          const nginxData = await nginxRes.json();
          setNginxState(nginxData.state ?? null);
        }

        setForm((prev) => ({
          ...prev,
          hubPublicUrl: data.envDefaults?.hubPublicUrl || prev.hubPublicUrl,
          acmeEmail: data.envDefaults?.acmeEmail || prev.acmeEmail,
          managedDir: data.envDefaults?.managedDir || prev.managedDir,
          binaryPath: data.envDefaults?.binaryPath || prev.binaryPath,
          subdomainHost:
            data.state?.subdomainHost || data.envDefaults?.subdomainHost || prev.subdomainHost,
          bindPort: data.state?.bindPort || prev.bindPort,
          vhostHttpPort: data.state?.vhostHttpPort || prev.vhostHttpPort,
          vhostHttpsPort: data.state?.vhostHttpsPort || prev.vhostHttpsPort,
        }));
      } catch (err) {
        console.error('Failed to load initial setup state', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[300px]">
          <Spinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading existing configuration...</p>
        </CardContent>
      </Card>
    );
  }

  const defaultHubUrl =
    form.hubPublicUrl || (form.subdomainHost ? `https://hub.${form.subdomainHost}` : '');
  const isConfigured = serverState && serverState.enabled && serverState.subdomainHost;

  const updateForm = <K extends keyof IngressForm>(key: K, value: IngressForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const runPreflight = async (filterPrefix: string, setter: (r: PreflightResult[]) => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/fleet/server/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bindPort: form.bindPort,
          vhostHttpPort: form.vhostHttpPort,
          vhostHttpsPort: form.vhostHttpsPort,
          subdomainHost: form.subdomainHost,
          managedDir: form.managedDir,
          binaryPath: form.binaryPath,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const all: PreflightResult[] = data.results ?? [];
      setter(all.filter((r) => r.id.startsWith(filterPrefix)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const completeSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const serverRes = await fetch('/api/fleet/server', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bindPort: form.bindPort,
          vhostHttpPort: form.vhostHttpPort,
          vhostHttpsPort: form.vhostHttpsPort,
          subdomainHost: form.subdomainHost,
        }),
      });
      if (!serverRes.ok) {
        const body = await serverRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${serverRes.status}`);
      }
      const serverBody = await serverRes.json().catch(() => ({}));
      setServerState(serverBody.state ?? null);

      const nginxRes = await fetch('/api/fleet/nginx', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          managed: true,
          managedDir: form.managedDir,
          binaryPath: form.binaryPath,
        }),
      });
      if (!nginxRes.ok) {
        const body = await nginxRes.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${nginxRes.status}`);
      }
      const nginxBody = await nginxRes.json().catch(() => ({}));
      setNginxState(nginxBody.state ?? null);

      setCompleted(true);
      router.push('/fleet');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const next = () => setStep((s) => Math.min(4, s + 1) as Step);
  const back = () => setStep((s) => Math.max(1, s - 1) as Step);

  if (serverState && isConfigured && !showWizard) {
    return (
      <ConfiguredHubPanel
        form={form}
        serverState={serverState}
        nginxState={nginxState}
        onOpenFleet={() => router.push('/fleet')}
        onReconfigure={() => setShowWizard(true)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud ingress setup</CardTitle>
        <StepIndicator step={step} />
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <StepHubUrl
            form={form}
            updateForm={updateForm}
            defaultHubUrl={defaultHubUrl}
            results={frpResults}
            busy={busy}
            onVerify={() => runPreflight('frp.', setFrpResults)}
          />
        )}
        {step === 2 && (
          <StepManagedDir
            form={form}
            updateForm={updateForm}
            results={nginxResults}
            busy={busy}
            onTest={() => runPreflight('nginx.', setNginxResults)}
          />
        )}
        {step === 3 && <StepTlsProvider form={form} updateForm={updateForm} />}
        {step === 4 && (
          <StepDns
            form={form}
            results={dnsResults}
            busy={busy}
            onCheck={() => runPreflight('dns.', setDnsResults)}
            onComplete={completeSetup}
            completed={completed}
          />
        )}

        <div className="flex justify-between pt-2">
          <Button onClick={back} variant="outline" disabled={step === 1 || busy}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 4 && (
            <Button onClick={next} disabled={busy}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ['Hub URL', 'Nginx', 'TLS', 'DNS'];
  return (
    <div className="flex flex-wrap gap-2 mt-2" aria-label="wizard steps">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-1 text-xs">
          <span
            className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
              i + 1 <= step
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {i + 1 < step ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={i + 1 === step ? 'text-foreground' : 'text-muted-foreground'}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function ConfiguredHubPanel({
  form,
  serverState,
  nginxState,
  onOpenFleet,
  onReconfigure,
}: {
  form: IngressForm;
  serverState: FrpServerState;
  nginxState: NginxState | null;
  onOpenFleet: () => void;
  onReconfigure: () => void;
}) {
  const publicUrl =
    form.hubPublicUrl ||
    (serverState.subdomainHost ? `https://${serverState.subdomainHost}` : 'Not configured');
  const connectedNodeCount = serverState.connectedNodeIds?.length ?? 0;
  const conflicts = nginxState?.detectedConflicts ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Hub ingress is configured</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              This hub is already accepting fleet traffic. Use this page to review the live ingress
              details or reopen setup when you need to change ports, DNS, or managed nginx settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={serverState.enabled ? 'success' : 'outline'}>
              {serverState.enabled ? 'FRP enabled' : 'FRP disabled'}
            </Badge>
            <Badge variant="outline">{serverState.runtimeState ?? 'unknown'}</Badge>
            <Badge variant={nginxState?.managed ? 'success' : 'outline'}>
              {nginxState?.managed ? 'nginx managed' : 'nginx unmanaged'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Public URL" value={publicUrl} />
            <Metric label="Subdomain host" value={serverState.subdomainHost ?? '—'} />
            <Metric label="Connected nodes" value={String(connectedNodeCount)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-medium">FRP server</h3>
              <div className="mt-3 space-y-2 text-sm">
                <DetailRow label="Bind port">{serverState.bindPort ?? form.bindPort}</DetailRow>
                <DetailRow label="vhost HTTP port">
                  {serverState.vhostHttpPort ?? form.vhostHttpPort}
                </DetailRow>
                <DetailRow label="vhost HTTPS port">
                  {serverState.vhostHttpsPort ?? form.vhostHttpsPort}
                </DetailRow>
                <DetailRow label="Active connections">
                  {serverState.activeConnections ?? 0}
                </DetailRow>
                <DetailRow label="Config version">{serverState.configVersion ?? '—'}</DetailRow>
                <DetailRow label="Last restart">{formatDate(serverState.lastRestartAt)}</DetailRow>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-medium">Nginx ingress</h3>
              <div className="mt-3 space-y-2 text-sm">
                <DetailRow label="Managed directory">
                  {nginxState?.managedDir ?? form.managedDir}
                </DetailRow>
                <DetailRow label="Binary path">
                  {nginxState?.binaryPath ?? form.binaryPath}
                </DetailRow>
                <DetailRow label="Runtime">{nginxState?.runtimeState ?? 'unknown'}</DetailRow>
                <DetailRow label="Last test">{formatDate(nginxState?.lastTestAt)}</DetailRow>
                <DetailRow label="Last reload">{formatDate(nginxState?.lastReloadAt)}</DetailRow>
                <DetailRow label="Managed server names">
                  {nginxState?.managedServerNames?.length ?? 0}
                </DetailRow>
              </div>
            </div>
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">Nginx conflicts</h3>
                <Badge variant="warning">{conflicts.length}</Badge>
              </div>
              <ul className="mt-3 space-y-2 text-xs">
                {conflicts.map((conflict, index) => (
                  <li
                    key={`${conflict.serverName}-${index}`}
                    className="rounded border border-warning/20 bg-background/60 p-2"
                  >
                    <div className="font-mono">{conflict.serverName}</div>
                    <div className="text-muted-foreground">{conflict.filePath}</div>
                    <div>{conflict.reason}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenFleet}>
              Open Fleet <ExternalLink className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={onReconfigure}>
              <Settings className="h-4 w-4" /> Reconfigure ingress
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function ResultsTable({
  results,
  busy,
  emptyLabel,
}: {
  results: PreflightResult[] | null;
  busy: boolean;
  emptyLabel: string;
}) {
  if (busy && !results) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (!results) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  if (results.length === 0) {
    return <p className="text-xs text-muted-foreground">No matching checks.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Check</th>
            <th className="py-2 pr-2 font-medium">Status</th>
            <th className="py-2 pr-2 font-medium">Detail</th>
            <th className="py-2 pr-2 font-medium">Fix</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-b border-border/50 last:border-none align-top">
              <td className="py-2 pr-2">
                <div className="text-sm">{r.label}</div>
                <div className="text-xs font-mono text-muted-foreground">{r.id}</div>
              </td>
              <td className="py-2 pr-2">
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
              </td>
              <td className="py-2 pr-2 text-xs max-w-[30ch] break-words">{r.detail ?? '—'}</td>
              <td className="py-2 pr-2 text-xs max-w-[30ch] break-words">{r.fix ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepHubUrl({
  form,
  updateForm,
  defaultHubUrl,
  results,
  busy,
  onVerify,
}: {
  form: IngressForm;
  updateForm: <K extends keyof IngressForm>(key: K, value: IngressForm[K]) => void;
  defaultHubUrl: string;
  results: PreflightResult[] | null;
  busy: boolean;
  onVerify: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Set the public URL of the hub and its ingress ports. Reachability checks are non-blocking.
      </p>
      <label className="block">
        <span className="text-sm text-muted-foreground">Hub public URL</span>
        <Input
          value={form.hubPublicUrl}
          onChange={(e) => updateForm('hubPublicUrl', e.target.value)}
          placeholder={defaultHubUrl || 'https://hub.example.com'}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Subdomain host</span>
        <Input
          value={form.subdomainHost}
          onChange={(e) => updateForm('subdomainHost', e.target.value)}
          placeholder="example.com"
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block">
          <span className="text-sm text-muted-foreground">Bind port</span>
          <Input
            type="number"
            value={form.bindPort}
            onChange={(e) => updateForm('bindPort', Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted-foreground">vhost HTTP port</span>
          <Input
            type="number"
            value={form.vhostHttpPort}
            onChange={(e) => updateForm('vhostHttpPort', Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted-foreground">vhost HTTPS port</span>
          <Input
            type="number"
            value={form.vhostHttpsPort}
            onChange={(e) => updateForm('vhostHttpsPort', Number(e.target.value))}
          />
        </label>
      </div>
      <div>
        <Button type="button" variant="outline" onClick={onVerify} disabled={busy} loading={busy}>
          Verify reachability
        </Button>
      </div>
      <ResultsTable
        results={results}
        busy={busy}
        emptyLabel='Click "Verify reachability" to run frp.* checks.'
      />
    </div>
  );
}

function StepManagedDir({
  form,
  updateForm,
  results,
  busy,
  onTest,
}: {
  form: IngressForm;
  updateForm: <K extends keyof IngressForm>(key: K, value: IngressForm[K]) => void;
  results: PreflightResult[] | null;
  busy: boolean;
  onTest: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ServerMon writes managed nginx configs to this directory. The binary is used for reload and
        test commands.
      </p>
      <label className="block">
        <span className="text-sm text-muted-foreground">Managed directory</span>
        <Input
          value={form.managedDir}
          onChange={(e) => updateForm('managedDir', e.target.value)}
          placeholder="/etc/nginx/servermon"
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">nginx binary path</span>
        <Input
          value={form.binaryPath}
          onChange={(e) => updateForm('binaryPath', e.target.value)}
          placeholder="nginx"
        />
      </label>
      <div>
        <Button type="button" variant="outline" onClick={onTest} disabled={busy} loading={busy}>
          Test permissions
        </Button>
      </div>
      <ResultsTable
        results={results}
        busy={busy}
        emptyLabel='Click "Test permissions" to run nginx.* checks.'
      />
    </div>
  );
}

function StepTlsProvider({
  form,
  updateForm,
}: {
  form: IngressForm;
  updateForm: <K extends keyof IngressForm>(key: K, value: IngressForm[K]) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-muted-foreground">TLS provider</span>
        <select
          value={form.provider}
          onChange={(e) => updateForm('provider', e.target.value as TlsProvider)}
          aria-label="TLS provider"
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          <option value="letsencrypt">Let&apos;s Encrypt (ACME)</option>
          <option value="manual">Manual certificates</option>
          <option value="reverse_proxy">Upstream reverse proxy</option>
        </select>
      </label>

      {form.provider === 'letsencrypt' && (
        <label className="block">
          <span className="text-sm text-muted-foreground">ACME email</span>
          <Input
            type="email"
            value={form.acmeEmail}
            onChange={(e) => updateForm('acmeEmail', e.target.value)}
            placeholder="admin@example.com"
          />
        </label>
      )}

      {form.provider === 'manual' && (
        <div
          role="note"
          className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          Certificates expected under <code>/etc/letsencrypt/live/&lt;domain&gt;/</code> or
          configured in step 2.
        </div>
      )}

      {form.provider === 'reverse_proxy' && (
        <div
          role="note"
          className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          Upstream reverse proxy handles TLS.
        </div>
      )}
    </div>
  );
}

function StepDns({
  form,
  results,
  busy,
  onCheck,
  onComplete,
  completed,
}: {
  form: IngressForm;
  results: PreflightResult[] | null;
  busy: boolean;
  onCheck: () => void;
  onComplete: () => void;
  completed: boolean;
}) {
  const host = form.subdomainHost || 'example.com';
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add a wildcard A record so exposed services resolve to the hub.
      </p>
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div className="text-xs text-muted-foreground mb-1">Expected record</div>
        <code className="font-mono text-xs">{`*.${host}  A  <hub-ip>`}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onCheck} disabled={busy} loading={busy}>
          Check DNS
        </Button>
        <Button type="button" onClick={onComplete} disabled={busy || completed} loading={busy}>
          Complete setup
        </Button>
      </div>
      <ResultsTable
        results={results}
        busy={busy}
        emptyLabel='Click "Check DNS" to run dns.* checks.'
      />
    </div>
  );
}
