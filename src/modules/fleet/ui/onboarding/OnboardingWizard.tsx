'use client';
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';
import { FrpcConfigForm } from './FrpcConfigForm';
import { TomlPreview } from './TomlPreview';
import { DnsVerifier } from './DnsVerifier';
import { InstallerSnippet } from './InstallerSnippet';
import { OnboardingFormSchema, type OnboardingForm } from './schema';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const INITIAL: OnboardingForm = {
  name: '',
  slug: '',
  tags: [],
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
}

export function OnboardingWizard({ hubUrl = 'hub.local' }: { hubUrl?: string }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<OnboardingForm>(INITIAL);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
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
        <div className="flex justify-between pt-2">
          <Button onClick={back} variant="outline" disabled={step === 1 || step === 6}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 6 && (
            <Button onClick={validateAndNext} disabled={submitting}>
              {submitting ? (
                <Spinner />
              ) : (
                <>
                  {step === 4 ? 'Create agent' : 'Next'} <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
          {step === 6 && created && (
            <a
              href={`/fleet/${created.slug}`}
              className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm rounded-lg bg-primary text-primary-foreground font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              Open node
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ['Identity', 'DNS', 'FRPC', 'TOML', 'Install', 'Verify'];
  return (
    <div className="flex flex-wrap gap-2 mt-2">
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

function StepIdentity({
  form,
  setForm,
}: {
  form: OnboardingForm;
  setForm: (f: OnboardingForm) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-muted-foreground">Name</span>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Home Desktop"
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Slug</span>
        <Input
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder="orion"
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Description (optional)</span>
        <Input
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Tags (comma-separated)</span>
        <Input
          value={form.tags.join(', ')}
          onChange={(e) =>
            setForm({
              ...form,
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          placeholder="home, edge"
        />
      </label>
    </div>
  );
}

function StepDns() {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">
        Verify DNS and TLS prerequisites. This is optional for Phase 1 and can be deferred.
      </p>
      <DnsVerifier />
    </div>
  );
}

function StepFrpcConfig({
  form,
  setForm,
}: {
  form: OnboardingForm;
  setForm: (f: OnboardingForm) => void;
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
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Preview the generated frpc.toml. Once you click Create, this will be stored as revision 1.
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
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Waiting for the agent to connect...</p>
      <div className="rounded-lg border border-border bg-card/50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge>{status}</Badge>
          <span className="text-sm">
            {verification?.lastSeen
              ? `Last seen ${new Date(verification.lastSeen).toLocaleTimeString()}`
              : 'Not yet reported.'}
          </span>
        </div>
        {status === 'online' && (
          <div className="text-sm text-[color:var(--success,#16a34a)]">
            Agent is online — onboarding complete.
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Node id: <code>{created.nodeId}</code>
      </p>
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
          className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded border border-border p-2"
        >
          <Input
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="name"
            aria-label={`Rule ${i + 1} name`}
          />
          <select
            value={r.type}
            onChange={(e) => update(i, { type: e.target.value as ProxyRule['type'] })}
            aria-label={`Rule ${i + 1} type`}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp'] as const).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Input
            value={r.localIp}
            onChange={(e) => update(i, { localIp: e.target.value })}
            placeholder="127.0.0.1"
            aria-label={`Rule ${i + 1} local IP`}
          />
          <Input
            type="number"
            value={r.localPort}
            onChange={(e) => update(i, { localPort: Number(e.target.value) })}
            placeholder="local port"
            aria-label={`Rule ${i + 1} local port`}
          />
          <Input
            type="number"
            value={r.remotePort ?? ''}
            onChange={(e) =>
              update(i, {
                remotePort: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="remote port (tcp/udp)"
            aria-label={`Rule ${i + 1} remote port`}
          />
          <div className="flex gap-2 items-center">
            <Input
              value={r.subdomain ?? ''}
              onChange={(e) => update(i, { subdomain: e.target.value })}
              placeholder="subdomain (http)"
              aria-label={`Rule ${i + 1} subdomain`}
            />
            <Button variant="outline" onClick={() => remove(i)} type="button">
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
