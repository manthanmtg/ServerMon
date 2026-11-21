import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppsCollectionToolbar } from './AppsCollectionToolbar';

describe('AppsCollectionToolbar', () => {
  it('exposes search, status filtering, and a labelled view toggle', () => {
    const onQueryChange = vi.fn();
    const onFilterChange = vi.fn();
    const onViewChange = vi.fn();
    render(
      <AppsCollectionToolbar
        query=""
        filter="all"
        view="grid"
        resultCount={1}
        totalCount={2}
        onQueryChange={onQueryChange}
        onFilterChange={onFilterChange}
        onViewChange={onViewChange}
      />
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps' }), {
      target: { value: 'solar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(onQueryChange).toHaveBeenCalledWith('solar');
    expect(onFilterChange).toHaveBeenCalledWith('attention');
    expect(onViewChange).toHaveBeenCalledWith('list');
    expect(screen.getByText('1 of 2 apps')).toBeTruthy();
  });
});
