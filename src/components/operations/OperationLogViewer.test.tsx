import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationLogViewer } from './OperationLogViewer';

describe('OperationLogViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows independent follow and autoscroll controls only while live', () => {
    const onFollowChange = vi.fn();
    const onAutoscrollChange = vi.fn();
    const { rerender } = render(
      <OperationLogViewer
        output="line one"
        status="running"
        label="Deployment output"
        follow
        onFollowChange={onFollowChange}
        autoscroll
        onAutoscrollChange={onAutoscrollChange}
      />
    );

    const follow = screen.getByRole('button', { name: 'Follow live output' });
    const autoscroll = screen.getByRole('button', { name: 'Autoscroll output' });
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(autoscroll).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(follow);
    fireEvent.click(autoscroll);
    expect(onFollowChange).toHaveBeenCalledWith(false);
    expect(onAutoscrollChange).toHaveBeenCalledWith(false);

    rerender(<OperationLogViewer output="done" status="succeeded" label="Deployment output" />);
    expect(screen.queryByRole('button', { name: 'Follow live output' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Autoscroll output' })).toBeNull();
  });

  it('scrolls only when live autoscroll is enabled', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = render(
      <OperationLogViewer output={['one']} status="running" label="Run output" autoscroll />
    );
    expect(scrollIntoView).toHaveBeenCalled();
    scrollIntoView.mockClear();

    rerender(
      <OperationLogViewer
        output={['one', 'two']}
        status="running"
        label="Run output"
        autoscroll={false}
      />
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('toggles wrapping and opens full screen', () => {
    const onWrapChange = vi.fn();
    const onRequestFullscreen = vi.fn();
    render(
      <OperationLogViewer
        output="a very long line"
        status="failed"
        label="Run output"
        wrap={false}
        onWrapChange={onWrapChange}
        onRequestFullscreen={onRequestFullscreen}
      />
    );
    expect(screen.getByRole('log', { name: 'Run output' })).toHaveClass('whitespace-pre');
    fireEvent.click(screen.getByRole('button', { name: 'Wrap output' }));
    expect(onWrapChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open logs full screen' }));
    expect(onRequestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('copies the exact normalized output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <OperationLogViewer
        output={['first line', 'second line']}
        status="succeeded"
        label="Run output"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
    expect(writeText).toHaveBeenCalledWith('first line\nsecond line');
  });

  it('downloads the exact output with the requested filename', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:logs');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(
      <OperationLogViewer
        output="download me"
        status="succeeded"
        label="Run output"
        downloadableFilename="run-42.log"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download logs' }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:logs');
  });

  it('renders an explicit error and empty message without announcing every line', () => {
    render(
      <OperationLogViewer
        output=""
        status="running"
        label="Install output"
        error="Connection interrupted"
        emptyMessage="Waiting for output…"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByRole('log', { name: 'Install output' })).toHaveAttribute('aria-live', 'off');
    expect(screen.getByText('Waiting for output…')).toBeVisible();
  });
});
