import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HealthWidget from './HealthWidget';

// Mock EventSource — must be a constructable function (not an arrow function)
const mockEventSource = {
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as (() => void) | null,
  close: vi.fn(),
};

const MockEventSource = vi.fn(function (this: unknown) {
  Object.assign(this as object, mockEventSource);
  return mockEventSource;
});

vi.stubGlobal('EventSource', MockEventSource);

describe('HealthWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSource.onmessage = null;
    mockEventSource.onerror = null;
    mockEventSource.close.mockClear();
  });

  it('renders CPU, Memory, and Disk labels', () => {
    render(<HealthWidget />);
    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('Memory')).toBeDefined();
    expect(screen.getByText('Disk')).toBeDefined();
  });

  it('renders initial 0% values', () => {
    render(<HealthWidget />);
    const percentages = screen.getAllByText('0.0%');
    expect(percentages.length).toBe(3);
  });

  it('updates CPU value from SSE message', async () => {
    render(<HealthWidget />);

    await act(async () => {
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(
          new MessageEvent('message', {
            data: JSON.stringify({ cpu: 45.5, memory: 62.3, disks: [{ use: 30.1 }] }),
          })
        );
      }
    });

    expect(screen.getByText('45.5%')).toBeDefined();
    expect(screen.getByText('62.3%')).toBeDefined();
    expect(screen.getByText('30.1%')).toBeDefined();
  });

  it('handles malformed SSE data gracefully', async () => {
    render(<HealthWidget />);
    await act(async () => {
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(new MessageEvent('message', { data: 'invalid json' }));
      }
    });
    // Should still show initial values
    const percentages = screen.getAllByText('0.0%');
    expect(percentages.length).toBe(3);
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = render(<HealthWidget />);
    unmount();
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('closes EventSource on SSE error', async () => {
    render(<HealthWidget />);
    await act(async () => {
      if (mockEventSource.onerror) {
        mockEventSource.onerror();
      }
    });
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it('connects to the metrics stream endpoint', () => {
    render(<HealthWidget />);
    expect(MockEventSource).toHaveBeenCalledWith('/api/metrics/stream');
  });

  it('renders directly from a provided metric without opening another stream', () => {
    render(
      <HealthWidget
        metric={{
          cpu: 72.4,
          memory: 51.2,
          disks: [{ use: 63.5 }] as never,
        }}
      />
    );

    expect(MockEventSource).not.toHaveBeenCalled();
    expect(screen.getByText('72.4%')).toBeDefined();
    expect(screen.getByText('51.2%')).toBeDefined();
    expect(screen.getByText('63.5%')).toBeDefined();
  });

  it('uses partial updates - only updates provided fields', async () => {
    render(<HealthWidget />);

    // First update: all fields
    await act(async () => {
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(
          new MessageEvent('message', {
            data: JSON.stringify({ cpu: 50, memory: 70 }),
          })
        );
      }
    });

    expect(screen.getByText('50.0%')).toBeDefined();
    expect(screen.getByText('70.0%')).toBeDefined();

    // Second update: only cpu
    await act(async () => {
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(
          new MessageEvent('message', {
            data: JSON.stringify({ cpu: 55 }),
          })
        );
      }
    });

    // Memory should remain at 70 since it wasn't updated
    expect(screen.getByText('55.0%')).toBeDefined();
    expect(screen.getByText('70.0%')).toBeDefined();
  });
});
