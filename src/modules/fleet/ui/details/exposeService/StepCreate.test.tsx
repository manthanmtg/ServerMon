import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { StepCreate } from './StepCreate';
import { INITIAL_FORM, ExposeForm } from './schema';

const validForm: ExposeForm = {
  ...INITIAL_FORM,
  name: 'My App',
  slug: 'my-app',
  domain: 'app.example.com',
  nodeId: 'n1',
  proxyRuleName: 'my-app',
  target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
};

describe('StepCreate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders summary and Create button', async () => {
    const setForm = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} />);
    });
    expect(screen.getByText('Create')).toBeDefined();
    expect(screen.getAllByText('my-app').length).toBeGreaterThanOrEqual(1);
  });

  it('POSTs to /api/fleet/routes and shows created summary', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => ({
        route: {
          _id: 'r1',
          name: 'My App',
          domain: 'app.example.com',
          nginxConfigRevisionId: 'rev1',
        },
        autoInsertedProxy: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const setForm = vi.fn();
    const back = vi.fn();
    const onCreated = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} onCreated={onCreated} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText('Route created')).toBeDefined();
    });
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/fleet/routes');
    const init = call[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: 'My App',
      slug: 'my-app',
      domain: 'app.example.com',
      nodeId: 'n1',
      proxyRuleName: 'my-app',
    });
    expect(onCreated).toHaveBeenCalledWith({
      _id: 'r1',
      name: 'My App',
      domain: 'app.example.com',
      nginxConfigRevisionId: 'rev1',
    });
  });

  it('shows banner when autoInsertedProxy is true', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        route: { _id: 'r1', name: 'My App', domain: 'app.example.com' },
        autoInsertedProxy: true,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const setForm = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText(/Proxy rule auto-inserted/)).toBeDefined();
    });
  });

  it('surfaces API errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Slug already taken' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const setForm = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeDefined();
    });
  });

  it('Apply now posts to the apply endpoint when revision id is present', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (typeof url === 'string' && url.endsWith('/apply')) {
        return { ok: true, json: async () => ({ result: { reloaded: true } }) };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          route: {
            _id: 'r1',
            name: 'My App',
            domain: 'app.example.com',
            nginxConfigRevisionId: 'rev1',
          },
          autoInsertedProxy: false,
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const setForm = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Create'));
    });
    await waitFor(() => {
      expect(screen.getByText('Apply now')).toBeDefined();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Apply now'));
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => {
          const [u, i] = call as [string, RequestInit | undefined];
          return (
            typeof u === 'string' &&
            u.endsWith('/api/fleet/revisions/rev1/apply') &&
            i?.method === 'POST'
          );
        })
      ).toBe(true);
    });
  });

  it('Back button calls back', async () => {
    const setForm = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepCreate form={validForm} setForm={setForm} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
