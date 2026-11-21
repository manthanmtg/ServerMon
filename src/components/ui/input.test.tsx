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

  it('uses a 44px minimum touch target on mobile while preserving compact desktop inputs', () => {
    render(<Input />);

    const input = screen.getByRole('textbox');
    expect(input.className).toContain('min-h-11');
    expect(input.className).toContain('sm:min-h-0');
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

    const input = screen.getByRole('textbox', { name: 'Route name' });
    const error = screen.getByRole('alert');

    expect(input).toHaveAttribute('aria-describedby', `route-name-help ${error.id}`);
  });

  it('assigns unique label and error associations to inputs with the same label', () => {
    render(
      <>
        <Input label="Shortcut" error="First shortcut is required" />
        <Input label="Shortcut" error="Second shortcut is required" />
      </>
    );

    const [firstInput, secondInput] = screen.getAllByRole('textbox');
    const [firstError, secondError] = screen.getAllByRole('alert');

    expect(firstInput.id).not.toBe(secondInput.id);
    expect(firstError.id).not.toBe(secondError.id);
    expect(firstInput).toHaveAttribute('aria-describedby', firstError.id);
    expect(secondInput).toHaveAttribute('aria-describedby', secondError.id);
  });
});
