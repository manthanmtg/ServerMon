import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EndpointLogs } from './EndpointLogs';
import type { EndpointExecutionLogDTO } from '../../types';

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    AlertCircle: () => <span data-testid="alert-icon" />,
    ArrowRightLeft: () => <span data-testid="arrow-icon" />,
    Braces: () => <span data-testid="braces-icon" />,
    Check: () => <span data-testid="check-icon" />,
    ChevronRight: () => <span data-testid="chevron-icon" />,
    Copy: () => <span data-testid="copy-icon" />,
    FileText: () => <span data-testid="file-icon" />,
    LoaderCircle: () => <span data-testid="loader-icon" />,
    Terminal: () => <span data-testid="terminal-icon" />,
  };
});

const logEntry: EndpointExecutionLogDTO = {
  _id: 'log-1',
  endpointId: 'endpoint-1',
  method: 'POST',
  statusCode: 200,
  duration: 42,
  requestBody: '{"hello":"in"}',
  responseBody: '{"hello":"out"}',
  stdout: 'standard output text',
  requestMeta: {
    ip: '127.0.0.1',
    userAgent: 'vitest',
  },
  triggeredBy: 'test',
  createdAt: new Date().toISOString(),
};

describe('EndpointLogs', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('copies ingress, egress, and standard output payloads independently', () => {
    render(<EndpointLogs logs={[logEntry]} logsLoading={false} isCreating={false} />);

    fireEvent.click(screen.getByRole('button', { name: /post interaction/i }));

    fireEvent.click(screen.getByRole('button', { name: /copy payload ingress/i }));
    expect(writeText).toHaveBeenLastCalledWith('{"hello":"in"}');

    fireEvent.click(screen.getByRole('button', { name: /copy payload egress/i }));
    expect(writeText).toHaveBeenLastCalledWith('{"hello":"out"}');

    fireEvent.click(screen.getByRole('button', { name: /copy standard output/i }));
    expect(writeText).toHaveBeenLastCalledWith('standard output text');
  });
});
