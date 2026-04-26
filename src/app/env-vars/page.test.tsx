import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnvVarsRoute from './page';

vi.mock('@/modules/env-vars/ui/EnvVarsPage', () => ({
  default: () => <div data-testid="env-vars-page">EnvVarsPage</div>,
}));

describe('EnvVars page route', () => {
  it('renders the EnvVars page', () => {
    render(<EnvVarsRoute />);

    expect(screen.getByTestId('env-vars-page')).toBeTruthy();
  });
});
