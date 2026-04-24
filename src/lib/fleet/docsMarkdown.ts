export interface DocsNode {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  tunnelStatus: string;
  tags?: string[];
  agentVersion?: string;
  frpcVersion?: string;
  hardware?: {
    cpuCount?: number;
    totalRam?: number;
    diskSize?: number;
    osDistro?: string;
    arch?: string;
  };
  frpcConfig?: {
    protocol: string;
    tlsEnabled: boolean;
    heartbeatInterval: number;
    heartbeatTimeout: number;
  };
  proxyRules?: Array<{
    name: string;
    type: string;
    localPort: number;
    remotePort?: number;
    subdomain?: string;
    enabled: boolean;
    status: string;
  }>;
  capabilities?: Record<string, boolean>;
  maintenance?: { enabled: boolean; reason?: string };
  lastSeen?: string | Date;
  lastBootAt?: string | Date;
  createdBy?: string;
}

export interface DocsRoute {
  _id?: string;
  name: string;
  slug: string;
  domain: string;
  path: string;
  nodeId: string;
  proxyRuleName: string;
  target: { localIp: string; localPort: number; protocol: string };
  tlsEnabled: boolean;
  tlsProvider?: string;
  accessMode: string;
  status: string;
  healthStatus?: string;
  dnsStatus?: string;
  websocketEnabled: boolean;
  http2Enabled: boolean;
  maxBodyMb: number;
  timeoutSeconds: number;
  compression: boolean;
  lastCheckedAt?: string | Date;
  lastError?: string;
  createdBy?: string;
}

export interface DocsRevisionBrief {
  _id?: string;
  kind: string;
  version: number;
  hash: string;
  createdAt: string | Date;
  createdBy?: string;
  appliedAt?: string | Date;
  rolledBackAt?: string | Date;
}

const DASH = '—';

function fmtDate(v: string | Date | undefined): string {
  if (v === undefined || v === null) return DASH;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toISOString();
}

function fmtVal(v: string | number | boolean | undefined | null): string {
  if (v === undefined || v === null || v === '') return DASH;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

function renderTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].filter((l) => l.length > 0).join('\n');
}

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

export function renderNodeDoc(
  node: DocsNode,
  routes: DocsRoute[],
  revisions: DocsRevisionBrief[],
  now?: Date
): string {
  const out: string[] = [];
  out.push(`# ${node.name} (${node.slug})`);
  out.push('');
  if (node.description && node.description.length > 0) {
    out.push(node.description);
    out.push('');
  }

  // Status
  out.push('## Status');
  out.push(`- Top-level: ${fmtVal(node.status)}`);
  out.push(`- Tunnel: ${fmtVal(node.tunnelStatus)}`);
  out.push(`- Last seen: ${fmtDate(node.lastSeen)}`);
  out.push(`- Last boot: ${fmtDate(node.lastBootAt)}`);
  const agent = node.agentVersion ? fmtVal(node.agentVersion) : DASH;
  const frpc = node.frpcVersion ? fmtVal(node.frpcVersion) : DASH;
  out.push(`- Agent: ${agent} (frpc ${frpc})`);
  if (node.maintenance?.enabled) {
    const reason = node.maintenance.reason ? ` (${node.maintenance.reason})` : '';
    out.push(`- Maintenance: yes${reason}`);
  } else {
    out.push('- Maintenance: no');
  }
  out.push('');

  // Hardware
  if (node.hardware) {
    out.push('## Hardware');
    out.push(
      renderTable(
        ['CPU', 'RAM', 'Disk', 'OS', 'Arch'],
        [
          [
            fmtVal(node.hardware.cpuCount),
            fmtVal(node.hardware.totalRam),
            fmtVal(node.hardware.diskSize),
            fmtVal(node.hardware.osDistro),
            fmtVal(node.hardware.arch),
          ],
        ]
      )
    );
    out.push('');
  }

  // FRPC Config
  if (node.frpcConfig) {
    out.push('## FRPC Config');
    out.push(`- Protocol: ${fmtVal(node.frpcConfig.protocol)}`);
    out.push(`- TLS: ${fmtVal(node.frpcConfig.tlsEnabled)}`);
    out.push(
      `- Heartbeat: ${node.frpcConfig.heartbeatInterval}s / timeout ${node.frpcConfig.heartbeatTimeout}s`
    );
    out.push('');
  }

  // Proxy Rules
  if (node.proxyRules && node.proxyRules.length > 0) {
    out.push('## Proxy Rules');
    out.push(
      renderTable(
        ['Name', 'Type', 'Local', 'Remote/Subdomain', 'Enabled', 'Status'],
        node.proxyRules.map((p) => [
          fmtVal(p.name),
          fmtVal(p.type),
          fmtVal(p.localPort),
          p.subdomain
            ? fmtVal(p.subdomain)
            : p.remotePort !== undefined
              ? fmtVal(p.remotePort)
              : DASH,
          fmtVal(p.enabled),
          fmtVal(p.status),
        ])
      )
    );
    out.push('');
  }

  // Public Routes
  if (routes.length > 0) {
    out.push('## Public Routes');
    out.push(
      renderTable(
        ['Domain', 'Path', 'Access', 'Status'],
        routes.map((r) => [
          fmtVal(r.domain),
          fmtVal(r.path),
          fmtVal(r.accessMode),
          fmtVal(r.status),
        ])
      )
    );
    out.push('');
  }

  // Capabilities
  if (node.capabilities) {
    const enabled = Object.entries(node.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (enabled.length > 0) {
      out.push('## Capabilities');
      for (const cap of enabled) {
        out.push(`- ${cap}`);
      }
      out.push('');
    }
  }

  // Tags
  if (node.tags && node.tags.length > 0) {
    out.push('## Tags');
    out.push(node.tags.map((t) => `\`${t}\``).join(', '));
    out.push('');
  }

  // Recent Revisions
  if (revisions.length > 0) {
    out.push('## Recent Revisions');
    out.push(
      renderTable(
        ['Version', 'Kind', 'Hash', 'Created', 'By', 'Applied'],
        revisions.map((r) => [
          fmtVal(r.version),
          fmtVal(r.kind),
          fmtVal(r.hash),
          fmtDate(r.createdAt),
          fmtVal(r.createdBy),
          fmtDate(r.appliedAt),
        ])
      )
    );
    out.push('');
  }

  out.push('---');
  out.push(`Generated: ${nowIso(now)}`);
  return out.join('\n') + '\n';
}

export function renderRouteDoc(
  route: DocsRoute,
  revisions: DocsRevisionBrief[],
  nodeName?: string,
  now?: Date
): string {
  const out: string[] = [];
  out.push(`# ${route.name} (${route.slug})`);
  out.push('');
  const nodeLine = nodeName
    ? `Public route on node \`${nodeName}\` via proxy \`${route.proxyRuleName}\`.`
    : `Public route via proxy \`${route.proxyRuleName}\`.`;
  out.push(nodeLine);
  out.push('');

  // Status
  out.push('## Status');
  out.push(`- Top-level: ${fmtVal(route.status)}`);
  out.push(`- Health: ${fmtVal(route.healthStatus)}`);
  out.push(`- DNS: ${fmtVal(route.dnsStatus)}`);
  out.push(`- Last checked: ${fmtDate(route.lastCheckedAt)}`);
  if (route.lastError) {
    out.push(`- Last error: ${route.lastError}`);
  }
  out.push('');

  // Target
  out.push('## Target');
  out.push(`- Domain: ${fmtVal(route.domain)}`);
  out.push(`- Path: ${fmtVal(route.path)}`);
  out.push(`- Upstream: ${fmtVal(route.target.localIp)}:${fmtVal(route.target.localPort)}`);
  out.push(`- Protocol: ${fmtVal(route.target.protocol)}`);
  out.push('');

  // Access
  out.push('## Access');
  out.push(`- Mode: ${fmtVal(route.accessMode)}`);
  out.push(`- TLS: ${fmtVal(route.tlsEnabled)}`);
  if (route.tlsEnabled) {
    out.push(`- TLS provider: ${fmtVal(route.tlsProvider)}`);
  }
  out.push('');

  // Ingress
  out.push('## Ingress');
  out.push(`- WebSocket: ${fmtVal(route.websocketEnabled)}`);
  out.push(`- HTTP/2: ${fmtVal(route.http2Enabled)}`);
  out.push(`- Max body: ${route.maxBodyMb} MB`);
  out.push(`- Timeout: ${route.timeoutSeconds}s`);
  out.push(`- Compression: ${fmtVal(route.compression)}`);
  out.push('');

  // Revisions
  if (revisions.length > 0) {
    out.push('## Revisions');
    out.push(
      renderTable(
        ['Version', 'Kind', 'Hash', 'Created', 'By', 'Applied'],
        revisions.map((r) => [
          fmtVal(r.version),
          fmtVal(r.kind),
          fmtVal(r.hash),
          fmtDate(r.createdAt),
          fmtVal(r.createdBy),
          fmtDate(r.appliedAt),
        ])
      )
    );
    out.push('');
  }

  out.push('---');
  out.push(`Generated: ${nowIso(now)}`);
  return out.join('\n') + '\n';
}
