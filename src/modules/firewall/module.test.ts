/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import type { ModuleContext } from '@/types/module';
import { firewallModule } from './module';

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

describe('firewallModule', () => {
  it('registers the Firewall module metadata, widget, and route', () => {
    expect(firewallModule.id).toBe('firewall');
    expect(firewallModule.name).toBe('Firewall');
    expect(firewallModule.widgets?.[0]?.component).toBe('FirewallWidget');
    expect(firewallModule.routes?.[0]).toMatchObject({
      path: '/firewall',
      component: 'FirewallPage',
      name: 'Firewall',
    });
  });

  it('logs lifecycle hooks', () => {
    const ctx = makeCtx();
    firewallModule.init?.(ctx);
    firewallModule.start?.(ctx);
    firewallModule.stop?.(ctx);

    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing Firewall'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Firewall Started'));
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Firewall Stopped'));
  });
});
