import { describe, it, expect } from 'vitest';
import { AlertChannelZodSchema } from './AlertChannel';

describe('AlertChannelZodSchema', () => {
  it('accepts minimal valid webhook payload with defaults', () => {
    const parsed = AlertChannelZodSchema.parse({
      name: 'Ops Webhook',
      slug: 'ops-webhook',
      kind: 'webhook',
      config: { url: 'https://example.com/hook' },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.minSeverity).toBe('warn');
    expect(parsed.config).toEqual({ url: 'https://example.com/hook' });
  });

  it('accepts slack channel payload', () => {
    const parsed = AlertChannelZodSchema.parse({
      name: 'Slack #ops',
      slug: 'slack-ops',
      kind: 'slack',
      config: { webhookUrl: 'https://hooks.slack.com/abc', channel: '#ops' },
      minSeverity: 'error',
    });
    expect(parsed.kind).toBe('slack');
    expect(parsed.minSeverity).toBe('error');
  });

  it('accepts email channel payload', () => {
    const parsed = AlertChannelZodSchema.parse({
      name: 'Ops Email',
      slug: 'ops-email',
      kind: 'email',
      config: { to: ['ops@example.com'], subject: 'Alert' },
    });
    expect(parsed.config.to).toEqual(['ops@example.com']);
  });

  it('rejects missing name', () => {
    expect(() => AlertChannelZodSchema.parse({ slug: 'x', kind: 'webhook', config: {} })).toThrow();
  });

  it('rejects invalid slug regex', () => {
    expect(() =>
      AlertChannelZodSchema.parse({
        name: 'X',
        slug: 'Bad Slug!',
        kind: 'webhook',
        config: {},
      })
    ).toThrow();
  });

  it('rejects invalid kind enum', () => {
    expect(() =>
      AlertChannelZodSchema.parse({
        name: 'X',
        slug: 'x',
        kind: 'pagerduty',
        config: {},
      })
    ).toThrow();
  });

  it('rejects invalid minSeverity enum', () => {
    expect(() =>
      AlertChannelZodSchema.parse({
        name: 'X',
        slug: 'x',
        kind: 'webhook',
        config: {},
        minSeverity: 'critical',
      })
    ).toThrow();
  });

  it('rejects name that is too long', () => {
    expect(() =>
      AlertChannelZodSchema.parse({
        name: 'x'.repeat(121),
        slug: 'x',
        kind: 'webhook',
        config: {},
      })
    ).toThrow();
  });

  it('rejects description over 500 chars', () => {
    expect(() =>
      AlertChannelZodSchema.parse({
        name: 'X',
        slug: 'x',
        kind: 'webhook',
        config: {},
        description: 'a'.repeat(501),
      })
    ).toThrow();
  });

  it('accepts config passthrough for any kind', () => {
    const parsed = AlertChannelZodSchema.parse({
      name: 'Webhook',
      slug: 'wh',
      kind: 'webhook',
      config: {
        url: 'https://x',
        method: 'POST',
        headers: { 'x-auth': 'token' },
      },
    });
    expect(parsed.config).toMatchObject({ method: 'POST' });
  });
});
