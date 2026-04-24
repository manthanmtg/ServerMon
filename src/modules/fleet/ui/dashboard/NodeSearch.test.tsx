import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { NodeSearch } from './NodeSearch';

describe('NodeSearch', () => {
  it('emits onChange with initial value after mount (debounced)', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<NodeSearch onChange={onChange} />);
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ search: '', tag: '', status: '' }));
  });

  it('emits onChange when search input changes (debounced)', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<NodeSearch onChange={onChange} />);
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    const input = screen.getByPlaceholderText(/Search by name/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'edge-01' } });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        search: 'edge-01',
        tag: '',
        status: '',
      })
    );
  });

  it('emits onChange when tag input changes', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<NodeSearch onChange={onChange} />);
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    const tagInput = screen.getByPlaceholderText(/Tag filter/i);
    await act(async () => {
      fireEvent.change(tagInput, { target: { value: 'prod' } });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        search: '',
        tag: 'prod',
        status: '',
      })
    );
  });

  it('emits onChange when status dropdown changes', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<NodeSearch onChange={onChange} />);
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    const select = screen.getByLabelText('Status filter');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'offline' } });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        search: '',
        tag: '',
        status: 'offline',
      })
    );
  });

  it('respects initial prop', async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(
        <NodeSearch
          onChange={onChange}
          initial={{ search: 'init', tag: 'prod', status: 'online' }}
        />
      );
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        search: 'init',
        tag: 'prod',
        status: 'online',
      })
    );

    const searchInput = screen.getByPlaceholderText(/Search by name/i) as HTMLInputElement;
    expect(searchInput.value).toBe('init');
  });
});
