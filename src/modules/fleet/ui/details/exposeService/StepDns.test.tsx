import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { StepDns } from './StepDns';
import { INITIAL_FORM } from './schema';

describe('StepDns', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the Verify DNS button', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepDns form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    expect(screen.getByText('Verify DNS')).toBeDefined();
  });

  it('posts to preflight endpoint and filters dns.* results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 'dns.publicHostname', label: 'DNS resolves', status: 'pass' },
          { id: 'mongo.connection', label: 'MongoDB', status: 'pass' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepDns form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Verify DNS'));
    });
    await waitFor(() => {
      expect(screen.getByText('DNS resolves')).toBeDefined();
    });
    expect(screen.queryByText('MongoDB')).toBeNull();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('/api/fleet/server/preflight');
  });

  it('Skip & continue calls next', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepDns form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Skip & continue/));
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('Back calls back', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepDns form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
