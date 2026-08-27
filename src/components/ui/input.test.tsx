import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './input';
import { describe, it, expect, vi } from 'vitest';

describe('Input Component', () => {
  it('renders correctly', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeDefined();
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(handleChange).toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Hello');
  });

  it('is disabled when needed', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders with custom type', () => {
    render(<Input type="password" placeholder="Password" />);
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password');
  });

  it('applies custom className', () => {
    render(<Input className="custom-class" />);
    expect(screen.getByRole('textbox').className).toContain('custom-class');
  });

  it('exposes validation errors to assistive technology', () => {
    render(<Input label="Route name" error="Route name is required" />);

    const input = screen.getByRole('textbox', { name: 'Route name' });
    const error = screen.getByRole('alert');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(input).toHaveAccessibleDescription('Route name is required');
    expect(error).toHaveTextContent('Route name is required');
  });

  it('preserves existing descriptions when an error is present', () => {
    render(
      <>
        <p id="route-name-help">Use lowercase letters and hyphens.</p>
        <Input
          label="Route name"
          error="Route name is required"
          aria-describedby="route-name-help"
        />
      </>
    );

    expect(screen.getByRole('textbox', { name: 'Route name' })).toHaveAttribute(
      'aria-describedby',
      'route-name-help route-name-error'
    );
  });
});
