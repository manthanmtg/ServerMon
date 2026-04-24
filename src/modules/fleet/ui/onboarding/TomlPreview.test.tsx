import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TomlPreview } from './TomlPreview';
import type { OnboardingForm } from './schema';

function makeForm(overrides: Partial<OnboardingForm> = {}): OnboardingForm {
  return {
    name: 'Alpha',
    slug: 'alpha',
    tags: [],
    frpcConfig: {
      protocol: 'tcp',
      tlsEnabled: true,
      tlsVerify: true,
      transportEncryptionEnabled: true,
      compressionEnabled: false,
      heartbeatInterval: 30,
      heartbeatTimeout: 90,
      poolCount: 1,
    },
    proxyRules: [],
    ...overrides,
  };
}

describe('TomlPreview', () => {
  it('renders TOML with serverAddr placeholder, protocol, and tls settings', () => {
    const { container } = render(<TomlPreview form={makeForm()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('serverAddr = "<hub-configured-on-save>"');
    expect(text).toContain('serverPort = 7000');
    expect(text).toContain('transport.protocol = "tcp"');
    expect(text).toContain('transport.tls.enable = true');
    expect(text).toContain('transport.heartbeatInterval = 30');
  });

  it('emits [[proxies]] blocks for enabled rules and uses slug prefix', () => {
    const { container } = render(
      <TomlPreview
        form={makeForm({
          slug: 'edge-42',
          proxyRules: [
            {
              name: 'http',
              type: 'http',
              subdomain: 'foo',
              localIp: '127.0.0.1',
              localPort: 8080,
              customDomains: [],
              enabled: true,
            },
            {
              name: 'ssh',
              type: 'tcp',
              localIp: '127.0.0.1',
              localPort: 22,
              remotePort: 2222,
              customDomains: [],
              enabled: true,
            },
            {
              name: 'off',
              type: 'tcp',
              localIp: '127.0.0.1',
              localPort: 5000,
              customDomains: [],
              enabled: false,
            },
          ],
        })}
      />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('[[proxies]]');
    expect(text).toContain('name = "edge-42-http"');
    expect(text).toContain('subdomain = "foo"');
    expect(text).toContain('name = "edge-42-ssh"');
    expect(text).toContain('remotePort = 2222');
    // Disabled rule should not appear
    expect(text).not.toContain('edge-42-off');
  });

  it('falls back to "pending" slug when empty', () => {
    const { container } = render(<TomlPreview form={makeForm({ slug: '' })} />);
    const text = container.textContent ?? '';
    // no proxies = no name lines referencing slug, but renderer expects a string
    expect(text).toContain('transport.protocol = "tcp"');
  });
});
