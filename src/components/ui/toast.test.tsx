import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

const TestTrigger = () => {
  const { toast } = useToast();
  return (
    <button
      onClick={() =>
        toast({ title: 'Test Toast', description: 'Test Description', variant: 'default' })
      }
    >
      Show Toast
    </button>
  );
};

const memoizedToastConsumerRender = vi.fn();

const MemoizedToastConsumer = React.memo(function MemoizedToastConsumer() {
  useToast();
  memoizedToastConsumerRender();
  return <div>Memoized toast consumer</div>;
});

describe('Toast Component', () => {
  it('renders toast when triggered', async () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    await act(async () => {
      button.click();
    });

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

  it('keeps the notification region inside narrow viewports', () => {
    render(
      <ToastProvider>
        <TestTrigger />
      </ToastProvider>
    );

    const region = screen.getByRole('region', { name: 'Notifications' });

    expect(region.className).toContain('left-4');
    expect(region.className).toContain('right-4');
    expect(region.className).toContain('w-auto');
    expect(region.className).toContain('sm:left-auto');
    expect(region.className).toContain('sm:w-full');
  });

  it('keeps the toast context value stable while notifications change', async () => {
    memoizedToastConsumerRender.mockClear();

    render(
      <ToastProvider>
        <TestTrigger />
        <MemoizedToastConsumer />
      </ToastProvider>
    );

    expect(memoizedToastConsumerRender).toHaveBeenCalledTimes(1);

    const button = screen.getByText('Show Toast');
    await act(async () => {
      button.click();
    });

    expect(await screen.findByText('Test Toast')).toBeDefined();
    expect(memoizedToastConsumerRender).toHaveBeenCalledTimes(1);
  });
});
