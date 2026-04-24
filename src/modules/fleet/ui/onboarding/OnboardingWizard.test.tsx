import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';

function typeInto(el: HTMLElement, value: string) {
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
}

describe('OnboardingWizard', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the Identity step first', () => {
    render(<OnboardingWizard hubUrl="hub.test" />);
    expect(screen.getByText('Onboard an Agent')).toBeDefined();
    expect(screen.getByPlaceholderText('Home Desktop')).toBeDefined();
    expect(screen.getByPlaceholderText('orion')).toBeDefined();
  });

  it('validates Identity step: shows error when slug is invalid', async () => {
    render(<OnboardingWizard hubUrl="hub.test" />);
    typeInto(screen.getByPlaceholderText('Home Desktop'), 'My Node');
    typeInto(screen.getByPlaceholderText('orion'), 'BadSlug!');
    const next = screen.getByText('Next');
    await act(async () => {
      fireEvent.click(next);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
  });

  it('advances step 1 -> 2 -> 3 -> 4 -> step 5 after create POST succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        node: { _id: 'node-123', slug: 'my-node' },
        pairingToken: 'tok-abc-xyz',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OnboardingWizard hubUrl="hub.test" />);

    // Step 1
    typeInto(screen.getByPlaceholderText('Home Desktop'), 'My Node');
    typeInto(screen.getByPlaceholderText('orion'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 2 (DNS step, non-blocking)
    await waitFor(() => {
      expect(screen.getByText(/Verify DNS and TLS/i)).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 3 (FRPC + proxy rules)
    await waitFor(() => {
      expect(screen.getByText('FRPC Transport')).toBeDefined();
    });
    expect(screen.getByText('Proxy Rules')).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 4 (TOML review + Create agent button)
    await waitFor(() => {
      expect(screen.getByText(/Preview the generated frpc.toml/i)).toBeDefined();
    });
    expect(screen.getByText('Create agent')).toBeDefined();

    // Click Create agent -> POST to /api/fleet/nodes
    await act(async () => {
      fireEvent.click(screen.getByText('Create agent'));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/fleet/nodes',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Step 5: Installer snippet visible
    await waitFor(() => {
      expect(screen.getByText(/Run this on the target machine/i)).toBeDefined();
    });
    expect(screen.getByText('Linux (systemd)')).toBeDefined();
  });

  it('shows an error when create POST fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Slug already taken' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OnboardingWizard hubUrl="hub.test" />);

    typeInto(screen.getByPlaceholderText('Home Desktop'), 'My Node');
    typeInto(screen.getByPlaceholderText('orion'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 2
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 3
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Step 4
    await waitFor(() => {
      expect(screen.getByText('Create agent')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create agent'));
    });

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeDefined();
    });
  });

  it('reaches step 6 Verify and renders an Open node link to the slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        node: { _id: 'node-123', slug: 'my-node' },
        pairingToken: 'tok-abc',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OnboardingWizard hubUrl="hub.test" />);

    // Step 1
    typeInto(screen.getByPlaceholderText('Home Desktop'), 'My Node');
    typeInto(screen.getByPlaceholderText('orion'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 2
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 3
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    // Step 4 create
    await waitFor(() => {
      expect(screen.getByText('Create agent')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create agent'));
    });

    // Step 5 installer
    await waitFor(() => {
      expect(screen.getByText(/Run this on the target machine/i)).toBeDefined();
    });

    // Move to step 6
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Waiting for the agent to connect/i)).toBeDefined();
    });

    const openLink = screen.getByText('Open node');
    expect(openLink.getAttribute('href')).toBe('/fleet/my-node');
  });
});
