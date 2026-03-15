import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

const TestTrigger = () => {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ title: 'Test Toast', description: 'Test Description', variant: 'default' })}>
      Show Toast
    </button>
  );
};

describe('Toast Component', () => {
  it('renders toast when triggered', async () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    button.click();

    expect(await screen.findByText('Test Toast')).toBeDefined();
    expect(screen.getByText('Test Description')).toBeDefined();
  });

  it('removes toast after timeout', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    act(() => {
      button.click();
    });

    expect(screen.getByText('Test Toast')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Test Toast')).toBeNull();
    vi.useRealTimers();
  });
});
