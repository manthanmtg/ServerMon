import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { AutoscrollButton } from './AutoscrollButton';

describe('AutoscrollButton', () => {
  it('renders with ON label when enabled is true', () => {
    render(<AutoscrollButton enabled onToggle={vi.fn()} />);
    expect(screen.getByText(/ON/)).toBeDefined();
  });

  it('renders with OFF label when enabled is false', () => {
    render(<AutoscrollButton enabled={false} onToggle={vi.fn()} />);
    expect(screen.getByText(/OFF/)).toBeDefined();
  });

  it('calls onToggle with false when currently enabled and clicked', () => {
    const onToggle = vi.fn();
    render(<AutoscrollButton enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('calls onToggle with true when currently disabled and clicked', () => {
    const onToggle = vi.fn();
    render(<AutoscrollButton enabled={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('applies custom className', () => {
    render(<AutoscrollButton enabled onToggle={vi.fn()} className="my-custom-class" />);
    expect(screen.getByRole('button').className).toContain('my-custom-class');
  });

  it('applies enabled styles when enabled is true', () => {
    render(<AutoscrollButton enabled onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-blue-500/10');
  });

  it('applies disabled styles when enabled is false', () => {
    render(<AutoscrollButton enabled={false} onToggle={vi.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-muted/30');
  });

  it('forwards extra props to the button element', () => {
    render(<AutoscrollButton enabled onToggle={vi.fn()} aria-label="autoscroll-toggle" />);
    expect(screen.getByLabelText('autoscroll-toggle')).toBeDefined();
  });

  it('forwards ref to the button element', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<AutoscrollButton enabled onToggle={vi.fn()} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('has correct displayName', () => {
    expect(AutoscrollButton.displayName).toBe('AutoscrollButton');
  });
});
