import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionFilters } from './SessionFilters';

const renderFilters = () =>
  render(
    <SessionFilters
      search=""
      onSearchChange={vi.fn()}
      filterStatus="all"
      onStatusChange={vi.fn()}
      filterAgent="all"
      onAgentChange={vi.fn()}
      onRefresh={vi.fn()}
      refreshing={false}
    />
  );

describe('SessionFilters', () => {
  it('uses mobile-safe sizing for search and filter controls', () => {
    const { container } = renderFilters();

    const search = screen.getByPlaceholderText('Search agents, repos, users...');
    expect(search.className).toContain('h-11');
    expect(search.parentElement?.className).toContain('min-w-0');
    expect(search.parentElement?.className).toContain('basis-full');

    for (const select of screen.getAllByRole('combobox')) {
      expect(select.className).toContain('h-11');
    }

    const refresh = screen.getByRole('button', { name: /Refresh/i });
    expect(refresh.className).toContain('h-11');

    expect(container.firstElementChild?.className).toContain('items-stretch');
  });
});
