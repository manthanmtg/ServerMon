import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import CronsWidget from './CronsWidget';

const mockCronsSnapshot = {
  summary: { active: 5, total: 10, disabled: 5, userCrons: 3, systemCrons: 7 },
  crontabAvailable: true,
  source: 'crontab',
};

describe('CronsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(mockCronsSnapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch;
  });

  it('renders active crons count', async () => {
    await act(async () => {
      render(<CronsWidget />);
    });
    // Use data-testid if available or find by label then value
    await waitFor(() => screen.getByText('Active'));
    const summarySection = screen.getByText('Active').closest('div')!;
    expect(within(summarySection).getByText('5')).toBeDefined();
  });

  it('renders total crons count', async () => {
    await act(async () => {
      render(<CronsWidget />);
    });
    // The widget shows s.active, s.disabled etc. total is not directly in a text span with 'total'
    await waitFor(() => expect(screen.getByText('10 total')).toBeDefined());
  });

  it('shows loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<CronsWidget />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
