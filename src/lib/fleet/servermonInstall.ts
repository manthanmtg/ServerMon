import { z } from 'zod';

export interface ServerMonRouteIntent {
  name: string;
  slug: string;
  domain: string;
  nodeId: string;
  proxyRuleName: string;
  target: { localIp: string; localPort: number; protocol: 'http' };
  tlsEnabled: boolean;
  tlsProvider: 'letsencrypt';
  accessMode: 'servermon_auth';
  websocketEnabled: boolean;
  compression: boolean;
  timeoutSeconds: number;
  maxBodyMb: number;
}

const MongoUriZ = z
  .string()
  .min(1, 'MongoDB URI is required')
  .refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), {
    message: 'MongoDB URI must start with mongodb:// or mongodb+srv://',
  });

export const ServerMonInstallRequestZ = z.object({
  mongoUri: MongoUriZ,
  port: z.number().int().min(1).max(65535).default(8912),
  skipMongo: z.boolean().default(true),
  allowRoot: z.boolean().default(true),
  installMode: z.enum(['release', 'source']).default('release'),
  versionTarget: z.string().trim().min(1).max(80).default('latest'),
  releaseBaseUrl: z.string().trim().min(1).max(500).optional(),
  sourceRef: z.string().trim().min(1).max(120).default('main'),
  createPublicRoute: z.boolean().default(false),
  routeDomain: z.string().min(1).max(253).optional(),
});

export function buildDefaultServerMonRouteIntent(input: {
  nodeId: string;
  nodeName: string;
  nodeSlug: string;
  port: number;
  subdomainHost?: string | null;
}): ServerMonRouteIntent {
  const slug = `${input.nodeSlug}-servermon`;
  const domain = input.subdomainHost ? `${slug}.${input.subdomainHost}` : slug;
  return {
    name: `${input.nodeName} ServerMon`,
    slug,
    domain,
    nodeId: input.nodeId,
    proxyRuleName: 'servermon',
    target: { localIp: '127.0.0.1', localPort: input.port, protocol: 'http' },
    tlsEnabled: true,
    tlsProvider: 'letsencrypt',
    accessMode: 'servermon_auth',
    websocketEnabled: true,
    compression: true,
    timeoutSeconds: 300,
    maxBodyMb: 64,
  };
}

export function redactInstallArgs(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const redacted: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  if ('mongoUri' in redacted) redacted.mongoUri = '[redacted]';
  if ('secretRef' in redacted) redacted.secretRef = '[redacted]';
  return redacted;
}
