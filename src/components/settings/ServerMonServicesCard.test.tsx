import { describe, expect, it } from 'vitest';
import { deriveScheduleSelectState } from './ServerMonServicesCard';

describe('deriveScheduleSelectState', () => {
  it('keeps custom schedule values available in the select options', () => {
    const state = deriveScheduleSelectState('23:07', 'Etc/UTC', 'America/Phoenix');

    expect(state.scheduleTimeParts).toEqual({
      hour: '11',
      minute: '07',
      period: 'PM',
    });
    expect(state.minuteOptions).toContain('07');
    expect(state.timezoneOptions.map((option) => option.value)).toEqual(
      expect.arrayContaining(['Etc/UTC', 'America/Phoenix'])
    );
  });
});
