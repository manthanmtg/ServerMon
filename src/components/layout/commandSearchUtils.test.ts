import { describe, expect, it } from 'vitest';
import { Cog } from 'lucide-react';
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

  it('respects empty-query priorities and enforces the limit', () => {
    const items: CommandSearchItem[] = [
      { id: 'low', label: 'Low', href: '/low', group: 'Modules', priority: 1 },
      { id: 'mid', label: 'Middle', href: '/mid', group: 'Modules', priority: 4 },
      { id: 'high', label: 'High', href: '/high', group: 'Modules', priority: 12 },
    ];

    expect(rankCommandSearchItems(items, '', 2).map((item) => item.id)).toEqual(['high', 'mid']);
  });

  it('adds custom nav-derived overview entries except for dashboard', () => {
    const items = buildGlobalSearchItems([
      {
        label: 'Operations',
        items: [
          { label: 'Dashboard', href: '/dashboard', icon: Cog },
          { label: 'Control Panel', href: '/admin/panel', icon: Cog },
        ],
      },
    ]);

    expect(items).toHaveLength(2 + 1 + footerNavItems.length);
    expect(items.some((item) => item.id === 'nav-dashboard')).toBe(true);
    expect(items.some((item) => item.id === 'overview-dashboard')).toBe(false);
    expect(items.some((item) => item.id === 'nav-admin-panel')).toBe(true);
    expect(items.some((item) => item.id === 'overview-admin-panel')).toBe(true);
  });

  it('keeps AI Runner section links when AI Runner is present', () => {
    const items = buildGlobalSearchItems();
    const sections = items.filter((item) => item.id.startsWith('section-ai-runner-'));

    expect(sections).toHaveLength(6);
    expect(sections.map((item) => item.label)).toEqual([
      'AI Runner > AutoFlow',
      'AI Runner > Saved Prompts',
      'AI Runner > Schedules',
      'AI Runner > History',
      'AI Runner > Logs',
      'AI Runner > Settings',
    ]);
  });

  it('returns high priority prefix matches ahead of lower priority prefix matches', () => {
    const items: CommandSearchItem[] = [
      {
        id: 'status',
        label: 'Status',
        href: '/status',
        group: 'Modules',
        priority: 1,
      },
      {
        id: 'status-overview',
        label: 'Status Overview',
        href: '/status',
        group: 'Modules',
        priority: 50,
      },
    ];

    expect(rankCommandSearchItems(items, 'status').map((item) => item.id)).toEqual([
      'status-overview',
      'status',
    ]);
  });

  it('matches query text stored in generated searchText from keywords', () => {
    const items: CommandSearchItem[] = [
      {
        id: 'jobs',
        label: 'Jobs',
        href: '/jobs',
        group: 'Modules',
        keywords: ['queue', 'rollback', 'retries'],
        priority: 10,
      },
      {
        id: 'alerts',
        label: 'Alerts',
        href: '/alerts',
        group: 'Modules',
        keywords: ['watch', 'notify'],
        priority: 5,
      },
    ];

    expect(rankCommandSearchItems(items, 'rollback')).toEqual([
      expect.objectContaining({ id: 'jobs' }),
    ]);
  });

  it('normalizes punctuation-heavy queries while matching subsequence fallback', () => {
    const results = rankCommandSearchItems(
      [
        {
          id: 'disk',
          label: 'Disk Queue',
          href: '/disk',
          group: 'Modules',
          priority: 1,
        },
        {
          id: 'network',
          label: 'Network',
          href: '/network',
          group: 'Modules',
          priority: 1,
        },
      ],
      'DI-SK!! Qu-e'
    );

    expect(results[0]).toMatchObject({ id: 'disk' });
  });

  it('normalizes unusual nav hrefs into stable search IDs', () => {
    const items = buildGlobalSearchItems([
      {
        label: 'System',
        items: [
          { label: 'Root', href: '/', icon: Cog },
          { label: 'Tools', href: '/tools/AI & Monitoring', icon: Cog },
        ],
      },
    ]);

    expect(items).toContainEqual(expect.objectContaining({ id: 'nav-home', href: '/', group: 'System' }));
    expect(items).toContainEqual(
      expect.objectContaining({ id: 'overview-home', href: '/', label: 'Root > Overview' })
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: 'nav-tools-ai-monitoring',
        href: '/tools/AI & Monitoring',
        label: 'Tools',
        group: 'System',
      })
    );
  });

  it('returns an empty list when there are no source items', () => {
    expect(rankCommandSearchItems([], 'dashboard')).toEqual([]);
  });

  it('matches compact label prefixes for abbreviated search terms', () => {
    const items: CommandSearchItem[] = [
      {
        id: 'ai-runner',
        label: 'AI Runner',
        href: '/ai-runner',
        group: 'Modules',
        priority: 1,
      },
      {
        id: 'alerts',
        label: 'Alert Center',
        href: '/alerts',
        group: 'Modules',
        priority: 1,
      },
    ];

    expect(rankCommandSearchItems(items, 'air')[0]).toMatchObject({ id: 'ai-runner' });
  });

  it('returns subsequence matches when no direct text match exists', () => {
    const items: CommandSearchItem[] = [
      {
        id: 'network',
        label: 'Network Throughput',
        href: '/network',
        group: 'Modules',
        priority: 1,
      },
      {
        id: 'memory',
        label: 'Memory Profile',
        href: '/memory',
        group: 'Modules',
        priority: 1,
      },
    ];

    expect(rankCommandSearchItems(items, 'ntw').map((item) => item.id)).toEqual(['network']);
  });

  it('enforces default limit when ranking many matches', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `item-${index}`,
      label: `Item ${index}`,
      href: `/item/${index}`,
      group: 'Modules',
      priority: index,
    }));

    const results = rankCommandSearchItems(items, '');

    expect(results).toHaveLength(8);
    expect(results.map((item) => item.id)).toEqual([
      'item-11',
      'item-10',
      'item-9',
      'item-8',
      'item-7',
      'item-6',
      'item-5',
      'item-4',
    ]);
  });
});
