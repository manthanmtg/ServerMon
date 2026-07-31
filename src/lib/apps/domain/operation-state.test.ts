import { describe, expect, it } from 'vitest';
import {
  assertOperationStatusTransition,
  canTransitionOperationStatus,
  isActiveOperationStatus,
  isTerminalOperationStatus,
} from './operation-state';

describe('app operation state rules', () => {
  it('classifies queued, running, and cancel_requested as active statuses', () => {
    expect(isActiveOperationStatus('queued')).toBe(true);
    expect(isActiveOperationStatus('running')).toBe(true);
    expect(isActiveOperationStatus('cancel_requested')).toBe(true);
    expect(isActiveOperationStatus('succeeded')).toBe(false);
    expect(isActiveOperationStatus('failed')).toBe(false);
    expect(isActiveOperationStatus('cancelled')).toBe(false);
    expect(isActiveOperationStatus('unchanged')).toBe(false);
  });

  it('classifies succeeded, failed, cancelled, and unchanged as terminal statuses', () => {
    expect(isTerminalOperationStatus('queued')).toBe(false);
    expect(isTerminalOperationStatus('running')).toBe(false);
    expect(isTerminalOperationStatus('cancel_requested')).toBe(false);
    expect(isTerminalOperationStatus('succeeded')).toBe(true);
    expect(isTerminalOperationStatus('failed')).toBe(true);
    expect(isTerminalOperationStatus('cancelled')).toBe(true);
    expect(isTerminalOperationStatus('unchanged')).toBe(true);
  });

  it('allows queue, execution, cancellation, and terminal transitions', () => {
    expect(canTransitionOperationStatus('queued', 'running')).toBe(true);
    expect(canTransitionOperationStatus('queued', 'cancelled')).toBe(true);
    expect(canTransitionOperationStatus('running', 'cancel_requested')).toBe(true);
    expect(canTransitionOperationStatus('running', 'succeeded')).toBe(true);
    expect(canTransitionOperationStatus('running', 'failed')).toBe(true);
    expect(canTransitionOperationStatus('running', 'unchanged')).toBe(true);
    expect(canTransitionOperationStatus('cancel_requested', 'cancelled')).toBe(true);
    expect(canTransitionOperationStatus('cancel_requested', 'failed')).toBe(true);
  });

  it('rejects terminal status transitions and invalid backwards transitions', () => {
    expect(canTransitionOperationStatus('succeeded', 'running')).toBe(false);
    expect(canTransitionOperationStatus('failed', 'queued')).toBe(false);
    expect(canTransitionOperationStatus('cancelled', 'running')).toBe(false);
    expect(canTransitionOperationStatus('unchanged', 'running')).toBe(false);
    expect(canTransitionOperationStatus('running', 'queued')).toBe(false);

    expect(() => assertOperationStatusTransition('succeeded', 'running')).toThrow(
      'Terminal app operation status cannot transition from succeeded to running'
    );
  });
});
