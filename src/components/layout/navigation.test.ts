import { describe, expect, it } from 'vitest';

import { footerNavItems, navGroups } from './navigation';

describe('navigation configuration', () => {
  it('defines the expected top-level navigation groups', () => {
    const labels = navGroups.map((group) => group.label);

    expect(labels).toEqual(['Overview', 'Fleet', 'Modules']);
    expect(navGroups).toHaveLength(3);
  });

  it('keeps overview and fleet items stable for deterministic UI ordering', () => {
    expect(navGroups[0]?.items).toEqual([
      expect.objectContaining({ label: 'Dashboard', href: '/dashboard' }),
    ]);
    expect(navGroups[1]?.items).toEqual([
      expect.objectContaining({ label: 'Fleet', href: '/fleet' }),
      expect.objectContaining({ label: 'Hub Setup', href: '/fleet/setup' }),
      expect.objectContaining({ label: 'Endpoint Runner', href: '/fleet/endpoint-runner' }),
      expect.objectContaining({ label: 'Alerts', href: '/fleet/alerts' }),
    ]);
  });

  it('contains footer links with expected destinations', () => {
    expect(footerNavItems).toEqual([
      expect.objectContaining({ label: 'User Guide', href: '/guide' }),
      expect.objectContaining({ label: 'Settings', href: '/settings' }),
    ]);
  });

  it('uses absolute, non-empty hrefs and labels for all top-level items', () => {
    const allTopLevelItems = navGroups.flatMap((group) => group.items);

    expect(allTopLevelItems.length).toBeGreaterThan(20);
    expect(allTopLevelItems.every((item) => item.label.trim().length > 0)).toBe(true);
    expect(allTopLevelItems.every((item) => item.href.startsWith('/') && item.href.length > 1)).toBe(true);
  });

  it('defines unique top-level navigation labels', () => {
    const labels = navGroups.flatMap((group) => group.items.map((item) => item.label));
    const uniqueLabels = new Set(labels);

    expect(uniqueLabels.size).toBe(labels.length);
  });

  it('does not reuse hrefs between top-level navigation items', () => {
    const hrefs = navGroups.flatMap((group) => group.items.map((item) => item.href));
    const uniqueHrefs = new Set(hrefs);

    expect(uniqueHrefs.size).toBe(hrefs.length);
  });

  it('does not reuse hrefs between main and footer navigation', () => {
    const topLevelHrefs = new Set(navGroups.flatMap((group) => group.items.map((item) => item.href)));
    const footerHrefs = footerNavItems.map((item) => item.href);

    expect(footerHrefs.every((href) => !topLevelHrefs.has(href))).toBe(true);
  });

  it('accepts every nav item icon as a valid Lucide icon component', () => {
    const allItems = [...navGroups.flatMap((group) => group.items), ...footerNavItems];

    expect(
      allItems.every(
        (item) => item.icon && typeof item.icon === 'object' && Object.prototype.hasOwnProperty.call(item.icon, 'render')
      )
    ).toBe(true);
  });

  it('contains a sizable modules section and the expected footer size', () => {
    const modules = navGroups.find((group) => group.label === 'Modules');
    const moduleCount = modules?.items.length ?? 0;

    expect(moduleCount).toBeGreaterThanOrEqual(20);
    expect(footerNavItems).toHaveLength(2);
  });
});
