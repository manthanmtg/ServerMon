import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppsSummaryCards } from './AppsSummaryCards';

describe('AppsSummaryCards', () => {
  it('renders app and operation totals in stable summary cards', () => {
    render(<AppsSummaryCards summary={{ total: 7, running: 4, failed: 2 }} activeOperations={3} />);

    expect(screen.getByText('Managed apps')).toBeTruthy();
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Active operations')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
