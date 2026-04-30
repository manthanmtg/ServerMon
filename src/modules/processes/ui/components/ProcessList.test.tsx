import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProcessList } from './ProcessList';

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
});
