import { describe, expect, it } from 'vitest';
import { getOperationStatusPresentation } from './operation-status';

describe('getOperationStatusPresentation', () => {
  it('marks running output as live and visible warning state', () => {
    expect(getOperationStatusPresentation('running')).toMatchObject({
      label: 'Running',
      live: true,
      variant: 'warning',
    });
  });

  it('maps terminal outcomes to non-live status presentations', () => {
    expect(getOperationStatusPresentation('succeeded')).toMatchObject({
      label: 'Succeeded',
      live: false,
      variant: 'success',
    });
    expect(getOperationStatusPresentation('failed')).toMatchObject({
      label: 'Failed',
      live: false,
      variant: 'destructive',
    });
    expect(getOperationStatusPresentation('canceled')).toMatchObject({
      label: 'Canceled',
      live: false,
      variant: 'secondary',
    });
  });
});
