import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleBuilder } from './ScheduleBuilder';

describe('ScheduleBuilder', () => {
  it('stacks cron fields into one column before the small breakpoint', () => {
    render(
      <ScheduleBuilder
        minute="0"
        hour="*"
        dayOfMonth="*"
        month="*"
        dayOfWeek="*"
        onChange={vi.fn()}
      />
    );

    const fieldsGrid = screen.getByLabelText('Minute').closest('div');

    expect(fieldsGrid).toHaveClass('grid-cols-1');
    expect(fieldsGrid).toHaveClass('sm:grid-cols-5');
  });
});
