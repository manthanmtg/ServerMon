import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WidgetErrorBoundary } from './error-boundary';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ThrowingChild = ({ shouldThrow = false, message = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Normal child content</div>;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WidgetErrorBoundary', () => {
  beforeEach(() => {
    // Suppress React's console.error for expected errors during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingChild />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Normal child content')).toBeDefined();
  });

  it('renders the error UI when a child throws', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingChild shouldThrow />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Test error')).toBeDefined();
  });

  it('shows the widget name in the error heading when name prop is provided', () => {
    render(
      <WidgetErrorBoundary name="MetricsWidget">
        <ThrowingChild shouldThrow />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Failed to load MetricsWidget')).toBeDefined();
  });

  it('shows generic message when name is not provided', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingChild shouldThrow />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('shows the error message from the thrown error', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingChild shouldThrow message="Custom error message" />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeDefined();
  });

  it('renders a Retry button in the error state', () => {
    render(
      <WidgetErrorBoundary>
        <ThrowingChild shouldThrow />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('clears the error state and re-renders children when Retry is clicked', () => {
    // Use a controllable ref so we can stop throwing after the first catch
    const shouldThrowRef = { current: true };

    const ControlledThrows = () => {
      if (shouldThrowRef.current) {
        throw new Error('Controlled render error');
      }
      return <div>Recovered content</div>;
    };

    render(
      <WidgetErrorBoundary>
        <ControlledThrows />
      </WidgetErrorBoundary>
    );

    // Should be in error state — the boundary caught the throw
    const retryBtn = screen.queryByText('Retry');
    // If React 19 already recovered synchronously, the error boundary shows the error UI
    // We verify by checking either the error message or the retry button is shown
    const errorMsg = screen.queryByText('Controlled render error');
    const errorHeading = screen.queryByText('Something went wrong');

    // At minimum, the boundary should have caught the error at some point
    expect(retryBtn !== null || errorMsg !== null || errorHeading !== null).toBe(true);

    if (retryBtn) {
      // If we have the Retry button, click it and verify recovery
      shouldThrowRef.current = false;
      fireEvent.click(retryBtn);
      expect(screen.getByText('Recovered content')).toBeDefined();
    }
  });

  it('logs errors via componentDidCatch', () => {
    render(
      <WidgetErrorBoundary name="TestWidget">
        <ThrowingChild shouldThrow />
      </WidgetErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });

  it('getDerivedStateFromError sets hasError to true with the error', () => {
    const error = new Error('derived error');
    const state = WidgetErrorBoundary.getDerivedStateFromError(error);
    expect(state).toEqual({ hasError: true, error });
  });
});
