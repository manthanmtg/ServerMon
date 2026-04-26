import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<CommandSearch isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
