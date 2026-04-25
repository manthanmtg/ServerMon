'use client';
import { useEffect, useMemo, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BUILTIN_TEMPLATES } from '@/lib/fleet/templates';
import { buildHubRouteDomain, ExposeForm, slugifyRouteName, validateIdentity } from './schema';

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
    headers?: Record<string, string>;
    accessMode:
      | 'public'
      | 'servermon_auth'
      | 'ip_allowlist'
      | 'basic_auth'
      | 'temporary_share'
      | 'disabled';
    healthPath?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
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
  const [subdomainHost, setSubdomainHost] = useState('');

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

  useEffect(() => {
    let cancelled = false;
    const loadServer = async () => {
      try {
        const res = await fetch('/api/fleet/server');
        if (!res.ok) return;
        const data = (await res.json()) as {
          state?: { subdomainHost?: string };
          envDefaults?: { hubPublicUrl?: string };
        };
        if (cancelled) return;
        const host =
          data.state?.subdomainHost ||
          (data.envDefaults?.hubPublicUrl ? new URL(data.envDefaults.hubPublicUrl).hostname : '');
        setSubdomainHost(host);
        if (host && !form.domain) {
          const nextSlug = form.slug || slugifyRouteName(form.name);
          setForm({
            ...form,
            slug: nextSlug,
            domain: buildHubRouteDomain(nextSlug, host),
            domainMode: 'hub_subdomain',
          });
        }
      } catch {
        // Keep manual domain entry available.
      }
    };
    loadServer();
    return () => {
      cancelled = true;
    };
    // Run once on mount; later edits are handled by local change handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      websocketEnabled: t.defaults.websocket,
      timeoutSeconds: t.defaults.timeoutSec,
      maxBodyMb: t.defaults.uploadBodyMb,
      headers: t.defaults.headers ?? form.headers,
    });
  };

  const updateName = (name: string) => {
    const previousAutoSlug = slugifyRouteName(form.name);
    const shouldUpdateSlug = !form.slug || form.slug === previousAutoSlug;
    const nextSlug = shouldUpdateSlug ? slugifyRouteName(name) : form.slug;
    setForm({
      ...form,
      name,
      slug: nextSlug,
      domain:
        form.domainMode === 'hub_subdomain'
          ? buildHubRouteDomain(nextSlug, subdomainHost)
          : form.domain,
      proxyRuleName:
        !form.proxyRuleName || form.proxyRuleName === form.slug ? nextSlug : form.proxyRuleName,
    });
  };

  const updateSlug = (slug: string) => {
    const nextSlug = slugifyRouteName(slug);
    setForm({
      ...form,
      slug: nextSlug,
      domain:
        form.domainMode === 'hub_subdomain'
          ? buildHubRouteDomain(nextSlug, subdomainHost)
          : form.domain,
      proxyRuleName:
        !form.proxyRuleName || form.proxyRuleName === form.slug ? nextSlug : form.proxyRuleName,
    });
  };

  const updateDomainMode = (domainMode: ExposeForm['domainMode']) => {
    setForm({
      ...form,
      domainMode,
      domain:
        domainMode === 'hub_subdomain'
          ? buildHubRouteDomain(form.slug || slugifyRouteName(form.name), subdomainHost)
          : '',
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
          onChange={(e) => updateName(e.target.value)}
          placeholder="My App"
          error={errs.name}
        />
        <Input
          label="Slug"
          value={form.slug}
          onChange={(e) => updateSlug(e.target.value)}
          placeholder="my-app"
          error={errs.slug}
        />
        <div className="space-y-2 md:col-span-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Domain type">
            <Button
              type="button"
              size="sm"
              variant={form.domainMode === 'hub_subdomain' ? 'default' : 'outline'}
              onClick={() => updateDomainMode('hub_subdomain')}
              disabled={!subdomainHost}
            >
              Hub subdomain
            </Button>
            <Button
              type="button"
              size="sm"
              variant={form.domainMode === 'custom' ? 'default' : 'outline'}
              onClick={() => updateDomainMode('custom')}
            >
              Custom domain
            </Button>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {form.domainMode === 'hub_subdomain'
                ? `Uses ${subdomainHost || 'the Hub subdomain host'} automatically.`
                : 'Use a domain whose DNS points to this Hub.'}
            </span>
          </div>
          <Input
            label={form.domainMode === 'hub_subdomain' ? 'Public URL' : 'Custom domain'}
            value={form.domain}
            onChange={(e) =>
              setForm({
                ...form,
                domain: e.target.value.toLowerCase(),
                domainMode: 'custom',
              })
            }
            placeholder={
              form.domainMode === 'hub_subdomain'
                ? `my-app.${subdomainHost || 'example.com'}`
                : 'app.example.com'
            }
            error={errs.domain}
            readOnly={form.domainMode === 'hub_subdomain'}
          />
        </div>
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
