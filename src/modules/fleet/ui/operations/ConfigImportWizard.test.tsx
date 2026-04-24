import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { ConfigImportWizard } from './ConfigImportWizard';

describe('ConfigImportWizard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders textarea and kind selector', async () => {
    await act(async () => {
      render(<ConfigImportWizard />);
    });

    expect(screen.getByText('Raw config')).toBeDefined();
    expect(screen.getByLabelText('Kind')).toBeDefined();
  });

  it('submitting posts to /api/fleet/import', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        imported: { _id: 'i1', kind: 'frp', parsed: { foo: 'bar' } },
        conflicts: ['name-collision: rule-x'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<ConfigImportWizard />);
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/bind_port/), {
        target: { value: '[common]\nbind_port = 7000\n' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Import'));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === '/api/fleet/import' &&
            (init as { method?: string } | undefined)?.method === 'POST'
        )
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByText(/name-collision/)).toBeDefined();
    });
  });
});
