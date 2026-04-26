import { describe, expect, it } from 'vitest';
import {
  buildGlobalSearchItems,
  rankCommandSearchItems,
  type CommandSearchItem,
} from './commandSearchUtils';

const sampleItems: CommandSearchItem[] = [
  {
    id: 'ai-runner',
    label: 'AI Runner',
    href: '/ai-runner',
    group: 'Modules',
    keywords: ['agent', 'schedule'],
  },
  {
    id: 'ai-runner-history',
    label: 'AI Runner > History',
    href: '/ai-runner?tab=history',
    group: 'AI Runner',
    keywords: ['runs', 'audit'],
  },
  {
    id: 'docker',
    label: 'Docker',
    href: '/docker',
    group: 'Modules',
    keywords: ['containers'],
  },
];

describe('commandSearch', () => {
  it('ranks exact module matches before nested module sections', () => {
    const results = rankCommandSearchItems(sampleItems, 'AI Runner');

    expect(results.map((item) => item.id).slice(0, 2)).toEqual(['ai-runner', 'ai-runner-history']);
  });

  it('keeps useful fuzzy matches when the query has a typo', () => {
    const results = rankCommandSearchItems(sampleItems, 'ai runer');

    expect(results[0]?.id).toBe('ai-runner');
    expect(results.some((item) => item.id === 'ai-runner-history')).toBe(true);
  });

  it('builds module overview and tab deep-link entries for AI Runner', () => {
    const items = buildGlobalSearchItems();

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'nav-ai-runner',
          label: 'AI Runner',
          href: '/ai-runner',
        }),
        expect.objectContaining({
          id: 'overview-ai-runner',
          label: 'AI Runner > Overview',
          href: '/ai-runner',
        }),
        expect.objectContaining({
          id: 'section-ai-runner-history',
          label: 'AI Runner > History',
          href: '/ai-runner?tab=history',
        }),
      ])
    );
  });
});
