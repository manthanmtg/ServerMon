import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { StepTarget } from './StepTarget';
import { INITIAL_FORM, ExposeForm } from './schema';

const nodesResponse = {
  nodes: [
    {
      _id: 'n1',
      name: 'Edge',
      slug: 'edge-01',
      proxyRules: [{ name: 'web', type: 'http', localIp: '127.0.0.1', localPort: 8080 }],
    },
  ],
};

describe('StepTarget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders node selector and loads nodes from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => nodesResponse })
    );
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepTarget form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Edge (edge-01)')).toBeDefined();
    });
  });

  it('blocks Next when node is not selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => nodesResponse })
    );
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepTarget form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Edge (edge-01)')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Node is required')).toBeDefined();
    });
  });

  it('Back invokes the back callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => nodesResponse })
    );
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepTarget form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('advances when node + existing proxy rule are selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => nodesResponse })
    );
    const filled: ExposeForm = {
      ...INITIAL_FORM,
      nodeId: 'n1',
      proxyRuleName: 'web',
    };
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepTarget form={filled} setForm={setForm} next={next} back={back} />);
    });
    await waitFor(() => {
      expect(screen.getByText('Edge (edge-01)')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
