import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './button';
import { createRef } from 'react';

describe('Button component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('applies default variant and size styles', () => {
    render(<Button>Default</Button>);
    const button = screen.getByRole('button', { name: /default/i });
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('h-9');
  });

  it('applies custom className correctly', () => {
    render(<Button className="custom-test-class">Custom Class</Button>);
    const button = screen.getByRole('button', { name: /custom class/i });
    expect(button.className).toContain('custom-test-class');
  });

  it('renders different variants correctly', () => {
    const { rerender } = render(<Button variant="destructive">Destructive</Button>);
    let button = screen.getByRole('button', { name: /destructive/i });
    expect(button.className).toContain('bg-destructive');

    rerender(<Button variant="outline">Outline</Button>);
    button = screen.getByRole('button', { name: /outline/i });
    expect(button.className).toContain('border-border');

    rerender(<Button variant="ghost">Ghost</Button>);
    button = screen.getByRole('button', { name: /ghost/i });
    expect(button.className).toContain('hover:bg-accent');
  });

  it('renders different sizes correctly', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    let button = screen.getByRole('button', { name: /small/i });
    expect(button.className).toContain('h-8');
    expect(button.className).toContain('px-3');

    rerender(<Button size="lg">Large</Button>);
    button = screen.getByRole('button', { name: /large/i });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('px-6');
  });

  it('handles standard HTML button props', () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} type="submit" aria-label="Submit Form">
        Submit
      </Button>
    );
    const button = screen.getByRole('button', { name: /submit form/i });
    expect(button).toHaveAttribute('type', 'submit');

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button when disabled prop is true', () => {
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Disabled Button
      </Button>
    );
    const button = screen.getByRole('button', { name: /disabled button/i });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders a loading spinner when loading is true', () => {
    render(<Button loading>Loading Button</Button>);
    const button = screen.getByRole('button', { name: /loading button/i });

    // Spinner element checking
    const spinner = button.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('disables the button when loading is true', () => {
    const handleClick = vi.fn();
    render(
      <Button loading onClick={handleClick}>
        Loading Disabled
      </Button>
    );
    const button = screen.getByRole('button', { name: /loading disabled/i });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders children alongside loading spinner', () => {
    render(<Button loading>Saving...</Button>);
    const button = screen.getByRole('button', { name: /saving\.\.\./i });

    expect(button.textContent).toContain('Saving...');
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref Button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('Ref Button');
  });
});
