import type { LucideIcon } from 'lucide-react';
import { footerNavItems, navGroups, type NavGroup, type NavItem } from './navigation';

export interface CommandSearchItem {
  id: string;
  label: string;
  href: string;
  group: string;
  icon?: LucideIcon;
  keywords?: string[];
  priority?: number;
}

interface ScoredSearchItem {
  item: CommandSearchItem;
  score: number;
}

const AI_RUNNER_SECTIONS = [
  ['autoflows', 'AutoFlow', ['flows', 'automation', 'jobs']],
  ['prompts', 'Saved Prompts', ['prompts', 'templates']],
  ['schedules', 'Schedules', ['calendar', 'cron', 'recurring']],
  ['history', 'History', ['runs', 'audit', 'executions']],
  ['logs', 'Logs', ['debug', 'stream']],
  ['settings', 'Settings', ['configuration', 'import', 'export']],
] as const;

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function idFromHref(prefix: string, href: string): string {
  const slug = href
    .replace(/[?#].*$/, '')
    .replace(/^\/|\/$/g, '')
    .replace(/[^a-z0-9]+/gi, '-');
  return `${prefix}-${slug || 'home'}`.toLowerCase();
}

function compact(value: string): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

function scoreSubsequence(candidate: string, query: string): number {
  if (!query) return 1;

  let candidateIndex = 0;
  let queryIndex = 0;
  let gaps = 0;
  let previousMatch = -1;

  while (candidateIndex < candidate.length && queryIndex < query.length) {
    if (candidate[candidateIndex] === query[queryIndex]) {
      if (previousMatch >= 0) gaps += candidateIndex - previousMatch - 1;
      previousMatch = candidateIndex;
      queryIndex += 1;
    }
    candidateIndex += 1;
  }

  if (queryIndex !== query.length) return 0;

  return Math.max(1200 - gaps * 12 - (candidate.length - query.length) * 2, 1);
}

function scoreCandidate(item: CommandSearchItem, rawQuery: string): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return item.priority ?? 0;

  const label = normalizeSearchText(item.label);
  const searchText = normalizeSearchText(
    [item.label, item.group, ...(item.keywords ?? [])].join(' ')
  );
  const queryCompact = compact(rawQuery);
  const labelCompact = compact(item.label);
  const searchCompact = compact(searchText);

  let score = 0;
  if (label === query) score = 10_000;
  else if (label.startsWith(query)) score = 9_000 - (label.length - query.length);
  else if (searchText.includes(query)) score = 7_000 - searchText.indexOf(query);
  else if (labelCompact.startsWith(queryCompact)) {
    score = 6_000 - (labelCompact.length - queryCompact.length);
  } else {
    score = Math.max(
      scoreSubsequence(labelCompact, queryCompact),
      scoreSubsequence(searchCompact, queryCompact) - 100
    );
  }

  if (score <= 0) return 0;
  return score + (item.priority ?? 0);
}

function flattenNavItems(groups: NavGroup[]): Array<{ group: string; item: NavItem }> {
  return groups.flatMap((group) => group.items.map((item) => ({ group: group.label, item })));
}

export function buildGlobalSearchItems(groups: NavGroup[] = navGroups): CommandSearchItem[] {
  const navItems = flattenNavItems(groups);
  const items: CommandSearchItem[] = navItems.map(({ group, item }) => ({
    id: idFromHref('nav', item.href),
    label: item.label,
    href: item.href,
    group,
    icon: item.icon,
    keywords: [group],
    priority: 100,
  }));

  for (const { group, item } of navItems) {
    if (item.href === '/dashboard') continue;
    items.push({
      id: idFromHref('overview', item.href),
      label: `${item.label} > Overview`,
      href: item.href,
      group: item.label,
      icon: item.icon,
      keywords: [group, item.label],
      priority: 60,
    });
  }

  const aiRunnerItem = navItems.find(({ item }) => item.href === '/ai-runner')?.item;
  if (aiRunnerItem) {
    for (const [tab, label, keywords] of AI_RUNNER_SECTIONS) {
      items.push({
        id: `section-ai-runner-${tab}`,
        label: `AI Runner > ${label}`,
        href: `/ai-runner?tab=${tab}`,
        group: 'AI Runner',
        icon: aiRunnerItem.icon,
        keywords: [...keywords],
        priority: 70,
      });
    }
  }

  for (const item of footerNavItems) {
    items.push({
      id: idFromHref('nav', item.href),
      label: item.label,
      href: item.href,
      group: 'System',
      icon: item.icon,
      keywords: ['system'],
      priority: 90,
    });
  }

  return items;
}

export function rankCommandSearchItems(
  items: CommandSearchItem[],
  query: string,
  limit = 8
): CommandSearchItem[] {
  return items
    .map((item): ScoredSearchItem => ({ item, score: scoreCandidate(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.item.label.localeCompare(right.item.label);
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
