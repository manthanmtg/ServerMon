import { render } from '@testing-library/react';
import { Skeleton } from './skeleton';
import { describe, it, expect } from 'vitest';

describe('Skeleton Component', () => {
  it('renders correctly', () => {
    const { container } = render(<Skeleton className="w-10 h-10" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('w-10');
    expect(skeleton.className).toContain('h-10');
  });

  it('applies default classes', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toContain('rounded-lg');
    expect(skeleton.className).toContain('bg-muted');
  });
});
