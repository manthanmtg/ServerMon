/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { certificatesModule } from './module';
import type { ModuleContext } from '@/types/module';

function makeCtx(): ModuleContext {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    events: { emit: vi.fn(), on: vi.fn() },
    analytics: { track: vi.fn() },
    db: { getCollection: vi.fn() },
    system: { capabilities: { platform: 'linux', arch: 'x64', cpus: 4, memory: 8 } },
    settings: { get: vi.fn(), set: vi.fn() },
    ui: { theme: { id: 'default', mode: 'dark' } },
  };
}

describe('certificatesModule', () => {
  it('has the correct id', () => {
    expect(certificatesModule.id).toBe('certificates');
  });

  it('has the correct name', () => {
    expect(certificatesModule.name).toBe('Certificates');
  });

  it('has version 1.0.0', () => {
    expect(certificatesModule.version).toBe('1.0.0');
  });

  it('registers the CertificatesWidget widget', () => {
    expect(certificatesModule.widgets).toBeDefined();
    const widget = certificatesModule.widgets!.find((w) => w.component === 'CertificatesWidget');
    expect(widget).toBeDefined();
    expect(widget!.id).toBe('certificates-overview');
  });

  it('registers the /certificates route', () => {
    expect(certificatesModule.routes).toBeDefined();
    const route = certificatesModule.routes!.find((r) => r.path === '/certificates');
    expect(route).toBeDefined();
    expect(route!.component).toBe('CertificatesPage');
  });

  describe('lifecycle hooks', () => {
    it('init() logs initialization', () => {
      const ctx = makeCtx();
      certificatesModule.init!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing'));
    });

    it('start() logs start message', () => {
      const ctx = makeCtx();
      certificatesModule.start!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Started'));
    });

    it('stop() logs stop message', () => {
      const ctx = makeCtx();
      certificatesModule.stop!(ctx);
      expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Stopped'));
    });
  });
});
