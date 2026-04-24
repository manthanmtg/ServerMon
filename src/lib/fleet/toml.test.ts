import { describe, it, expect } from 'vitest';
import { renderFrpsToml, renderFrpcToml, hashToml } from './toml';

describe('renderFrpsToml', () => {
  it('renders minimal config', () => {
    const out = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 'secret',
      subdomainHost: 'example.com',
    });
    expect(out).toContain('bindPort = 7000');
    expect(out).toContain('vhostHTTPPort = 8080');
    expect(out).toContain('subDomainHost = "example.com"');
    expect(out).toContain('auth.method = "token"');
    expect(out).toContain('auth.token = "secret"');
  });
  it('escapes quotes in tokens', () => {
    const out = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 'a"b',
      subdomainHost: 'x',
    });
    expect(out).toContain('auth.token = "a\\"b"');
  });
  it('emits TLS force when tlsOnly', () => {
    const out = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 't',
      subdomainHost: 'x',
      tlsOnly: true,
    });
    expect(out).toContain('transport.tls.force = true');
  });
  it('emits vhostHTTPSPort when provided', () => {
    const out = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      vhostHttpsPort: 8443,
      authToken: 't',
      subdomainHost: 'x',
    });
    expect(out).toContain('vhostHTTPSPort = 8443');
  });
});

describe('renderFrpcToml', () => {
  const baseNode = {
    slug: 'orion',
    frpcConfig: {
      protocol: 'tcp' as const,
      tlsEnabled: true,
      tlsVerify: true,
      transportEncryptionEnabled: true,
      compressionEnabled: false,
      heartbeatInterval: 30,
      heartbeatTimeout: 90,
      poolCount: 1,
      advanced: {},
    },
    proxyRules: [] as Array<{
      name: string;
      type: 'tcp' | 'http' | 'https' | 'udp' | 'stcp' | 'xtcp';
      subdomain?: string;
      localIp: string;
      localPort: number;
      remotePort?: number;
      customDomains: string[];
      enabled: boolean;
      status:
        | 'active'
        | 'disabled'
        | 'failed'
        | 'port_conflict'
        | 'dns_missing'
        | 'upstream_unreachable';
    }>,
  };
  it('renders baseline frpc toml', () => {
    const out = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 't',
      node: baseNode,
    });
    expect(out).toContain('serverAddr = "hub.example.com"');
    expect(out).toContain('serverPort = 7000');
    expect(out).toContain('transport.protocol = "tcp"');
    expect(out).toContain('transport.tls.enable = true');
    expect(out).toContain('transport.heartbeatInterval = 30');
    expect(out).toContain('transport.poolCount = 1');
    expect(out).toContain('transport.useEncryption = true');
    expect(out).toContain('transport.useCompression = false');
  });
  it('emits tcp proxy with remotePort', () => {
    const node = {
      ...baseNode,
      proxyRules: [
        {
          name: 'terminal',
          type: 'tcp' as const,
          localIp: '127.0.0.1',
          localPort: 8001,
          remotePort: 9001,
          customDomains: [],
          enabled: true,
          status: 'disabled' as const,
        },
      ],
    };
    const out = renderFrpcToml({
      serverAddr: 'h',
      serverPort: 7000,
      authToken: 't',
      node,
    });
    expect(out).toContain('[[proxies]]');
    expect(out).toContain('name = "orion-terminal"');
    expect(out).toContain('type = "tcp"');
    expect(out).toContain('localPort = 8001');
    expect(out).toContain('remotePort = 9001');
  });
  it('emits http proxy with subdomain + customDomains', () => {
    const node = {
      ...baseNode,
      proxyRules: [
        {
          name: 'photos',
          type: 'http' as const,
          localIp: '127.0.0.1',
          localPort: 3000,
          subdomain: 'photos',
          customDomains: ['photos.example.com'],
          enabled: true,
          status: 'disabled' as const,
        },
      ],
    };
    const out = renderFrpcToml({
      serverAddr: 'h',
      serverPort: 7000,
      authToken: 't',
      node,
    });
    expect(out).toContain('type = "http"');
    expect(out).toContain('subdomain = "photos"');
    expect(out).toContain('customDomains = ["photos.example.com"]');
  });
  it('skips disabled proxies', () => {
    const node = {
      ...baseNode,
      proxyRules: [
        {
          name: 'off',
          type: 'tcp' as const,
          localIp: '127.0.0.1',
          localPort: 80,
          customDomains: [],
          enabled: false,
          status: 'disabled' as const,
        },
      ],
    };
    const out = renderFrpcToml({
      serverAddr: 'h',
      serverPort: 7000,
      authToken: 't',
      node,
    });
    expect(out).not.toContain('off');
  });
});

describe('hashToml', () => {
  it('produces stable sha256 hex', () => {
    expect(hashToml('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });
});
