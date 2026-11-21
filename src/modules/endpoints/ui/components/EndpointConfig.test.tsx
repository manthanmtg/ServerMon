import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EndpointConfig } from './EndpointConfig';
import type { EndpointCreateRequest } from '../../types';

const baseForm: EndpointCreateRequest = {
  name: 'Demo endpoint',
  method: 'POST',
  endpointType: 'webhook',
  auth: 'public',
};

describe('EndpointConfig', () => {
  it('stacks execution strategy options on narrow viewports', () => {
    render(
      <EndpointConfig form={baseForm} onUpdateForm={vi.fn()} autoSlugRef={{ current: true }} />
    );

    const strategyGroup = screen.getByRole('button', { name: 'webhook' }).parentElement;

    expect(strategyGroup).toHaveClass('grid-cols-1');
    expect(strategyGroup).toHaveClass('sm:grid-cols-3');
    expect(strategyGroup?.className).not.toContain('grid-cols-3 ');
  });
});
