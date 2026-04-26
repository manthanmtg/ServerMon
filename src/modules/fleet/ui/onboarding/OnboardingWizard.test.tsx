import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Mock next/navigation: the wizard only uses router.push on completion,
// which never fires in these tests. A no-op mock keeps useRouter() from
// throwing the "app router not mounted" invariant in jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

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
    expect(screen.getByPlaceholderText('e.g. Home Server')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. home-server')).toBeDefined();
  });

  it('validates Identity step: shows error when slug is invalid', async () => {
    render(<OnboardingWizard hubUrl="hub.test" />);
    typeInto(screen.getByPlaceholderText('e.g. Home Server'), 'My Node');
    typeInto(screen.getByPlaceholderText('e.g. home-server'), 'BadSlug!');
    const next = screen.getByText(/^\s*Next\s*$/);
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
    typeInto(screen.getByPlaceholderText('e.g. Home Server'), 'My Node');
    typeInto(screen.getByPlaceholderText('e.g. home-server'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 2 (DNS step, non-blocking)
    await waitFor(() => {
      expect(screen.getByText(/DNS Requirement/i)).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 3 (FRPC + proxy rules)
    await waitFor(() => {
      expect(screen.getByText('Proxy Rules')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 4 (TOML review)
    await waitFor(() => {
      expect(screen.getByText(/Review the generated FRP configuration/i)).toBeDefined();
    });

    // Click Next -> POST to /api/fleet/nodes
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
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

    typeInto(screen.getByPlaceholderText('e.g. Home Server'), 'My Node');
    typeInto(screen.getByPlaceholderText('e.g. home-server'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 2
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 3
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 4 -> click Next which triggers the POST
    await waitFor(() => {
      expect(screen.getByText(/Review the generated FRP configuration/i)).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeDefined();
    });
  });

  it('reaches step 6 Verify after install step is acknowledged', async () => {
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
    typeInto(screen.getByPlaceholderText('e.g. Home Server'), 'My Node');
    typeInto(screen.getByPlaceholderText('e.g. home-server'), 'my-node');
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });
    // Step 2
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });
    // Step 3
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });
    // Step 4 create
    await waitFor(() => {
      expect(screen.getByText(/Review the generated FRP configuration/i)).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/^\s*Next\s*$/));
    });

    // Step 5 installer
    await waitFor(() => {
      expect(screen.getByText(/Run this on the target machine/i)).toBeDefined();
    });

    // Move to step 6 via the "I've run the command" button
    await act(async () => {
      fireEvent.click(screen.getByText(/I've run the command/i));
    });

    await waitFor(() => {
      expect(screen.getByText(/Waiting for the agent to connect/i)).toBeDefined();
    });
  });
});
