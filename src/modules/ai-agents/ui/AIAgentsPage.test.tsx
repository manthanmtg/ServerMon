import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import AIAgentsPage from './AIAgentsPage';
import type { AgentsSnapshot } from '../types';

const makeSession = (overrides: Partial<(typeof mockSnapshot)['sessions'][0]> = {}) => ({
  id: 'sess-1',
  agent: {
    type: 'claude-code' as const,
    displayName: 'Claude Code',
    model: 'claude-opus-4',
    version: '1.0',
  },
  owner: { user: 'alice', pid: 1234 },
  environment: {
    workingDirectory: '/repo',
    repository: 'my-repo',
    gitBranch: 'main',
    host: 'localhost',
  },
  lifecycle: {
    startTime: '2026-03-17T10:00:00.000Z',
    lastActivity: '2026-03-17T10:05:00.000Z',
    durationSeconds: 300,
  },
  status: 'running' as const,
  currentActivity: 'Editing files',
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  },
  filesModified: ['src/index.ts', 'package.json'],
  commandsExecuted: ['npm install', 'npm test'],
  conversation: [
    { role: 'user' as const, content: 'Help me fix this bug', timestamp: '2026-03-17T10:00:00Z' },
    {
      role: 'assistant' as const,
      content: 'Sure, let me look at it',
      timestamp: '2026-03-17T10:00:05Z',
    },
  ],
  timeline: [
    { timestamp: '2026-03-17T10:00:00Z', action: 'Started', detail: 'Session initialized' },
  ],
  logs: ['Starting up...', 'Connected to repo'],
  ...overrides,
});

const mockSnapshot: AgentsSnapshot = {
  summary: { total: 2, running: 1, idle: 0, waiting: 0, error: 0, completed: 1 },
  sessions: [makeSession()],
  pastSessions: [
    makeSession({
      id: 'sess-2',
      status: 'completed',
      agent: { type: 'codex', displayName: 'OpenAI Codex', version: '1.0' },
    }),
  ],
  tools: [
    {
      type: 'codex',
      displayName: 'Codex',
      command: 'codex',
      installed: true,
      path: '/usr/local/bin/codex',
      version: 'codex-cli 0.125.0',
      checkedAt: '2026-03-17T10:05:00.000Z',
    },
    {
      type: 'claude-code',
      displayName: 'Claude Code',
      command: 'claude',
      installed: false,
      checkedAt: '2026-03-17T10:05:00.000Z',
      error: 'claude: command not found',
    },
    {
      type: 'gemini-cli',
      displayName: 'Gemini CLI',
      command: 'gemini',
      installed: true,
      path: '/usr/local/bin/gemini',
      version: '0.39.1',
      checkedAt: '2026-03-17T10:05:00.000Z',
    },
  ],
  timestamp: '2026-03-17T10:05:00.000Z',
};

describe('AIAgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner initially', () => {
    // Don't resolve fetch
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<AIAgentsPage />);
    // Loading spinner should be visible
    expect(document.querySelector('svg.animate-spin')).toBeDefined();
  });

  it('renders summary cards after loading', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      // Use getAllByText since labels also appear in filter dropdowns
      expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Idle').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
    });
  });

  it('renders summary card values', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('2')).toBeDefined(); // total
      expect(screen.getByText('1')).toBeDefined(); // running
    });
  });

  it('renders session list', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined();
    });
  });

  it('renders sessions and tools tabs', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sessions' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Tools' })).toBeDefined();
    });
  });

  it('shows a tools catalog with available agent tools', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByRole('button', { name: 'Tools' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    await waitFor(() => {
      expect(screen.getByText('Tool Catalog')).toBeDefined();
      expect(screen.getByRole('button', { name: /Codex/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Claude Code/i })).toBeDefined();
      expect(screen.getByText('Configured tools')).toBeDefined();
      expect(screen.getByText('not installed')).toBeDefined();
    });
  });

  it('opens tool-specific settings and recent sessions when a tool is selected', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByRole('button', { name: 'Tools' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: /Codex/i }));

    await waitFor(() => {
      expect(screen.getByText('Codex Settings')).toBeDefined();
      expect(screen.getByText('Default model')).toBeDefined();
      expect(screen.getByText('Default reasoning effort')).toBeDefined();
      expect(screen.getByText('Recent Codex Sessions')).toBeDefined();
      expect(screen.getByText('OpenAI Codex')).toBeDefined();
    });
  });

  it('shows Gemini CLI settings that match the installed CLI controls', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByRole('button', { name: 'Tools' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: /Gemini CLI/i }));

    await waitFor(() => {
      expect(screen.getByText('Gemini CLI Settings')).toBeDefined();
      expect(screen.getByText('default, auto_edit, yolo, or plan')).toBeDefined();
      expect(screen.getByText('available via --worktree')).toBeDefined();
      expect(screen.getByText('controlled with --extensions')).toBeDefined();
    });
  });

  it('marks missing CLI tools as not installed instead of ready', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByRole('button', { name: 'Tools' }));

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));

    await waitFor(() => {
      expect(screen.getByText('Missing command')).toBeDefined();
      expect(screen.getAllByText('claude: command not found').length).toBeGreaterThan(0);
      expect(screen.queryByText('ready')).toBeNull();
    });
  });

  it('renders search input', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search agents, repos, users...')).toBeDefined();
    });
  });

  it('filters sessions by search term', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.change(screen.getByPlaceholderText('Search agents, repos, users...'), {
      target: { value: 'codex' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Claude Code')).toBeNull();
    });
  });

  it('clears search when X button clicked', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.change(screen.getByPlaceholderText('Search agents, repos, users...'), {
      target: { value: 'test' },
    });

    // X button should appear
    const clearBtn = document.querySelector('[class*="absolute right-2"]') as HTMLElement;
    if (clearBtn) {
      fireEvent.click(clearBtn);
      expect(
        (screen.getByPlaceholderText('Search agents, repos, users...') as HTMLInputElement).value
      ).toBe('');
    }
  });

  it('shows past sessions section', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('Past Sessions')).toBeDefined();
    });
  });

  it('navigates to session detail on row click', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    // Click on session row
    const sessionRow = screen.getByRole('button', { name: /Claude Code/i });
    fireEvent.click(sessionRow);

    await waitFor(() => {
      // SessionDetail should show with PID info
      expect(screen.getByText(/PID 1234/)).toBeDefined();
    });
  });

  it('navigates back from detail view', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    await waitFor(() => screen.getByText(/PID 1234/));

    // Click back arrow
    const backButton = screen.getAllByRole('button')[0];
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByText('Total')).toBeDefined();
    });
  });

  it('shows conversation tab in detail view', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    await waitFor(() => screen.getByText('Conversation'));

    expect(screen.getByText('Help me fix this bug')).toBeDefined();
  });

  it('shows stop/kill buttons for running session', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Stop/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Kill/i })).toBeDefined();
    });
  });

  it('terminates session on Stop click', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockSnapshot })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValue({ ok: true, json: async () => mockSnapshot });

    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    await waitFor(() => screen.getByRole('button', { name: /Stop/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Stop/i }));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Session terminated', variant: 'success' })
      );
    });
  });

  it('kills session on Kill click', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockSnapshot })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValue({ ok: true, json: async () => mockSnapshot });

    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    await waitFor(() => screen.getByRole('button', { name: /Kill/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Kill/i }));
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Session killed', variant: 'success' })
      );
    });
  });

  it('shows toast on fetch failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to load AI agents', variant: 'destructive' })
      );
    });
  });

  it('shows empty active sessions message', async () => {
    const emptySnapshot: AgentsSnapshot = {
      ...mockSnapshot,
      sessions: [],
      pastSessions: [],
      tools: [],
      summary: { total: 0, running: 0, idle: 0, waiting: 0, error: 0, completed: 0 },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptySnapshot,
    });
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => {
      expect(screen.getByText('No AI agent sessions found')).toBeDefined();
    });
  });

  it('switches to Timeline tab in detail view', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));
    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));

    await waitFor(() => screen.getByText('Timeline'));
    fireEvent.click(screen.getByRole('button', { name: /Timeline/i }));

    await waitFor(() => {
      // The timeline entry action "Started" is shown
      expect(screen.getByText('Started')).toBeDefined();
    });
  });

  it('switches to Files tab in detail view', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));
    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));

    await waitFor(() => screen.getByText('Files'));
    fireEvent.click(screen.getByRole('button', { name: /Files/i }));

    await waitFor(() => {
      expect(screen.getByText('src/index.ts')).toBeDefined();
      expect(screen.getByText('package.json')).toBeDefined();
    });
  });

  it('filters by status dropdown', async () => {
    await act(async () => {
      render(<AIAgentsPage />);
    });
    await waitFor(() => screen.getByText('Claude Code'));

    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'idle' } });

    await waitFor(() => {
      // running session should be gone
      expect(screen.queryByText('Claude Code')).toBeNull();
    });
  });
});
