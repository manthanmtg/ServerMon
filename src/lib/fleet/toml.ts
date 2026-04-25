import crypto from 'node:crypto';
import type { INodeDTO } from '@/models/Node';

export interface FrpsRenderInput {
  bindPort: number;
  vhostHttpPort: number;
  vhostHttpsPort?: number;
  authToken: string;
  subdomainHost: string;
  tlsOnly?: boolean;
}

function escapeStr(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function renderFrpsToml(i: FrpsRenderInput): string {
  const lines = [
    `bindAddr = "::"`,
    `bindPort = ${i.bindPort}`,
    `vhostHTTPPort = ${i.vhostHttpPort}`,
    `log.level = "info"`,
  ];
  if (i.vhostHttpsPort) {
    lines.push(`vhostHTTPSPort = ${i.vhostHttpsPort}`);
  }
  lines.push(`subDomainHost = ${escapeStr(i.subdomainHost)}`);
  lines.push(`auth.method = "token"`);
  lines.push(`auth.token = ${escapeStr(i.authToken)}`);
  // Enable TLS support on the Hub
  lines.push(`transport.tls.force = false`); 
  if (i.tlsOnly) lines.push(`transport.tls.force = true`);
  return lines.join('\n') + '\n';
}

export interface FrpcRenderInput {
  serverAddr: string;
  serverPort: number;
  authToken: string;
  node: Pick<INodeDTO, 'slug' | 'frpcConfig' | 'proxyRules'>;
}

export function renderFrpcToml(i: FrpcRenderInput): string {
  const cfg = i.node.frpcConfig ?? {
    protocol: 'tcp',
    tlsEnabled: false,
    tlsVerify: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
    transportEncryptionEnabled: false,
    compressionEnabled: false,
  };
  const out: string[] = [];
  out.push(`serverAddr = ${escapeStr(i.serverAddr)}`);
  out.push(`serverPort = ${i.serverPort}`);
  out.push(`auth.method = "token"`);
  out.push(`auth.token = ${escapeStr(i.authToken)}`);
  out.push(`transport.protocol = ${escapeStr(cfg.protocol || 'tcp')}`);
  out.push(`transport.tls.enable = ${!!cfg.tlsEnabled}`);
  out.push(`transport.tls.disableCustomTLSFirstByte = ${!cfg.tlsVerify}`);
  out.push(`transport.heartbeatInterval = ${cfg.heartbeatInterval || 30}`);
  out.push(`transport.heartbeatTimeout = ${cfg.heartbeatTimeout || 90}`);
  out.push(`transport.poolCount = ${cfg.poolCount || 1}`);
  for (const p of i.node.proxyRules || []) {
    if (!p.enabled) continue;
    out.push('');
    out.push('[[proxies]]');
    out.push(`name = ${escapeStr(`${i.node.slug}-${p.name}`)}`);
    out.push(`type = ${escapeStr(p.type)}`);
    out.push(`localIP = ${escapeStr(p.localIp)}`);
    out.push(`localPort = ${p.localPort}`);
    if (p.type === 'tcp' || p.type === 'udp') {
      if (p.remotePort) out.push(`remotePort = ${p.remotePort}`);
    }
    if (p.type === 'http' || p.type === 'https') {
      if (p.subdomain) out.push(`subdomain = ${escapeStr(p.subdomain)}`);
      if (p.customDomains.length)
        out.push(`customDomains = [${p.customDomains.map(escapeStr).join(', ')}]`);
    }
  }
  return out.join('\n') + '\n';
}

export function hashToml(rendered: string): string {
  return crypto.createHash('sha256').update(rendered).digest('hex');
}
