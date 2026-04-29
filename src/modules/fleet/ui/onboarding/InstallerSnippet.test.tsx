import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { InstallerSnippet } from './InstallerSnippet';

describe('InstallerSnippet', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the linux tab by default with the install-script snippet', () => {
    const { container } = render(
      <InstallerSnippet token="tok-1" nodeId="node-1" hubUrl="hub.test" />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('/api/fleet/public/install-script');
    expect(text).toContain("--token 'tok-1'");
    expect(text).toContain("--node-id 'node-1'");
    expect(text).toContain("--hub-url 'hub.test'");
  });

  it('switches to Docker tab and shows docker run command', () => {
    const { container } = render(
      <InstallerSnippet token="tok-1" nodeId="node-1" hubUrl="hub.test" />
    );
    const dockerTab = screen.getByText('Docker');
    act(() => {
      fireEvent.click(dockerTab);
    });
    const text = container.textContent ?? '';
    expect(text).toContain('docker run');
    expect(text).toContain("FLEET_HUB_URL='hub.test'");
    expect(text).toContain("FLEET_PAIRING_TOKEN='tok-1'");
    expect(text).toContain("FLEET_NODE_ID='node-1'");
    expect(text).toContain('servermon/agent:latest');
  });

  it('switches to macOS tab and shows --platform macos flag', () => {
    const { container } = render(
      <InstallerSnippet token="tok-1" nodeId="node-1" hubUrl="hub.test" />
    );
    const macTab = screen.getByText('macOS');
    act(() => {
      fireEvent.click(macTab);
    });
    const text = container.textContent ?? '';
    expect(text).toContain('--platform macos');
  });

  it('copy button invokes navigator.clipboard.writeText with the snippet', async () => {
    render(<InstallerSnippet token="tok-1" nodeId="node-1" hubUrl="hub.test" />);
    const copyBtn = screen.getByLabelText('Copy install command');
    await act(async () => {
      fireEvent.click(copyBtn);
    });
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const arg = writeText.mock.calls[0][0] as string;
    expect(arg).toContain('/api/fleet/public/install-script');
    expect(arg).toContain("--token 'tok-1'");
  });

  it('shows release/source install controls and updates the generated command', () => {
    const { container } = render(
      <InstallerSnippet token="tok-1" nodeId="node-1" hubUrl="hub.test" />
    );

    expect(screen.getByLabelText('Install source')).toBeDefined();
    expect(screen.getByText('Latest release artifact')).toBeDefined();
    expect(screen.getByText('Pinned release artifact')).toBeDefined();
    expect(screen.getByText('Build from source')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Install source'), {
      target: { value: 'version' },
    });
    fireEvent.change(screen.getByLabelText('Release version'), {
      target: { value: 'v0.1.1' },
    });
    expect(container.textContent ?? '').toContain('--version v0.1.1');

    fireEvent.change(screen.getByLabelText('Install source'), {
      target: { value: 'source' },
    });
    expect(container.textContent ?? '').toContain("--build-from-source --source-ref 'main'");
  });
});
