import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CapacityAnalysis } from './CapacityAnalysis';

const settings = { unitSystem: 'decimal' as const };
const scan = { id: 'scan-id', rootPath: '/var', status: 'scanning' };
const folder = {
  name: 'cache',
  path: '/var/cache',
  kind: 'directory',
  size: 2048,
  readError: false,
  canDelete: false,
};
const file = {
  name: 'cache.txt',
  path: '/var/cache/cache.txt',
  kind: 'file',
  size: 2048,
  readError: false,
  canDelete: true,
};

function reply(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body)));
}

function listing(path: string, entries: Array<typeof folder>) {
  return {
    ...scan,
    status: 'ready',
    listing: { path, size: 2048, partial: false, entries, offset: 0, nextOffset: null },
  };
}

describe('CapacityAnalysis', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows an initial state and an accessible scan path field', () => {
    render(<CapacityAnalysis settings={settings} />);
    expect(screen.getByText('Ready for Analysis')).toBeInTheDocument();
    expect(screen.getByLabelText('Scan directory')).toHaveValue('/');
  });

  it('browses into a folder without starting a second scan', async () => {
    fetchMock
      .mockImplementationOnce(() => reply(scan))
      .mockImplementationOnce(() => reply(listing('/var', [folder])))
      .mockImplementationOnce(() => reply(listing('/var/cache', [file])));

    render(<CapacityAnalysis settings={settings} />);
    fireEvent.change(screen.getByLabelText('Scan directory'), { target: { value: '/var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cache' }));

    expect(await screen.findByText('cache.txt')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      new URL(fetchMock.mock.calls[2][0], 'http://localhost').searchParams.get('directory')
    ).toBe('/var/cache');
  });

  it('prepares the live entry and waits for confirmation before deleting', async () => {
    fetchMock
      .mockImplementationOnce(() => reply(scan))
      .mockImplementationOnce(() => reply(listing('/var/cache', [file])))
      .mockImplementationOnce(() => reply({ token: 'delete-token', size: 4096, modifiedAt: 100 }))
      .mockImplementationOnce(() => reply({ success: true }))
      .mockImplementationOnce(() => reply(scan))
      .mockImplementationOnce(() => reply(listing('/var/cache', [])));

    render(<CapacityAnalysis settings={settings} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete cache.txt' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('/var/cache/cache.txt');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls[3][1]).toMatchObject({
        method: 'DELETE',
        body: JSON.stringify({ id: scan.id, token: 'delete-token' }),
      });
    });
  });
});
