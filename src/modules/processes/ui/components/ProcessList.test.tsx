import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProcessList } from './ProcessList';
import type { ProcessInfo } from '../types';

const processes: ProcessInfo[] = [
  {
    pid: 101,
    parentPid: 1,
    name: 'node',
    command: 'node server.js',
    path: '/usr/bin/node',
    user: 'root',
    state: 'running',
    cpu: 15.5,
    mem: 5.2,
    memRss: 1024 * 1024 * 256,
    started: new Date(Date.now() - 3600000).toISOString(),
    priority: 20,
  },
];

const baseProps = {
  sortField: 'cpu' as const,
  expandedPid: null,
  killingPid: null,
  onToggleSort: vi.fn(),
  onToggleExpanded: vi.fn(),
  onKillProcess: vi.fn(),
};

describe('ProcessList', () => {
  it('shows an empty state when no processes are available', () => {
    render(<ProcessList {...baseProps} processes={[]} />);

    expect(screen.getByText('No processes found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search or refresh the list.')).toBeInTheDocument();
  });

  it('keeps expanded mobile process actions touch-friendly', () => {
    const { container } = render(
      <ProcessList
        processes={processes}
        sortField="cpu"
        expandedPid={101}
        killingPid={null}
        onToggleSort={vi.fn()}
        onToggleExpanded={vi.fn()}
        onKillProcess={vi.fn()}
      />
    );

    const mobileList = container.querySelector('.sm\\:hidden');
    expect(mobileList).not.toBeNull();
    const mobileActionButtons = within(mobileList as HTMLElement).getAllByRole('button', {
      name: /Send SIG(?:TERM|KILL) to process node \(101\)/i,
    });

    for (const button of mobileActionButtons) {
      expect(button.className).toContain('min-h-11');
    }
  });
});
