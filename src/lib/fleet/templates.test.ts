import { describe, it, expect, vi } from 'vitest';
import { BUILTIN_TEMPLATES, seedBuiltinTemplates } from './templates';
import { ACCESS_MODES } from './enums';

const EXPECTED_SLUGS = [
  'servermon',
  'generic-http',
  'generic-tcp',
  'nextjs',
  'grafana',
  'home-assistant',
  'jellyfin',
  'websocket-app',
  'static-web',
  'admin-only',
  'terminal-only',
];

const VALID_PROTOCOLS = ['http', 'https', 'tcp'] as const;
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

describe('BUILTIN_TEMPLATES', () => {
  it('has exactly 11 entries', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(11);
  });

  it('contains all expected slugs', () => {
    const slugs = BUILTIN_TEMPLATES.map((t) => t.slug).sort();
    expect(slugs).toEqual([...EXPECTED_SLUGS].sort());
  });

  it('every template has kind=builtin and source=system', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.kind).toBe('builtin');
      expect(t.source).toBe('system');
    }
  });

  it('every template uses a valid protocol', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(VALID_PROTOCOLS).toContain(t.defaults.protocol);
    }
  });

  it('every template uses a valid accessMode', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(ACCESS_MODES).toContain(t.defaults.accessMode);
    }
  });

  it('every template uses a valid logLevel', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(VALID_LOG_LEVELS).toContain(t.defaults.logLevel);
    }
  });

  it('every template has headers as a record and numeric timeoutSec/uploadBodyMb', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(typeof t.defaults.headers).toBe('object');
      expect(t.defaults.headers).not.toBeNull();
      expect(typeof t.defaults.timeoutSec).toBe('number');
      expect(typeof t.defaults.uploadBodyMb).toBe('number');
      expect(t.defaults.uploadBodyMb).toBeGreaterThanOrEqual(1);
    }
  });

  it('nextjs template has websocket=true and healthPath=/api/health', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.slug === 'nextjs')!;
    expect(t.defaults.websocket).toBe(true);
    expect(t.defaults.healthPath).toBe('/api/health');
    expect(t.defaults.accessMode).toBe('public');
  });

  it('generic-tcp template uses tcp protocol', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.slug === 'generic-tcp')!;
    expect(t.defaults.protocol).toBe('tcp');
  });

  it('grafana template has localPort 3000 and basic_auth accessMode', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.slug === 'grafana')!;
    expect(t.defaults.localPort).toBe(3000);
    expect(t.defaults.accessMode).toBe('basic_auth');
  });

  it('servermon template exposes the full app defaults', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.slug === 'servermon')!;
    expect(t.defaults.localPort).toBe(8912);
    expect(t.defaults.protocol).toBe('http');
    expect(t.defaults.websocket).toBe(true);
    expect(t.defaults.timeoutSec).toBe(300);
    expect(t.defaults.accessMode).toBe('public');
    expect(t.defaults.healthPath).toBe('/login');
  });
});

describe('seedBuiltinTemplates', () => {
  it('upserts each template by slug', async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({});
    const FakeModel = { findOneAndUpdate } as never;
    const count = await seedBuiltinTemplates(FakeModel);
    expect(count).toBe(BUILTIN_TEMPLATES.length);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(BUILTIN_TEMPLATES.length);
    for (const call of findOneAndUpdate.mock.calls) {
      const [filter, , opts] = call;
      expect(filter).toHaveProperty('slug');
      expect(opts).toMatchObject({ upsert: true });
    }
  });

  it('passes the template as the update payload', async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({});
    const FakeModel = { findOneAndUpdate } as never;
    await seedBuiltinTemplates(FakeModel);
    for (const call of findOneAndUpdate.mock.calls) {
      const [, update] = call;
      expect(update).toHaveProperty('slug');
      expect(update).toHaveProperty('name');
      expect(update).toHaveProperty('defaults');
      expect(update.kind).toBe('builtin');
      expect(update.source).toBe('system');
    }
  });
});
