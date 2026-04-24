import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import UsersWidget from './UsersWidget';

const mockOSUsers = [{ username: 'root' }, { username: 'user1' }];

const mockWebUsers = [
  { username: 'admin', role: 'admin' },
  { username: 'operator', role: 'user' },
  { username: 'admin2', role: 'admin' },
];

describe('UsersWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('type=os')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockOSUsers,
        });
      }
      if (url.includes('type=web')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockWebUsers,
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('fetches and displays user statistics components', async () => {
    await act(async () => {
      render(<UsersWidget />);
    });

    await waitFor(() => {
      expect(screen.getByText('Users & Access')).toBeDefined();
    });

    // Check counts
    // webCount: 3
    // osCount: 2
    // admins: 2
    expect(screen.getByText('3')).toBeDefined(); // Web Users

    // Use getAllByText for '2' since both OS users and Admins have count 2
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText('Active Admins')).toBeDefined();

    // The admin count is shown in a span with text-emerald-600
    const adminCount = screen.getByText('2', { selector: '.text-emerald-600' });
    expect(adminCount).toBeDefined();
  });

  it('handles fetch failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(<UsersWidget />);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch user stats');
    });

    // Initial stats should be 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);

    consoleSpy.mockRestore();
  });

  it('renders correctly even if responses are not ok', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: false }));

    await act(async () => {
      render(<UsersWidget />);
    });

    // Should still render the UI with 0 counts
    expect(screen.getByText('Users & Access')).toBeDefined();
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });
});
