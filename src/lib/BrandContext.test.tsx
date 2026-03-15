import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrandProvider, useBrand } from './BrandContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BrandDisplay = () => {
  const { settings, updateSettings } = useBrand();
  return (
    <div>
      <span data-testid="page-title">{settings.pageTitle}</span>
      <span data-testid="logo">{settings.logoBase64}</span>
      <button
        onClick={() =>
          updateSettings({ pageTitle: 'MyServer', logoBase64: 'data:image/png;base64,abc' })
        }
      >
        Update
      </button>
      <button onClick={() => updateSettings({ pageTitle: 'Fail', logoBase64: '' })}>
        FailUpdate
      </button>
    </div>
  );
};

const BrandConsumerOutsideProvider = () => {
  useBrand();
  return null;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrandContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with default settings before fetch completes', async () => {
    // fetch never resolves during this test
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(
      <BrandProvider>
        <BrandDisplay />
      </BrandProvider>
    );

    expect(screen.getByTestId('page-title').textContent).toBe('ServerMon');
    expect(screen.getByTestId('logo').textContent).toBe('');
  });

  it('updates settings from a successful fetch', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pageTitle: 'Fetched Title', logoBase64: 'data:img' }),
    });

    await act(async () => {
      render(
        <BrandProvider>
          <BrandDisplay />
        </BrandProvider>
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('page-title').textContent).toBe('Fetched Title')
    );
    expect(screen.getByTestId('logo').textContent).toBe('data:img');
  });

  it('keeps defaults when fetch returns non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await act(async () => {
      render(
        <BrandProvider>
          <BrandDisplay />
        </BrandProvider>
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('page-title').textContent).toBe('ServerMon')
    );
  });

  it('keeps defaults when fetch throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      render(
        <BrandProvider>
          <BrandDisplay />
        </BrandProvider>
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('page-title').textContent).toBe('ServerMon')
    );
    errorSpy.mockRestore();
  });

  it('updateSettings posts and updates state on success', async () => {
    // Initial GET
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pageTitle: 'ServerMon', logoBase64: '' }) })
      // POST response
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await act(async () => {
      render(
        <BrandProvider>
          <BrandDisplay />
        </BrandProvider>
      );
    });

    await act(async () => {
      screen.getByText('Update').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('page-title').textContent).toBe('MyServer')
    );
    expect(screen.getByTestId('logo').textContent).toBe('data:image/png;base64,abc');

    // Verify POST was called
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/settings/branding',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updateSettings throws when POST fails', async () => {
    // Initial GET succeeds, POST fails
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pageTitle: 'ServerMon', logoBase64: '' }) })
      .mockResolvedValueOnce({ ok: false });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let caughtError: unknown = null;

    const CatchingComponent = () => {
      const { updateSettings } = useBrand();
      return (
        <button
          onClick={() =>
            updateSettings({ pageTitle: 'Fail', logoBase64: '' }).catch((err) => {
              caughtError = err;
            })
          }
        >
          FailUpdate
        </button>
      );
    };

    await act(async () => {
      render(
        <BrandProvider>
          <CatchingComponent />
        </BrandProvider>
      );
    });

    await act(async () => {
      screen.getByText('FailUpdate').click();
    });

    await waitFor(() => expect(caughtError).not.toBeNull());
    expect((caughtError as Error).message).toBe('Failed to update settings');

    errorSpy.mockRestore();
  });

  it('falls back to "ServerMon" if fetched pageTitle is empty', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pageTitle: '', logoBase64: '' }),
    });

    await act(async () => {
      render(
        <BrandProvider>
          <BrandDisplay />
        </BrandProvider>
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('page-title').textContent).toBe('ServerMon')
    );
  });

  it('throws when useBrand is used outside BrandProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BrandConsumerOutsideProvider />)).toThrow(
      'useBrand must be used within a BrandProvider'
    );
    spy.mockRestore();
  });
});
