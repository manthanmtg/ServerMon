import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileBrowserTreePanel, type FileBrowserTreeNode } from './FileBrowserTreePanel';

const tree: FileBrowserTreeNode[] = [
  {
    name: 'root',
    path: '/',
    hasChildren: true,
    isDirectory: true,
    children: [
      {
        name: 'etc',
        path: '/etc',
        hasChildren: false,
        isDirectory: true,
      },
      {
        name: 'README.md',
        path: '/README.md',
        hasChildren: false,
        isDirectory: false,
      },
    ],
  },
];

describe('FileBrowserTreePanel', () => {
  it('selects directory nodes and closes mobile tree overlays', () => {
    const onSelectDirectory = vi.fn();
    const onClose = vi.fn();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });

    render(
      <FileBrowserTreePanel
        tree={tree}
        currentPath="/"
        expandedPaths={new Set(['/'])}
        loadingPaths={new Set()}
        width={288}
        onTogglePath={vi.fn()}
        onSelectDirectory={onSelectDirectory}
        onSelectFile={vi.fn()}
        onCreateDirectory={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTitle('/etc'));

    expect(onSelectDirectory).toHaveBeenCalledWith('/etc');
    expect(onClose).toHaveBeenCalled();
  });

  it('delegates file node selection without treating it as a directory', () => {
    const onSelectFile = vi.fn();

    render(
      <FileBrowserTreePanel
        tree={tree}
        currentPath="/"
        expandedPaths={new Set(['/'])}
        loadingPaths={new Set()}
        width={288}
        onTogglePath={vi.fn()}
        onSelectDirectory={vi.fn()}
        onSelectFile={onSelectFile}
        onCreateDirectory={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('/README.md'));

    expect(onSelectFile).toHaveBeenCalledWith('/README.md');
  });
});
