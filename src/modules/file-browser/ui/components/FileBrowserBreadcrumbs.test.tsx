import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FileBrowserBreadcrumbs } from './FileBrowserBreadcrumbs';

describe('FileBrowserBreadcrumbs', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeSegments = (paths: string[]) =>
    paths.map((p) => ({ label: p.split('/').at(-1) || p, path: p }));

  it('renders all segments when 3 or fewer', () => {
    const segments = makeSegments(['/root', '/root/home', '/root/home/docs']);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    expect(screen.getByText('home')).toBeDefined();
    expect(screen.getByText('docs')).toBeDefined();
  });

  it('calls onNavigate when a segment is clicked', () => {
    const segments = makeSegments(['/root', '/root/home', '/root/home/docs']);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTitle('home'));
    expect(onNavigate).toHaveBeenCalledWith('/root/home');
  });

  it('collapses middle segments when more than 3', () => {
    const segments = makeSegments([
      '/root',
      '/root/a',
      '/root/a/b',
      '/root/a/b/c',
      '/root/a/b/c/d',
    ]);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    // Should show ellipsis
    expect(screen.getByText('…')).toBeDefined();
  });

  it('calls onNavigate for first segment when collapsed', () => {
    const segments = makeSegments([
      '/root',
      '/root/a',
      '/root/a/b',
      '/root/a/b/c',
      '/root/a/b/c/d',
    ]);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    // Click the first segment (home icon button)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onNavigate).toHaveBeenCalledWith('/root');
  });

  it('navigates to second-to-last segment when collapsed', () => {
    const segments = makeSegments([
      '/root',
      '/root/a',
      '/root/a/b',
      '/root/a/b/c',
      '/root/a/b/c/d',
    ]);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTitle('c'));
    expect(onNavigate).toHaveBeenCalledWith('/root/a/b/c');
  });

  it('navigates to last segment when collapsed', () => {
    const segments = makeSegments([
      '/root',
      '/root/a',
      '/root/a/b',
      '/root/a/b/c',
      '/root/a/b/c/d',
    ]);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTitle('d'));
    expect(onNavigate).toHaveBeenCalledWith('/root/a/b/c/d');
  });

  it('renders single segment', () => {
    const segments = makeSegments(['/root']);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    expect(screen.getByText('root')).toBeDefined();
  });

  it('renders exactly 3 segments without collapsing', () => {
    const segments = makeSegments(['/root', '/root/a', '/root/a/b']);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    expect(screen.queryByText('…')).toBeNull();
  });

  it('renders 4 segments with ellipsis', () => {
    const segments = makeSegments(['/root', '/root/a', '/root/a/b', '/root/a/b/c']);
    render(<FileBrowserBreadcrumbs segments={segments} onNavigate={onNavigate} />);
    expect(screen.getByText('…')).toBeDefined();
  });
});
