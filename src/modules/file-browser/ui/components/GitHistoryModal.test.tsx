import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import GitHistoryModal from './GitHistoryModal';

const mockToast = vi.fn();

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const commits = [
  {
    hash: 'abcdef1234567890',
    author: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    date: '2026-04-26T12:00:00.000Z',
    subject: 'Improve terminal rendering',
    body: 'Keep rendering stable.',
  },
  {
    hash: '1234567890abcdef',
    author: 'Grace Hopper',
    authorEmail: 'grace@example.com',
    date: '2026-04-25T12:00:00.000Z',
    subject: 'Document file browser shortcuts',
    body: 'Clarify navigation commands.',
  },
];

describe('GitHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.action === 'diff') {
        return {
          json: async () => ({ success: true, result: '+added line' }),
        } as Response;
      }

      return {
        json: async () => ({ success: true, result: commits }),
      } as Response;
    });
  });

  it('exposes modal controls with accessible names and keyboard-reachable actions', async () => {
    render(<GitHistoryModal root="/repo" onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Git Repository History' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Close git history' })).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Search git commits' })).toBeDefined();

    const commitButton = await screen.findByRole('button', {
      name: /view commit abcdef1: Improve terminal rendering/i,
    });
    fireEvent.click(commitButton);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Copy commit hash abcdef1234567890' })
      ).toBeDefined();
    });
  });

  it('filters commits with a normalized search query', async () => {
    render(<GitHistoryModal root="/repo" onClose={vi.fn()} />);

    await screen.findByRole('button', {
      name: /view commit abcdef1: Improve terminal rendering/i,
    });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search git commits' }), {
      target: { value: '  terminal  ' },
    });

    expect(
      screen.getByRole('button', { name: /view commit abcdef1: Improve terminal rendering/i })
    ).toBeDefined();
    expect(
      screen.queryByRole('button', {
        name: /view commit 1234567: Document file browser shortcuts/i,
      })
    ).toBeNull();
    expect(screen.getByText('Showing 1 commits')).toBeDefined();
  });
});
