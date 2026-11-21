/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppsSettingsModal from './AppsSettingsModal';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

const baseSettings = { releaseRetention: 10 };

describe('AppsSettingsModal', () => {
  it('renders the current retention value', () => {
    render(<AppsSettingsModal settings={baseSettings} onClose={vi.fn()} onSaved={vi.fn()} />);

    const input = screen.getByLabelText(/^Keep last releases per app/) as HTMLInputElement;
    expect(input.value).toBe('10');
  });

  it('disables saving while the value is unchanged or invalid', () => {
    render(<AppsSettingsModal settings={baseSettings} onClose={vi.fn()} onSaved={vi.fn()} />);

    const save = screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    const input = screen.getByLabelText(/^Keep last releases per app/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(save.disabled).toBe(true);

    fireEvent.change(input, { target: { value: '12' } });
    expect(save.disabled).toBe(false);
  });

  it('saves a valid retention and closes the dialog', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings: { releaseRetention: 5 } }),
    });

    render(<AppsSettingsModal settings={baseSettings} onClose={onClose} onSaved={onSaved} />);

    const input = screen.getByLabelText(/^Keep last releases per app/);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ releaseRetention: 5 }));
    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/modules/apps/settings',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('surfaces save failures without closing', async () => {
    const onSaved = vi.fn();
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Failed to update settings' }),
    });

    render(<AppsSettingsModal settings={baseSettings} onClose={vi.fn()} onSaved={onSaved} />);

    const input = screen.getByLabelText(/^Keep last releases per app/);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to update settings')
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});
