import { render } from '@testing-library/react';
import { Spinner } from './spinner';
import { describe, it, expect } from 'vitest';

describe('Spinner Component', () => {
  it('renders correctly', () => {
    const { container } = render(<Spinner />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeDefined();
  });

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom-spinner" />);
    const spinner = container.querySelector('.custom-spinner');
    expect(spinner).toBeDefined();
  });
});
