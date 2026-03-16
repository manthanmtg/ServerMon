/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { guideModule } from './module';

describe('guideModule', () => {
  it('has the correct id', () => {
    expect(guideModule.id).toBe('guide');
  });

  it('has the correct name', () => {
    expect(guideModule.name).toBe('User Guide');
  });

  it('has version 1.0.0', () => {
    expect(guideModule.version).toBe('1.0.0');
  });

  it('has no widgets (documentation-only module)', () => {
    expect(guideModule.widgets).toBeUndefined();
  });

  it('registers the /guide route', () => {
    expect(guideModule.routes).toBeDefined();
    const route = guideModule.routes!.find((r) => r.path === '/guide');
    expect(route).toBeDefined();
    expect(route!.component).toBe('UserGuidePage');
  });

  it('has no lifecycle hooks (static module)', () => {
    expect(guideModule.init).toBeUndefined();
    expect(guideModule.start).toBeUndefined();
    expect(guideModule.stop).toBeUndefined();
  });

  it('has guide content with title and description', () => {
    expect(guideModule.guide).toBeDefined();
    expect(guideModule.guide!.title).toBe('Mastering ServerMon');
    expect(guideModule.guide!.description).toBeDefined();
  });

  it('has guide sections with title, content, and icon', () => {
    expect(guideModule.guide!.sections).toBeDefined();
    expect(guideModule.guide!.sections!.length).toBeGreaterThan(0);

    for (const section of guideModule.guide!.sections!) {
      expect(section.title).toBeDefined();
      expect(section.content).toBeDefined();
      expect(section.icon).toBeDefined();
    }
  });

  it('guide sections include Introduction and Getting Started', () => {
    const titles = guideModule.guide!.sections!.map((s) => s.title);
    expect(titles).toContain('Introduction');
    expect(titles).toContain('Getting Started');
  });
});
