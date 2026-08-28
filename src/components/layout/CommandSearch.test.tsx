import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommandSearch from './CommandSearch';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('CommandSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the search input when opened', () => {
    render(<CommandSearch isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('combobox')).toBe(document.activeElement);
  });

  it('filters module and subview results with fuzzy typos', () => {
    render(<CommandSearch isOpen={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ai runer' } });

    expect(screen.getAllByText('AI Runner').length).toBeGreaterThan(0);
    expect(screen.getByText('AI Runner > History')).toBeDefined();
  });

  it('navigates to the selected deep link with the keyboard', () => {
    const onClose = vi.fn();
    render(<CommandSearch isOpen={true} onClose={onClose} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ai runner history' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    expect(mockPush).toHaveBeenCalledWith('/ai-runner?tab=history');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<CommandSearch isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isolates the page and restores the trigger after closing', () => {
    function SearchHarness() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <main data-testid="search-page">
          <button type="button" onClick={() => setIsOpen(true)}>
            Open search
          </button>
          <CommandSearch isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </main>
      );
    }

    render(<SearchHarness />);

    const trigger = screen.getByRole('button', { name: 'Open search' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByTestId('search-page').closest('[inert]')).not.toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Close search' })[1]!);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });
});
