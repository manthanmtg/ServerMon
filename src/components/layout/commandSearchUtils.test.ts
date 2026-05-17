import { describe, expect, it } from 'vitest';
import { footerNavItems, navGroups } from './navigation';
import {
  buildGlobalSearchItems,
  rankCommandSearchItems,
  type CommandSearchItem,
} from './commandSearchUtils';

describe('commandSearchUtils', () => {
  it('builds stable IDs for nav and footer entries', () => {
    const items = buildGlobalSearchItems();
    const navItemCount = navGroups.reduce((count, group) => count + group.items.length, 0);

    expect(items).toContainEqual(
      expect.objectContaining({ id: 'nav-dashboard', href: '/dashboard', group: 'Overview' })
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'overview-ai-runner',
        href: '/ai-runner',
        label: 'AI Runner > Overview',
      })
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'section-ai-runner-history',
        href: '/ai-runner?tab=history',
        group: 'AI Runner',
      })
    );
    expect(items).toContainEqual(
      expect.objectContaining({ id: 'nav-guide', href: '/guide', group: 'System' })
    );

    expect(items.filter((item) => item.id === 'overview-dashboard')).toHaveLength(0);
    expect(items).toHaveLength(navItemCount + (navItemCount - 1) + 6 + footerNavItems.length);
  });

  it('returns stable ranking for exact and prefix label matches', () => {
    const items: CommandSearchItem[] = [
      { id: 'services', label: 'Services', href: '/services', group: 'Modules', priority: 10 },
      {
        id: 'service',
        label: 'Service Health',
        href: '/services/health',
        group: 'Modules',
        priority: 5,
      },
      { id: 'users', label: 'User Guide', href: '/guide', group: 'System', priority: 1 },
    ];

    const results = rankCommandSearchItems(items, 'service');

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('services');
    expect(results[1]?.id).toBe('service');
  });

  it('falls back to subsequence scoring when full-text matching misses', () => {
    const results = rankCommandSearchItems(
      [
        { id: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'Overview' },
        { id: 'processes', label: 'Processes', href: '/processes', group: 'Modules' },
      ],
      'dsh'
    );

    expect(results).toEqual([expect.objectContaining({ id: 'dashboard' })]);
  });

  it('normalizes punctuation and spacing in query and item text', () => {
    const results = rankCommandSearchItems(
      [{ id: 'network', label: 'Network Speed Test', href: '/network', group: 'Modules' }],
      'NETWORK!!!  speed--test '
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'network', label: 'Network Speed Test' });
  });

  it('returns alphabetical results for equal scores while limiting output size', () => {
    const items: CommandSearchItem[] = [
      { id: 'zeta', label: 'Zebra', href: '/z', group: 'Modules', priority: 100 },
      { id: 'alpha', label: 'Alpha', href: '/a', group: 'Modules', priority: 100 },
      { id: 'beta', label: 'Beta', href: '/b', group: 'Modules', priority: 100 },
    ];

    const results = rankCommandSearchItems(items, '', 2);

    expect(results).toHaveLength(2);
    expect(results.map((item) => item.id)).toEqual(['alpha', 'beta']);
  });

  it('returns an empty list when there are no matches', () => {
    const items: CommandSearchItem[] = [
      { id: 'terminal', label: 'Terminal', href: '/terminal', group: 'Modules', priority: 1 },
    ];

    expect(rankCommandSearchItems(items, 'unrelated-topic')).toEqual([]);
  });
});
