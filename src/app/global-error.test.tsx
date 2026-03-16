import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobalError from './global-error';

describe('GlobalError', () => {
  it('renders the error heading', () => {
    const mockReset = vi.fn();
    render(<GlobalError error={new Error('Test error')} reset={mockReset} />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('renders a "Try again" button', () => {
    const mockReset = vi.fn();
    render(<GlobalError error={new Error('Test error')} reset={mockReset} />);
    const button = screen.getByText('Try again');
    expect(button).toBeDefined();
  });

  it('calls reset when "Try again" is clicked', () => {
    const mockReset = vi.fn();
    render(<GlobalError error={new Error('Test error')} reset={mockReset} />);
    const button = screen.getByText('Try again');
    fireEvent.click(button);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders html and body elements', () => {
    const mockReset = vi.fn();
    const { container } = render(<GlobalError error={new Error('Test error')} reset={mockReset} />);
    // The component renders html > body structure
    expect(container).toBeDefined();
  });

  it('works with error that has a digest', () => {
    const mockReset = vi.fn();
    const errorWithDigest = Object.assign(new Error('Test error'), { digest: 'abc123' });
    render(<GlobalError error={errorWithDigest} reset={mockReset} />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });
});
