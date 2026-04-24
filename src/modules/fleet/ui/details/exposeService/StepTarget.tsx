'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExposeForm, validateTarget } from './schema';

interface NodeRow {
  _id: string;
  name: string;
  slug: string;
  proxyRules?: Array<{
    name: string;
    type: string;
    localIp: string;
    localPort: number;
  }>;
}

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  back: () => void;
}

export function StepTarget({ form, setForm, next, back }: Props) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [attemptedNext, setAttemptedNext] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNodesLoading(true);
    const load = async () => {
      try {
        const res = await fetch('/api/fleet/nodes?limit=200');
        if (!res.ok) return;
        const data = (await res.json()) as { nodes?: NodeRow[] };
        if (cancelled) return;
        setNodes(data.nodes ?? []);
      } catch {
        // leave nodes empty
      } finally {
        if (!cancelled) setNodesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n._id === form.nodeId),
    [nodes, form.nodeId]
  );
  const proxyRules = selectedNode?.proxyRules ?? [];

  const errs = useMemo(() => (attemptedNext ? validateTarget(form) : {}), [attemptedNext, form]);

  const handleNext = () => {
    setAttemptedNext(true);
    const errors = validateTarget(form);
    if (Object.keys(errors).length === 0) {
      next();
    }
  };

  const onNodeChange = (nodeId: string) => {
    // Reset proxy rule when switching nodes.
    setForm({
      ...form,
      nodeId,
      proxyRuleName: '',
      createNewProxyRule: false,
    });
  };

  const onProxyChange = (value: string) => {
    if (value === '__new__') {
      setForm({
        ...form,
        proxyRuleName: form.slug || '',
        createNewProxyRule: true,
      });
      return;
    }
    const rule = proxyRules.find((p) => p.name === value);
    if (rule) {
      setForm({
        ...form,
        proxyRuleName: rule.name,
        createNewProxyRule: false,
        target: {
          localIp: rule.localIp,
          localPort: rule.localPort,
          protocol: (rule.type === 'tcp' ? 'tcp' : 'http') as 'http' | 'tcp',
        },
      });
    } else {
      setForm({ ...form, proxyRuleName: value, createNewProxyRule: false });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Target</h4>
        <p className="text-xs text-muted-foreground">
          Choose the node and proxy rule that backs this public route. You can reuse an existing
          rule or create a new one.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="expose-node">
            Node
          </label>
          <select
            id="expose-node"
            value={form.nodeId}
            onChange={(e) => onNodeChange(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            disabled={nodesLoading}
          >
            <option value="">{nodesLoading ? 'Loading nodes…' : 'Select a node…'}</option>
            {nodes.map((n) => (
              <option key={n._id} value={n._id}>
                {n.name} ({n.slug})
              </option>
            ))}
          </select>
          {errs.nodeId && <p className="text-xs text-destructive">{errs.nodeId}</p>}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="block text-sm font-medium text-foreground" htmlFor="expose-proxyrule">
            Proxy rule
          </label>
          <select
            id="expose-proxyrule"
            value={
              form.createNewProxyRule
                ? '__new__'
                : proxyRules.some((p) => p.name === form.proxyRuleName)
                  ? form.proxyRuleName
                  : ''
            }
            onChange={(e) => onProxyChange(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            disabled={!form.nodeId}
          >
            <option value="">Select a rule…</option>
            {proxyRules.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.localIp}:{p.localPort})
              </option>
            ))}
            <option value="__new__">Create new rule…</option>
          </select>
          {errs.proxyRuleName && <p className="text-xs text-destructive">{errs.proxyRuleName}</p>}
        </div>

        {form.createNewProxyRule && (
          <>
            <Input
              label="New rule name"
              value={form.proxyRuleName}
              onChange={(e) => setForm({ ...form, proxyRuleName: e.target.value.toLowerCase() })}
              placeholder="my-app"
            />
            <Input
              label="Target IP"
              value={form.target.localIp}
              onChange={(e) =>
                setForm({
                  ...form,
                  target: { ...form.target, localIp: e.target.value },
                })
              }
            />
            <Input
              label="Target port"
              type="number"
              value={form.target.localPort}
              onChange={(e) =>
                setForm({
                  ...form,
                  target: {
                    ...form.target,
                    localPort: Number(e.target.value),
                  },
                })
              }
            />
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="expose-protocol"
              >
                Protocol
              </label>
              <select
                id="expose-protocol"
                value={form.target.protocol}
                onChange={(e) =>
                  setForm({
                    ...form,
                    target: {
                      ...form.target,
                      protocol: e.target.value as 'http' | 'https' | 'tcp',
                    },
                  })
                }
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="http">http</option>
                <option value="https">https</option>
                <option value="tcp">tcp</option>
              </select>
            </div>
            {errs.target && <p className="text-xs text-destructive md:col-span-2">{errs.target}</p>}
          </>
        )}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="outline" type="button" onClick={back}>
          Back
        </Button>
        <Button type="button" onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
