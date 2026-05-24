import { describe, it, expect } from 'vitest';
import { fleetModule } from './module';
import type { ModuleContext } from '@/types/module';

describe('fleetModule', () => {
  it('exposes fleet id + routes', () => {
    expect(fleetModule.id).toBe('fleet-management');
    expect(fleetModule.routes!.map((r) => r.path)).toContain('/fleet');
    expect(fleetModule.routes!.map((r) => r.path)).toContain('/fleet/onboarding');
    expect(fleetModule.routes!.length).toBe(13);
  });
  it('registers FleetWidget', () => {
    expect(fleetModule.widgets!.map((w) => w.component)).toContain('FleetWidget');
  });
  it('lifecycle hooks accept a context without throwing', () => {
    const ctx: ModuleContext = {
      analytics: { track: () => {} },
      events: {
        emit: () => {},
        on: () => {},
      },
      db: {
        getCollection: () => ({}),
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      system: {
        capabilities: {
          platform: 'linux',
          arch: 'x64',
          cpus: 4,
          memory: 16_000_000_000,
        },
      },
      settings: {
        get: async () => undefined,
        set: async () => {},
      },
      ui: {
        theme: {
          id: 'default',
          mode: 'light',
        },
      },
    };
    expect(() => fleetModule.init!(ctx)).not.toThrow();
    expect(() => fleetModule.start!(ctx)).not.toThrow();
    expect(() => fleetModule.stop!(ctx)).not.toThrow();
  });
});
