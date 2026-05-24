import { describe, expect, it } from 'vitest';

import { OnboardingFormSchema } from './schema';

describe('OnboardingFormSchema', () => {
  it('validates a fully-populated onboarding payload', () => {
    const result = OnboardingFormSchema.safeParse({
      name: 'Demo Node',
      slug: 'demo-node',
      description: 'Demo instance',
      tags: ['infra', 'api'],
      frpcConfig: {
        protocol: 'tcp',
        tlsEnabled: false,
        tlsVerify: true,
        transportEncryptionEnabled: false,
        compressionEnabled: true,
        heartbeatInterval: 60,
        heartbeatTimeout: 120,
        poolCount: 3,
      },
      proxyRules: [
        {
          name: 'api',
          type: 'tcp',
          localIp: '127.0.0.1',
          localPort: 8080,
          remotePort: 8081,
          customDomains: ['api.internal'],
          enabled: true,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('populates defaults when optional nested fields are omitted', () => {
    const result = OnboardingFormSchema.safeParse({
      name: 'Default Node',
      slug: 'default-node',
      frpcConfig: {},
      proxyRules: [
        {
          name: 'backend',
          type: 'tcp',
          localIp: '127.0.0.1',
          localPort: 3000,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
      expect(result.data.frpcConfig).toMatchObject({
        protocol: 'tcp',
        tlsEnabled: true,
        tlsVerify: true,
        transportEncryptionEnabled: true,
        compressionEnabled: false,
        heartbeatInterval: 30,
        heartbeatTimeout: 90,
        poolCount: 1,
      });
      expect(result.data.proxyRules[0].customDomains).toEqual([]);
      expect(result.data.proxyRules[0].enabled).toBe(true);
      expect(result.data.proxyRules[0].localPort).toBe(3000);
    }
  });

  it('requires a non-empty name and slug', () => {
    const result = OnboardingFormSchema.safeParse({
      name: '',
      slug: '',
      frpcConfig: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('name');
      expect(paths).toContain('slug');
    }
  });

  it('rejects slugs outside lowercase hyphen format', () => {
    expect(
      OnboardingFormSchema.safeParse({
        name: 'Invalid',
        slug: 'Bad_Slug',
        frpcConfig: {},
      }).success
    ).toBe(false);
  });

  it('enforces heartbeat and timeout bounds', () => {
    const base = {
      name: 'Node',
      slug: 'node',
      frpcConfig: {
        heartbeatInterval: 4,
        heartbeatTimeout: 3601,
      },
    };

    const result = OnboardingFormSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'frpcConfig.heartbeatInterval')).toBe(true);
      expect(result.error.issues.some((i) => i.path.join('.') === 'frpcConfig.heartbeatTimeout')).toBe(true);
    }
  });

  it('validates proxy rule port and rule-name constraints', () => {
    const badPort = OnboardingFormSchema.safeParse({
      name: 'Node',
      slug: 'node',
      frpcConfig: {},
      proxyRules: [
        {
          name: 'bad name',
          type: 'tcp',
          localIp: '127.0.0.1',
          localPort: 0,
        },
      ],
    });

    expect(badPort.success).toBe(false);
    if (!badPort.success) {
      expect(
        badPort.error.issues.some(
          (i) => i.path.join('.') === 'proxyRules.0.name' || i.path.join('.') === 'proxyRules.0.localPort'
        )
      ).toBe(true);
    }

    const validRule = OnboardingFormSchema.safeParse({
      name: 'Node',
      slug: 'node',
      frpcConfig: {},
      proxyRules: [
        {
          name: 'api-1',
          type: 'udp',
          localIp: '127.0.0.1',
          localPort: 53,
          remotePort: 53,
        },
      ],
    });

    expect(validRule.success).toBe(true);
  });
});
