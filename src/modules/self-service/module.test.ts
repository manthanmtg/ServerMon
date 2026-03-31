import { describe, it, expect } from 'vitest';
import { selfServiceModule } from './module';

describe('selfServiceModule', () => {
  it('should have correct id', () => {
    expect(selfServiceModule.id).toBe('self-service');
  });

  it('should have name and version', () => {
    expect(selfServiceModule.name).toBe('Self Service');
    expect(selfServiceModule.version).toBe('1.0.0');
  });

  it('should have a description', () => {
    expect(selfServiceModule.description).toBeDefined();
    expect(typeof selfServiceModule.description).toBe('string');
  });

  it('should register a widget', () => {
    expect(selfServiceModule.widgets).toHaveLength(1);
    expect(selfServiceModule.widgets![0].id).toBe('self-service-overview');
    expect(selfServiceModule.widgets![0].component).toBe('SelfServiceWidget');
  });

  it('should register a route', () => {
    expect(selfServiceModule.routes).toHaveLength(1);
    expect(selfServiceModule.routes![0].path).toBe('/self-service');
  });

  it('should have lifecycle hooks', () => {
    expect(typeof selfServiceModule.init).toBe('function');
    expect(typeof selfServiceModule.start).toBe('function');
    expect(typeof selfServiceModule.stop).toBe('function');
  });
});
