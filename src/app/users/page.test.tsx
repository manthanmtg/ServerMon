import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from './page';

vi.mock('@/modules/users/ui/UsersPage', () => ({
  default: () => <div data-testid="users-page">UsersPage</div>,
}));

describe('Users page route', () => {
  it('renders the UsersPage component', () => {
    render(<Page />);
    expect(screen.getByTestId('users-page')).toBeDefined();
  });

  it('renders without ProShell wrapper', () => {
    const { container } = render(<Page />);
    // UsersPage is rendered directly without a ProShell wrapper
    expect(container.querySelector('[data-testid="pro-shell"]')).toBeNull();
  });
});
