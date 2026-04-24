import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RemoteProcessTable } from './RemoteProcessTable';

describe('RemoteProcessTable', () => {
  it('renders Phase 1 stub messaging', () => {
    render(<RemoteProcessTable nodeId="node-xyz" />);
    expect(screen.getByText('Remote processes')).toBeDefined();
    expect(screen.getByText(/Awaiting agent process protocol/)).toBeDefined();
    expect(screen.getByText(/node-xyz/)).toBeDefined();
  });
});
