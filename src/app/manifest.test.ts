/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import manifest from './manifest';

describe('manifest', () => {
  it('returns a valid web app manifest', () => {
    const result = manifest();
    expect(result).toBeDefined();
  });

  it('has the correct name', () => {
    const result = manifest();
    expect(result.name).toBe('ServerMon');
  });

  it('has the correct short_name', () => {
    const result = manifest();
    expect(result.short_name).toBe('ServerMon');
  });

  it('has start_url set to root', () => {
    const result = manifest();
    expect(result.start_url).toBe('/');
  });

  it('has standalone display mode', () => {
    const result = manifest();
    expect(result.display).toBe('standalone');
  });

  it('includes icons', () => {
    const result = manifest();
    expect(Array.isArray(result.icons)).toBe(true);
    expect((result.icons ?? []).length).toBeGreaterThan(0);
  });

  it('uses the dynamic branding icon', () => {
    const result = manifest();
    const icons = result.icons ?? [];
    expect(icons.every((icon) => icon.src === '/api/settings/branding/icon')).toBe(true);
  });

  it('has correct scope', () => {
    const result = manifest();
    expect(result.scope).toBe('/');
  });

  it('has background_color defined', () => {
    const result = manifest();
    expect(result.background_color).toBeDefined();
  });

  it('has theme_color defined', () => {
    const result = manifest();
    expect(result.theme_color).toBeDefined();
  });
});
