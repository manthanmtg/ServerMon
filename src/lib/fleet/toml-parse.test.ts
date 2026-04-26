import { describe, it, expect } from 'vitest';
import { parseRendered } from './toml-parse';
import { renderFrpsToml, renderFrpcToml } from './toml';

describe('parseRendered', () => {
  it('parses frps output', () => {
    const toml = renderFrpsToml({
      bindPort: 7000,
      vhostHttpPort: 8080,
      authToken: 'secret',
      subdomainHost: 'example.com',
    });
    const p = parseRendered(toml);
    expect(p.top.bindPort).toBe(7000);
    expect(p.top.vhostHTTPPort).toBe(8080);
    expect(p.top['auth.token']).toBe('secret');
    expect(p.top.subDomainHost).toBe('example.com');
    expect(p.proxies.length).toBe(0);
  });
  it('parses frpc proxies array', () => {
    const node = {
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
      proxyRules: [
        {
          name: 'term',
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
    const toml = renderFrpcToml({
      serverAddr: 'h',
      serverPort: 7000,
      authToken: 't',
      node,
    });
    const p = parseRendered(toml);
    expect(p.proxies.length).toBe(2);
    expect(p.proxies[0].name).toBe('orion-term');
    expect(p.proxies[0].type).toBe('tcp');
    expect(p.proxies[0].localPort).toBe(8001);
    expect(p.proxies[0].remotePort).toBe(9001);
    expect(p.proxies[1].name).toBe('orion-terminal-bridge');
  });
});
