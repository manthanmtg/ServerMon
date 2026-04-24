'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BUILTIN_TEMPLATES } from '@/lib/fleet/templates';
import { ExposeForm, validateIdentity } from './schema';

interface Template {
  slug: string;
  name: string;
  description: string;
  defaults: {
    localPort?: number;
    protocol: 'http' | 'https' | 'tcp';
    websocket: boolean;
    timeoutSec: number;
    uploadBodyMb: number;
    accessMode:
      | 'public'
      | 'servermon_auth'
      | 'ip_allowlist'
      | 'basic_auth'
      | 'temporary_share'
      | 'disabled';
  };
}

interface Props {
  form: ExposeForm;
  setForm: (f: ExposeForm) => void;
  next: () => void;
  onCancel?: () => void;
}

export function StepIdentity({ form, setForm, next, onCancel }: Props) {
  const [templates, setTemplates] = useState<Template[]>(() =>
    BUILTIN_TEMPLATES.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      defaults: t.defaults,
    }))
  );
  const [attemptedNext, setAttemptedNext] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/fleet/templates');
        if (!res.ok) return;
        const data = (await res.json()) as { templates?: Template[] };
        if (cancelled || !Array.isArray(data.templates)) return;
        setTemplates(data.templates);
      } catch {
        // fall back to built-ins already seeded above
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const errs = useMemo(() => (attemptedNext ? validateIdentity(form) : {}), [attemptedNext, form]);

  const applyTemplate = (slug: string) => {
    if (!slug) {
      setForm({ ...form, templateSlug: undefined });
      return;
    }
    const t = templates.find((x) => x.slug === slug);
    if (!t) {
      setForm({ ...form, templateSlug: slug });
      return;
    }
    setForm({
      ...form,
      templateSlug: slug,
      target: {
        ...form.target,
        protocol: t.defaults.protocol,
        localPort: t.defaults.localPort ?? form.target.localPort,
      },
      accessMode: t.defaults.accessMode,
    });
  };

  const handleNext = () => {
    setAttemptedNext(true);
    const errors = validateIdentity(form);
    if (Object.keys(errors).length === 0) {
      next();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">Identity</h4>
        <p className="text-xs text-muted-foreground">
          Pick a human-readable name, URL slug, and the public domain for this route.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="My App"
          error={errs.name}
        />
        <Input
          label="Slug"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder="my-app"
          error={errs.slug}
        />
        <Input
          label="Domain"
          value={form.domain}
          onChange={(e) => setForm({ ...form, domain: e.target.value })}
          placeholder="app.example.com"
          error={errs.domain}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground" htmlFor="expose-template">
            Template (optional)
          </label>
          <select
            id="expose-template"
            value={form.templateSlug ?? ''}
            onChange={(e) => applyTemplate(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" onClick={handleNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
