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
    const ctx = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    } as unknown as ModuleContext;
    expect(() => fleetModule.init!(ctx)).not.toThrow();
    expect(() => fleetModule.start!(ctx)).not.toThrow();
    expect(() => fleetModule.stop!(ctx)).not.toThrow();
  });
});
