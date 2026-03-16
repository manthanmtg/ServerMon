/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { moduleGuides } from './guide-registry';

describe('moduleGuides registry', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(moduleGuides)).toBe(true);
    expect(moduleGuides.length).toBeGreaterThan(0);
  });

  it('every entry has id, name, and guide fields', () => {
    for (const item of moduleGuides) {
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.guide).toBeDefined();
    }
  });

  it('every guide has a title and sections array', () => {
    for (const item of moduleGuides) {
      expect(typeof item.guide.title).toBe('string');
      expect(item.guide.title.length).toBeGreaterThan(0);
      expect(Array.isArray(item.guide.sections)).toBe(true);
      expect(item.guide.sections.length).toBeGreaterThan(0);
    }
  });

  it('every section has title and content', () => {
    for (const item of moduleGuides) {
      for (const section of item.guide.sections) {
        expect(typeof section.title).toBe('string');
        expect(section.title.length).toBeGreaterThan(0);
        expect(typeof section.content).toBe('string');
        expect(section.content.length).toBeGreaterThan(0);
      }
    }
  });

  it('contains no duplicate guide ids', () => {
    const ids = moduleGuides.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('includes the main user guide entry', () => {
    const guide = moduleGuides.find((g) => g.id === 'guide');
    expect(guide).toBeDefined();
    expect(guide!.name).toBe('User Guide');
  });

  it('includes the dashboard guide', () => {
    expect(moduleGuides.some((g) => g.id === 'dashboard')).toBe(true);
  });

  it('includes the terminal guide', () => {
    expect(moduleGuides.some((g) => g.id === 'terminal')).toBe(true);
  });

  it('includes the docker guide', () => {
    expect(moduleGuides.some((g) => g.id === 'docker')).toBe(true);
  });

  it('includes the security guide', () => {
    expect(moduleGuides.some((g) => g.id === 'security')).toBe(true);
  });

  it('the main guide has at least 3 sections', () => {
    const guide = moduleGuides.find((g) => g.id === 'guide');
    expect(guide!.guide.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('optional icon field, when present, is a string', () => {
    for (const item of moduleGuides) {
      for (const section of item.guide.sections) {
        if (section.icon !== undefined) {
          expect(typeof section.icon).toBe('string');
        }
      }
    }
  });
});
