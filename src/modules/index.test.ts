/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { coreModules } from './index';

describe('coreModules registry', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(coreModules)).toBe(true);
    expect(coreModules.length).toBeGreaterThan(0);
  });

  it('every module has required fields: id, name, version', () => {
    for (const mod of coreModules) {
      expect(typeof mod.id).toBe('string');
      expect(mod.id.length).toBeGreaterThan(0);
      expect(typeof mod.name).toBe('string');
      expect(mod.name.length).toBeGreaterThan(0);
      expect(typeof mod.version).toBe('string');
      expect(mod.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('contains no duplicate module ids', () => {
    const ids = coreModules.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('includes the health-monitor module', () => {
    expect(coreModules.some((m) => m.id === 'health-monitor')).toBe(true);
  });

  it('includes the terminal module', () => {
    expect(coreModules.some((m) => m.id === 'terminal')).toBe(true);
  });

  it('includes the docker-monitor module', () => {
    expect(coreModules.some((m) => m.id === 'docker-monitor')).toBe(true);
  });

  it('includes the ai-agents module', () => {
    expect(coreModules.some((m) => m.id === 'ai-agents')).toBe(true);
  });

  it('includes the ai-runner module', () => {
    expect(coreModules.some((m) => m.id === 'ai-runner')).toBe(true);
  });

  it('includes the crons-manager module', () => {
    expect(coreModules.some((m) => m.id === 'crons-manager')).toBe(true);
  });

  it('includes the updates-monitor module', () => {
    expect(coreModules.some((m) => m.id === 'updates-monitor')).toBe(true);
  });

  it('includes the endpoints module', () => {
    expect(coreModules.some((m) => m.id === 'endpoints-manager')).toBe(true);
  });

  it('includes the fleet-management module', () => {
    expect(coreModules.some((m) => m.id === 'fleet-management')).toBe(true);
  });

  it('includes exactly 25 modules', () => {
    expect(coreModules).toHaveLength(25);
  });

  it('every module with widgets has valid widget objects', () => {
    for (const mod of coreModules) {
      if (mod.widgets) {
        for (const widget of mod.widgets) {
          expect(typeof widget.id).toBe('string');
          expect(typeof widget.name).toBe('string');
          expect(typeof widget.component).toBe('string');
        }
      }
    }
  });

  it('every module with routes has valid route objects', () => {
    for (const mod of coreModules) {
      if (mod.routes) {
        for (const route of mod.routes) {
          expect(typeof route.path).toBe('string');
          expect(route.path).toMatch(/^\//);
          expect(typeof route.component).toBe('string');
          expect(typeof route.name).toBe('string');
        }
      }
    }
  });
});
