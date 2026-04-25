'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { InstallerSnippet } from './InstallerSnippet';
import { OnboardingFormSchema, type OnboardingForm } from './schema';
import { FrpcConfigForm } from './FrpcConfigForm';
import { TomlPreview } from './TomlPreview';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const INITIAL: OnboardingForm = {
  name: '',
  slug: '',
  tags: [],
  description: '',
  frpcConfig: {
    protocol: 'tcp',
    tlsEnabled: true,
    tlsVerify: true,
    transportEncryptionEnabled: true,
    compressionEnabled: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
  },
  proxyRules: [],
};

interface CreatedInfo {
  nodeId: string;
  pairingToken: string;
  slug: string;
}

interface VerificationInfo {
  status: string;
  lastSeen?: string;
  tunnelStatus?: string;
  lastError?: { code?: string; message?: string };
}

export function OnboardingWizard({ hubUrl }: { hubUrl: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<OnboardingForm>(INITIAL);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [verification, setVerification] = useState<VerificationInfo | null>(null);

  useEffect(() => {
    if (step !== 6 || !created) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/fleet/nodes/${created.nodeId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setVerification({
          status: data.computedStatus ?? data.node?.status ?? 'waiting',
          lastSeen: data.node?.lastSeen,
          tunnelStatus: data.node?.tunnelStatus,
          lastError: data.node?.lastError,
        });
      } catch {
        // ignore polling errors
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [step, created]);

  const validateAndNext = async () => {
    setErrors([]);
    if (step === 1) {
      const sub = OnboardingFormSchema.pick({
        name: true,
        slug: true,
        tags: true,
        description: true,
      }).safeParse(form);
      if (!sub.success) {
        setErrors(sub.error.issues.map((i) => i.message));
        return;
      }
    }
    if (step === 3) {
      const sub = OnboardingFormSchema.pick({
        frpcConfig: true,
        proxyRules: true,
      }).safeParse(form);
      if (!sub.success) {
        setErrors(sub.error.issues.map((i) => i.message));
        return;
      }
    }
    if (step === 4) {
      setSubmitting(true);
      try {
        const res = await fetch('/api/fleet/nodes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Create failed');
        setCreated({
          nodeId: data.node._id,
          pairingToken: data.pairingToken,
          slug: data.node.slug,
        });
        setStep(5);
      } catch (e) {
        setErrors([(e as Error).message]);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setStep((s) => Math.min(6, s + 1) as Step);
  };

  const back = () => setStep((s) => Math.max(1, s - 1) as Step);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboard an Agent</CardTitle>
        <StepIndicator step={step} />
      </CardHeader>
      <CardContent className="space-y-4">
        {completed ? (
          <OnboardingFinish onDone={() => router.push('/fleet')} />
        ) : (
          <>
            {errors.length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1"
              >
                {errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {step === 1 && <StepIdentity form={form} setForm={setForm} />}
            {step === 2 && <StepDns />}
            {step === 3 && <StepFrpcConfig form={form} setForm={setForm} />}
            {step === 4 && <StepTomlReview form={form} />}
            {step === 5 && created && <StepInstall created={created} hubUrl={hubUrl} />}
            {step === 6 && created && <StepVerify created={created} verification={verification} />}
          </>
        )}
        {!completed && (
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={back} disabled={step === 1 || busy}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            {step < 5 && (
              <Button onClick={validateAndNext} disabled={busy}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === 5 && (
              <Button onClick={() => setStep(6)} disabled={!created}>
                I've run the command <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {step === 6 && (() => {
              // Allow finishing once the agent has reported any heartbeat, even
              // if the derived status is still "degraded"/"connecting". The
              // node detail page surfaces ongoing connection issues with full
              // diagnostics; we don't want the wizard to silently block the
              // user when the agent is up but the tunnel handshake is racy.
              const reachable = !!verification?.lastSeen;
              const healthy =
                verification?.status === 'online' || verification?.status === 'connecting';
              return (
                <Button
                  onClick={() => setCompleted(true)}
                  disabled={!reachable && !healthy}
                  variant={healthy ? 'default' : 'outline'}
                >
                  {healthy ? 'Finish Onboarding' : 'Finish anyway'}
                </Button>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex gap-1 mt-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i === step ? 'bg-primary' : i < step ? 'bg-primary/40' : 'bg-muted'
          }`}
        />
      ))}
    </div>
  );
}

function StepIdentity({
  form,
  setForm,
}: {
  form: OnboardingForm;
  setForm: (v: OnboardingForm) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium">Agent Name</label>
        <Input
          placeholder="e.g. Home Server"
          value={form.name}
          onChange={(e) => {
            const name = e.target.value;
            const slug = name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .replace(/-+/g, '-')
              .replace(/^-|-$/g, '');
            setForm({ ...form, name, slug });
          }}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Identifier (Slug)</label>
        <Input
          placeholder="e.g. home-server"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
        <p className="text-[10px] text-muted-foreground">
          Must be unique and URL-friendly (lowercase letters, numbers, hyphens).
        </p>
      </div>
    </div>
  );
}

function StepDns() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-400">
        <h4 className="font-semibold mb-1">DNS Requirement</h4>
        <p>
          Before adding this agent, ensure you have a wildcard DNS record (e.g. <code>*.ultron.manthanby.cv</code>)
          pointing to this Hub's IP address. This allows the Hub to route traffic to your agent
          automatically.
        </p>
      </div>
    </div>
  );
}

function StepFrpcConfig({
  form,
  setForm,
}: {
  form: OnboardingForm;
  setForm: (v: OnboardingForm) => void;
}) {
  return (
    <div className="space-y-4">
      <FrpcConfigForm
        value={form.frpcConfig}
        onChange={(v) => setForm({ ...form, frpcConfig: v })}
      />
      <ProxyRulesEditor
        value={form.proxyRules}
        onChange={(v) => setForm({ ...form, proxyRules: v })}
      />
    </div>
  );
}

function StepTomlReview({ form }: { form: OnboardingForm }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Review the generated FRP configuration for this agent.
      </p>
      <TomlPreview form={form} />
    </div>
  );
}

function StepInstall({ created, hubUrl }: { created: CreatedInfo; hubUrl: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Run this on the target machine. The pairing token is shown once and cannot be recovered.
      </p>
      <InstallerSnippet token={created.pairingToken} nodeId={created.nodeId} hubUrl={hubUrl} />
    </div>
  );
}

function StepVerify({
  created,
  verification,
}: {
  created: CreatedInfo;
  verification: VerificationInfo | null;
}) {
  const status = verification?.status ?? 'waiting';
  const tunnelStatus = verification?.tunnelStatus;
  const lastError = verification?.lastError;
  const isHealthy = status === 'online' || status === 'connecting';
  const isProblem = status === 'degraded' || status === 'error';
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Waiting for the agent to connect...</p>
      <div className="rounded-lg border border-border bg-card/50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge>{status}</Badge>
          {tunnelStatus && tunnelStatus !== status && (
            <span className="text-xs text-muted-foreground">tunnel: {tunnelStatus}</span>
          )}
          <span className="text-sm">
            {verification?.lastSeen
              ? `Last seen ${new Date(verification.lastSeen).toLocaleTimeString()}`
              : 'Not yet reported.'}
          </span>
        </div>
        {isHealthy && (
          <div className="text-sm text-[color:var(--success,#16a34a)]">
            Agent is connected — onboarding complete.
          </div>
        )}
        {isProblem && (
          <div className="space-y-1 text-sm">
            <div className="text-amber-500">
              Agent reached the hub but the FRP tunnel has not stabilized.
            </div>
            {lastError?.message && (
              <div className="text-xs text-muted-foreground">
                Last error: <code>{lastError.code ?? 'unknown'}</code> — {lastError.message}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              You can finish anyway and inspect logs from the node detail page, or wait for the
              next heartbeat to flip the status.
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Node id: <code>{created.nodeId}</code>
      </p>
    </div>
  );
}

function OnboardingFinish({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
      <div className="h-12 w-12 rounded-full bg-[color:var(--success,#16a34a)]/10 flex items-center justify-center">
        <Check className="h-6 w-6 text-[color:var(--success,#16a34a)]" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Agent Onboarded!</h3>
        <p className="text-sm text-muted-foreground">
          Your remote machine is now securely connected to the fleet.
        </p>
      </div>
      <Button onClick={onDone}>Go to Dashboard</Button>
    </div>
  );
}

type ProxyRule = OnboardingForm['proxyRules'][number];

function ProxyRulesEditor({
  value,
  onChange,
}: {
  value: OnboardingForm['proxyRules'];
  onChange: (v: OnboardingForm['proxyRules']) => void;
}) {
  const list = value ?? [];
  const add = () =>
    onChange([
      ...list,
      {
        name: `rule-${list.length + 1}`,
        type: 'tcp',
        localIp: '127.0.0.1',
        localPort: 8001,
        customDomains: [],
        enabled: true,
      },
    ]);
  const update = (i: number, patch: Partial<ProxyRule>) =>
    onChange(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Proxy Rules</h4>
        <Button variant="outline" onClick={add} type="button">
          Add rule
        </Button>
      </div>
      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No proxy rules yet. Add one to expose a local service.
        </p>
      )}
      {list.map((r, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-muted/20 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 relative group"
        >
          <Button
            variant="ghost"
            size="sm"
            className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border"
            onClick={() => remove(i)}
            type="button"
          >
            ×
          </Button>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Name</label>
            <Input
              className="h-8 text-xs"
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Type</label>
            <select
              value={r.type}
              onChange={(e) => update(i, { type: e.target.value as any })}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp'] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">Local IP</label>
            <Input
              className="h-8 text-xs"
              value={r.localIp}
              onChange={(e) => update(i, { localIp: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground">
              Local Port
            </label>
            <Input
              className="h-8 text-xs"
              type="number"
              value={r.localPort}
              onChange={(e) => update(i, { localPort: parseInt(e.target.value, 10) })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
