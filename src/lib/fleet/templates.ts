import type { Model } from 'mongoose';

export interface BuiltinTemplate {
  slug: string;
  name: string;
  kind: 'builtin';
  source: 'system';
  description: string;
  defaults: {
    localPort?: number;
    protocol: 'http' | 'https' | 'tcp';
    websocket: boolean;
    timeoutSec: number;
    uploadBodyMb: number;
    headers: Record<string, string>;
    accessMode:
      | 'public'
      | 'servermon_auth'
      | 'ip_allowlist'
      | 'basic_auth'
      | 'temporary_share'
      | 'disabled';
    healthPath?: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    slug: 'servermon',
    name: 'ServerMon',
    kind: 'builtin',
    source: 'system',
    description: 'Expose a full ServerMon instance running on this Fleet node.',
    defaults: {
      localPort: 8912,
      protocol: 'http',
      websocket: true,
      timeoutSec: 300,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'public',
      healthPath: '/login',
      logLevel: 'info',
    },
  },
  {
    slug: 'generic-http',
    name: 'Generic HTTP',
    kind: 'builtin',
    source: 'system',
    description: 'Baseline HTTP route for arbitrary web services behind ServerMon auth.',
    defaults: {
      protocol: 'http',
      websocket: false,
      timeoutSec: 60,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'servermon_auth',
      logLevel: 'info',
    },
  },
  {
    slug: 'generic-tcp',
    name: 'Generic TCP',
    kind: 'builtin',
    source: 'system',
    description: 'Baseline TCP forward for non-HTTP services.',
    defaults: {
      protocol: 'tcp',
      websocket: false,
      timeoutSec: 60,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'servermon_auth',
      logLevel: 'info',
    },
  },
  {
    slug: 'nextjs',
    name: 'Next.js',
    kind: 'builtin',
    source: 'system',
    description: 'Next.js app with websocket HMR/socket support and standard health probe.',
    defaults: {
      protocol: 'http',
      websocket: true,
      timeoutSec: 120,
      uploadBodyMb: 64,
      headers: {},
      accessMode: 'public',
      healthPath: '/api/health',
      logLevel: 'info',
    },
  },
  {
    slug: 'grafana',
    name: 'Grafana',
    kind: 'builtin',
    source: 'system',
    description: 'Grafana observability dashboard on localhost:3000.',
    defaults: {
      localPort: 3000,
      protocol: 'http',
      websocket: true,
      timeoutSec: 120,
      uploadBodyMb: 16,
      headers: {},
      accessMode: 'basic_auth',
      healthPath: '/api/health',
      logLevel: 'info',
    },
  },
  {
    slug: 'home-assistant',
    name: 'Home Assistant',
    kind: 'builtin',
    source: 'system',
    description: 'Home Assistant with long-running websocket sessions and large uploads.',
    defaults: {
      localPort: 8123,
      protocol: 'http',
      websocket: true,
      timeoutSec: 600,
      uploadBodyMb: 128,
      headers: {},
      accessMode: 'servermon_auth',
      healthPath: '/api/',
      logLevel: 'info',
    },
  },
  {
    slug: 'jellyfin',
    name: 'Jellyfin',
    kind: 'builtin',
    source: 'system',
    description: 'Jellyfin media server with streaming-scale timeouts and upload body.',
    defaults: {
      localPort: 8096,
      protocol: 'http',
      websocket: true,
      timeoutSec: 3600,
      uploadBodyMb: 1024,
      headers: {},
      accessMode: 'public',
      healthPath: '/health',
      logLevel: 'info',
    },
  },
  {
    slug: 'websocket-app',
    name: 'WebSocket App',
    kind: 'builtin',
    source: 'system',
    description: 'Generic websocket-first app with extended idle timeout.',
    defaults: {
      protocol: 'http',
      websocket: true,
      timeoutSec: 600,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'servermon_auth',
      logLevel: 'info',
    },
  },
  {
    slug: 'static-web',
    name: 'Static Web',
    kind: 'builtin',
    source: 'system',
    description: 'Static site or CDN-style asset server with short timeouts.',
    defaults: {
      protocol: 'http',
      websocket: false,
      timeoutSec: 30,
      uploadBodyMb: 16,
      headers: {},
      accessMode: 'public',
      logLevel: 'info',
    },
  },
  {
    slug: 'admin-only',
    name: 'Admin Only',
    kind: 'builtin',
    source: 'system',
    description: 'Admin tool locked down by IP allowlist with conservative logging.',
    defaults: {
      protocol: 'http',
      websocket: false,
      timeoutSec: 60,
      uploadBodyMb: 32,
      headers: {},
      accessMode: 'ip_allowlist',
      logLevel: 'warn',
    },
  },
  {
    slug: 'terminal-only',
    name: 'Terminal Only',
    kind: 'builtin',
    source: 'system',
    description: 'Raw TCP terminal route gated behind ServerMon auth.',
    defaults: {
      protocol: 'tcp',
      websocket: false,
      timeoutSec: 60,
      uploadBodyMb: 1,
      headers: {},
      accessMode: 'servermon_auth',
      logLevel: 'info',
    },
  },
];

/**
 * Upserts all built-in templates by slug. Returns the total number of
 * templates processed (upserted + updated).
 */
export async function seedBuiltinTemplates(RouteTemplate: Model<unknown>): Promise<number> {
  let count = 0;
  for (const template of BUILTIN_TEMPLATES) {
    await RouteTemplate.findOneAndUpdate(
      { slug: template.slug },
      {
        slug: template.slug,
        name: template.name,
        kind: template.kind,
        source: template.source,
        description: template.description,
        defaults: template.defaults,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count++;
  }
  return count;
}
