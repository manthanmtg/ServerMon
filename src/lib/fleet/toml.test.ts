/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  renderFrpsToml,
  renderFrpcToml,
  terminalBridgeRemotePort,
  hashToml,
  DEFAULT_PTY_LISTEN_PORT,
  type FrpcRenderInput,
} from './toml';

describe('toml', () => {
  describe('renderFrpsToml', () => {
    it('should render basic frps config', () => {
      const input = {
        bindPort: 7000,
        vhostHttpPort: 80,
        authToken: 'secret',
        subdomainHost: 'example.com',
      };
      const rendered = renderFrpsToml(input);
      expect(rendered).toContain('bindPort = 7000');
      expect(rendered).toContain('vhostHTTPPort = 80');
      expect(rendered).toContain('auth.token = "secret"');
      expect(rendered).toContain('subDomainHost = "example.com"');
      expect(rendered).not.toContain('vhostHTTPSPort');
    });

    it('should include vhostHTTPSPort if provided', () => {
      const input = {
        bindPort: 7000,
        vhostHttpPort: 80,
        vhostHttpsPort: 443,
        authToken: 'secret',
        subdomainHost: 'example.com',
      };
      const rendered = renderFrpsToml(input);
      expect(rendered).toContain('vhostHTTPSPort = 443');
    });

    it('should handle tlsOnly flag', () => {
      const input = {
        bindPort: 7000,
        vhostHttpPort: 80,
        authToken: 'secret',
        subdomainHost: 'example.com',
        tlsOnly: true,
      };
      const rendered = renderFrpsToml(input);
      expect(rendered).toContain('transport.tls.force = true');
    });
  });

  describe('terminalBridgeRemotePort', () => {
    it('should return a stable port for a given slug', () => {
      const port1 = terminalBridgeRemotePort('node-1');
      const port2 = terminalBridgeRemotePort('node-1');
      const port3 = terminalBridgeRemotePort('node-2');

      expect(port1).toBe(port2);
      expect(port1).not.toBe(port3);
      expect(port1).toBeGreaterThanOrEqual(20000);
      expect(port1).toBeLessThan(40000);
    });

    it('should handle empty slug', () => {
      const port = terminalBridgeRemotePort('');
      expect(port).toBeGreaterThanOrEqual(20000);
    });
  });

  describe('renderFrpcToml', () => {
    const baseInput = {
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken: 'token123',
      node: {
        slug: 'my-node',
        proxyRules: [],
        frpcConfig: {
          protocol: 'websocket',
          tlsEnabled: true,
          tlsVerify: true,
          heartbeatInterval: 10,
          heartbeatTimeout: 30,
          poolCount: 5,
          transportEncryptionEnabled: true,
          compressionEnabled: true,
        },
      },
    };

    it('should render basic frpc config with default rules', () => {
      const rendered = renderFrpcToml(baseInput as unknown as FrpcRenderInput);
      expect(rendered).toContain('serverAddr = "hub.example.com"');
      expect(rendered).toContain('serverPort = 7000');
      expect(rendered).toContain('transport.protocol = "websocket"');

      // Should automatically add terminal-bridge
      expect(rendered).toContain('[[proxies]]');
      expect(rendered).toContain('name = "my-node-terminal-bridge"');
      expect(rendered).toContain(`localPort = ${DEFAULT_PTY_LISTEN_PORT}`);
    });

    it('should render custom proxy rules', () => {
      const input = {
        ...baseInput,
        node: {
          ...baseInput.node,
          proxyRules: [
            {
              name: 'web',
              type: 'http',
              localIp: '127.0.0.1',
              localPort: 3000,
              subdomain: 'app',
              customDomains: ['myapp.com'],
              enabled: true,
            },
          ],
        },
      };
      const rendered = renderFrpcToml(input as unknown as FrpcRenderInput);
      expect(rendered).toContain('name = "my-node-web"');
      expect(rendered).toContain('type = "http"');
      expect(rendered).toContain('subdomain = "app"');
      expect(rendered).toContain('customDomains = ["myapp.com"]');
    });

    it('should respect terminal capability disabled', () => {
      const input = {
        ...baseInput,
        node: {
          ...baseInput.node,
          capabilities: { terminal: false },
        },
      };
      const rendered = renderFrpcToml(input as unknown as FrpcRenderInput);
      expect(rendered).not.toContain('terminal-bridge');
    });
  });

  describe('hashToml', () => {
    it('should return a sha256 hash', () => {
      const hash = hashToml('some content');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(hash).toBe(hashToml('some content'));
      expect(hash).not.toBe(hashToml('other content'));
    });
  });
});
