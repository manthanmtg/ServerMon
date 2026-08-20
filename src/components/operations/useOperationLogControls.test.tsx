import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOperationLogControls } from './useOperationLogControls';

describe('useOperationLogControls', () => {
  it('preserves choices for one operation and resets for a different operation', () => {
    const { result, rerender } = renderHook(
      ({ operationId }) => useOperationLogControls(operationId),
      { initialProps: { operationId: 'op-1' } }
    );

    act(() => {
      result.current.setFollow(false);
      result.current.setAutoscroll(false);
      result.current.setWrap(false);
    });
    rerender({ operationId: 'op-1' });
    expect(result.current).toMatchObject({ follow: false, autoscroll: false, wrap: false });

    rerender({ operationId: 'op-2' });
    expect(result.current).toMatchObject({ follow: true, autoscroll: true, wrap: true });
  });
});
