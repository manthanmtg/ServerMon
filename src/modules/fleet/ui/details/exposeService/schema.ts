import { z } from 'zod';
import { ACCESS_MODES } from '@/lib/fleet/enums';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TargetSchema = z.object({
  localIp: z.string().min(1),
  localPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['http', 'https', 'tcp']),
});

export const ExposeFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .regex(SLUG_RE, 'Slug must be lowercase letters, numbers, and hyphens'),
  domain: z.string().min(1, 'Domain is required').max(253),
  templateSlug: z.string().optional(),
  nodeId: z.string().min(1, 'Node is required'),
  proxyRuleName: z
    .string()
    .min(1, 'Proxy rule is required')
    .regex(/^[a-z0-9-]+$/, 'Proxy rule name must be lowercase letters, numbers, and hyphens'),
  createNewProxyRule: z.boolean().default(false),
  target: TargetSchema,
  accessMode: z.enum(ACCESS_MODES).default('servermon_auth'),
  tlsEnabled: z.boolean().default(true),
  tlsProvider: z.enum(['letsencrypt', 'manual', 'reverse_proxy']).optional(),
});

export type ExposeForm = z.infer<typeof ExposeFormSchema>;

export const INITIAL_FORM: ExposeForm = {
  name: '',
  slug: '',
  domain: '',
  templateSlug: undefined,
  nodeId: '',
  proxyRuleName: '',
  createNewProxyRule: false,
  target: { localIp: '127.0.0.1', localPort: 8080, protocol: 'http' },
  accessMode: 'servermon_auth',
  tlsEnabled: true,
  tlsProvider: 'letsencrypt',
};

export interface ExposeFormErrors {
  name?: string;
  slug?: string;
  domain?: string;
  nodeId?: string;
  proxyRuleName?: string;
  target?: string;
}

/** Validates just the identity step (name/slug/domain). */
export function validateIdentity(form: ExposeForm): ExposeFormErrors {
  const errs: ExposeFormErrors = {};
  if (!form.name.trim()) errs.name = 'Name is required';
  if (!form.slug.trim()) errs.slug = 'Slug is required';
  else if (!SLUG_RE.test(form.slug))
    errs.slug = 'Slug must be lowercase letters, numbers, and hyphens';
  if (!form.domain.trim()) errs.domain = 'Domain is required';
  return errs;
}

/** Validates the target step (node + proxy rule + target config). */
export function validateTarget(form: ExposeForm): ExposeFormErrors {
  const errs: ExposeFormErrors = {};
  if (!form.nodeId) errs.nodeId = 'Node is required';
  if (!form.proxyRuleName.trim()) errs.proxyRuleName = 'Proxy rule is required';
  if (form.createNewProxyRule) {
    if (!form.target.localIp.trim() || !Number.isFinite(form.target.localPort)) {
      errs.target = 'Target IP and port are required';
    }
  }
  return errs;
}
