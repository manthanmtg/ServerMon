import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({
    children,
    title,
    subtitle,
    headerContent,
  }: {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    headerContent?: React.ReactNode;
  }) => (
    <div data-testid="pro-shell">
      <span data-testid="title">{title}</span>
      {subtitle && <span data-testid="subtitle">{subtitle}</span>}
      {headerContent && <div data-testid="header-content">{headerContent}</div>}
      {children}
    </div>
  ),
}));

vi.mock('@/modules/file-browser/ui/FileBrowserPage', () => ({
  default: () => <div data-testid="file-browser-page">FileBrowserPage</div>,
  FileBrowserHeaderShortcuts: () => (
    <div data-testid="file-browser-shortcuts">FileBrowserHeaderShortcuts</div>
  ),
}));

describe('File Browser page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<Page />);
    expect(screen.getByTestId('title').textContent).toBe('File Browser');
    expect(screen.getByTestId('subtitle').textContent).toBe('Secure Server Files');
  });

  it('renders FileBrowserPage inside ProShell', () => {
    render(<Page />);
    expect(screen.getByTestId('file-browser-page')).toBeDefined();
  });

  it('passes FileBrowserHeaderShortcuts as headerContent', () => {
    render(<Page />);
    expect(screen.getByTestId('header-content')).toBeDefined();
    expect(screen.getByTestId('file-browser-shortcuts')).toBeDefined();
  });
});
