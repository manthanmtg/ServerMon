import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EndpointsPage from './EndpointsPage';
import { ToastProvider } from '@/components/ui/toast';

// Mock Lucide icons to avoid SVGR issues in tests
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Plus: () => <span data-testid="plus-icon" />,
    RefreshCcw: () => <span data-testid="refresh-icon" />,
    Search: () => <span data-testid="search-icon" />,
    Sparkles: () => <span data-testid="sparkles-icon" />,
    Terminal: () => <span data-testid="terminal-icon" />,
    Braces: () => <span data-testid="braces-icon" />,
    Globe: () => <span data-testid="globe-icon" />,
    Check: () => <span data-testid="check-icon" />,
    Copy: () => <span data-testid="copy-icon" />,
    Key: () => <span data-testid="key-icon" />,
    Settings: () => <span data-testid="settings-icon" />,
    FileText: () => <span data-testid="filetext-icon" />,
    ChevronRight: () => <span data-testid="chevronright-icon" />,
    ChevronDown: () => <span data-testid="chevrondown-icon" />,
    Shield: () => <span data-testid="shield-icon" />,
    Waypoints: () => <span data-testid="waypoints-icon" />,
    X: () => <span data-testid="x-icon" />,
    Play: () => <span data-testid="play-icon" />,
    Tag: () => <span data-testid="tag-icon" />,
    AlertTriangle: () => <span data-testid="alert-icon" />,
    LockOpen: () => <span data-testid="lockopen-icon" />,
    LoaderCircle: () => <span data-testid="loader-icon" />,
  };
});

// Mock ScriptEditor component
vi.mock('./components/ScriptEditor', () => ({
  default: ({
    value,
    onChange,
    onRun,
    onSave,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRun?: () => void;
    onSave: () => void;
  }) => (
    <div data-testid="mock-script-editor">
      <textarea
        data-testid="script-content-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {onRun && (
        <button data-testid="run-script-btn" onClick={onRun}>
          Run
        </button>
      )}
      <button data-testid="save-script-btn" onClick={onSave}>
        Save
      </button>
    </div>
  ),
}));

vi.mock('./components/EndpointDocs', () => ({
  EndpointDocs: ({
    form,
    onUpdateForm,
    onSave,
  }: {
    form: { docs?: string };
    onUpdateForm: (key: 'docs', value: string) => void;
    onSave: () => void;
  }) => (
    <div data-testid="mock-endpoint-docs">
      <textarea
        data-testid="endpoint-docs-input"
        value={form.docs ?? ''}
        onChange={(e) => onUpdateForm('docs', e.target.value)}
      />
      <button data-testid="save-endpoint-docs" onClick={onSave}>
        Save docs
      </button>
    </div>
  ),
}));

describe('EndpointsPage', () => {
  const mockEndpoints = [
    {
      _id: 'ep-1',
      name: 'Test Endpoint',
      slug: 'test-endpoint',
      method: 'GET',
      endpointType: 'script',
      enabled: true,
      executionCount: 5,
      lastExecutedAt: new Date().toISOString(),
      tags: ['test', 'prod'],
      auth: 'public',
    },
    {
      _id: 'ep-2',
      name: 'Webhook API',
      slug: 'webhook-api',
      method: 'POST',
      endpointType: 'webhook',
      enabled: false,
      executionCount: 10,
      tags: ['webhook'],
      auth: 'token',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/modules/endpoints/templates')) {
        return Promise.resolve({ ok: true, json: async () => ({ templates: [] }) });
      }
      if (url.includes('/api/modules/endpoints/ep-1/logs')) {
        return Promise.resolve({ ok: true, json: async () => ({ logs: [] }) });
      }
      if (url.includes('/api/modules/endpoints/ep-1/tokens')) {
        return Promise.resolve({ ok: true, json: async () => ({ tokens: [] }) });
      }
      if (
        url.includes('/api/modules/endpoints') &&
        !url.includes('/run') &&
        !url.includes('/tokens') &&
        !url.includes('/logs') &&
        !url.includes('/test') &&
        !url.includes('/templates')
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ endpoints: mockEndpoints, total: 2 }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  const renderPage = async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    window.dispatchEvent(new Event('resize'));
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <ToastProvider>
          <EndpointsPage />
        </ToastProvider>
      );
    });
    return result;
  };

  it('renders endpoint list initially', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Test Endpoint')).toBeDefined();
      expect(screen.getByText('Webhook API')).toBeDefined();
    });
  });

  it('filters endpoints by search text', async () => {
    await renderPage();
    const searchInput = screen.getByPlaceholderText('Search endpoints...');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'webhook' } });
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('search=webhook'),
        expect.any(Object)
      );
    });
  });

  it('filters endpoints by method', async () => {
    await renderPage();
    // Use method filter buttons in the sidebar
    const postFilter = screen.getAllByRole('button', { name: 'POST' })[0];
    await act(async () => {
      fireEvent.click(postFilter);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('method=POST'),
        expect.any(Object)
      );
    });
  });

  it('opens create new endpoint form', async () => {
    await renderPage();
    const newBtn = await waitFor(() => screen.getByTestId('new-endpoint-button'));
    await act(async () => {
      fireEvent.click(newBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('endpoint-detail')).toBeDefined();
      expect(screen.getByPlaceholderText('Endpoint name...')).toHaveValue('');
    });
  });

  it('slugifies name automatically when creating', async () => {
    await renderPage();
    const newBtn = await waitFor(() => screen.getByTestId('new-endpoint-button'));
    await act(async () => {
      fireEvent.click(newBtn);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'), { timeout: 3000 });
    const detail = screen.getByTestId('endpoint-detail');
    const nameInput = await waitFor(() => within(detail).getByPlaceholderText('Endpoint name...'));
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'My New API' } });
    });

    // Check if slugified name appears in the input with placeholder "my-endpoint"
    const slugInput = await waitFor(() =>
      within(detail).getByPlaceholderText('my-awesome-endpoint')
    );
    await waitFor(() => {
      expect(slugInput).toHaveValue('my-new-api');
    });
  });

  it('selects an endpoint to view details', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    const item = screen.getAllByTestId('endpoint-list-item')[0];
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => {
      expect(screen.getByTestId('endpoint-detail')).toBeDefined();
      expect(screen.getByPlaceholderText('Endpoint name...')).toHaveValue('Test Endpoint');
    });
  });

  it('switches between detail tabs', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    const item = screen.getAllByTestId('endpoint-list-item')[0];
    await act(async () => {
      fireEvent.click(item);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'));
    const codeTab = await waitFor(() => screen.getByTestId('tab-code'));
    await act(async () => {
      fireEvent.click(codeTab);
    });

    await waitFor(() => expect(screen.getByTestId('mock-script-editor')).toBeDefined());

    const authTab = await waitFor(() => screen.getByTestId('tab-auth'));
    await act(async () => {
      fireEvent.click(authTab);
    });

    await waitFor(() => expect(screen.queryByText(/Security Protocol/i)).not.toBeNull());
  });

  it('toggles endpoint enabled state', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    const toggle = screen.getAllByTestId('endpoint-toggle')[0];
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/modules/endpoints/ep-1/toggle'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('saves changes to an endpoint', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[0]);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'));
    const nameInput = screen.getByPlaceholderText('Endpoint name...');
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });
    });

    const saveBtn = screen.getByTestId('save-endpoint-button');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/modules/endpoints/ep-1'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"name":"Updated Name"'),
        })
      );
    });
  });

  it('runs endpoint test', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[0]);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'));
    const testBtn = screen.getByTestId('test-endpoint-button');
    await act(async () => {
      fireEvent.click(testBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Interactive Test Console/i)).toBeDefined();
    });
  });

  it('manages methods and status codes', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[0]);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'));

    // Method buttons in detail form
    const detailPanel = screen.getByTestId('endpoint-detail');
    const putBtn = await waitFor(() => within(detailPanel).getByTestId('method-PUT'));
    await act(async () => {
      fireEvent.click(putBtn);
    });

    const saveBtn = screen.getByTestId('save-endpoint-button');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/modules/endpoints/ep-1'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"method":"PUT"'),
        })
      );
    });
  });

  it('manages tokens for authenticated endpoints', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Webhook API'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[1]);
    });

    await waitFor(() => screen.getByTestId('endpoint-detail'));
    const authTab = await waitFor(() => screen.getByTestId('tab-auth'));
    await act(async () => {
      fireEvent.click(authTab);
    });

    await waitFor(() => screen.getByPlaceholderText(/Identifiable label/i));
    const tokenInput = screen.getByPlaceholderText(/Identifiable label/i);
    await act(async () => {
      fireEvent.change(tokenInput, { target: { value: 'New Token' } });
    });

    const generateBtn = screen.getByRole('button', { name: /Generate/i });
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/modules/endpoints/ep-2/tokens'),
        expect.any(Object)
      );
    });
  });

  it('loads and displays execution logs', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[0]);
    });
    await waitFor(() => screen.getByTestId('endpoint-detail'));

    const logsButton = await waitFor(() => screen.getByTestId('tab-logs'));
    await act(async () => {
      fireEvent.click(logsButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/modules/endpoints/ep-1/logs')
      );
    });
  });

  it('changes HTTP method', async () => {
    await renderPage();
    await waitFor(() => screen.getByText('Test Endpoint'));
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('endpoint-list-item')[0]);
    });

    const detailPanel = await waitFor(() => screen.getByTestId('endpoint-detail'));
    const methodSelect = await waitFor(() => within(detailPanel).getByTestId('method-GET'));
    await act(async () => {
      fireEvent.click(methodSelect);
    });

    const postOption = await waitFor(() => within(detailPanel).getByTestId('method-POST'));
    await act(async () => {
      fireEvent.click(postOption);
    });

    await waitFor(() => {
      const btn = within(detailPanel).getByTestId('method-POST');
      expect(btn.className).toContain('text-primary');
    });
  });

  it('handles fetch error on load', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Fetch failed'));
    await renderPage();

    await waitFor(() => {
      expect(screen.queryByText('Test Endpoint')).toBeNull();
    });
  });

  it('responds to keyboard shortcuts', async () => {
    await renderPage();

    await act(async () => {
      fireEvent.keyDown(window, { metaKey: true, key: 'n' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('endpoint-detail')).toBeDefined();
    });
  });
});
