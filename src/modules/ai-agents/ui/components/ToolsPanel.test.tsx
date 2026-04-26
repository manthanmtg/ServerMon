import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsSnapshot } from '../../types';
import { ToolsPanel } from './ToolsPanel';

const snapshot: AgentsSnapshot = {
  summary: { total: 1, running: 0, idle: 0, waiting: 0, error: 0, completed: 1 },
  sessions: [],
  pastSessions: [
    {
      id: 'codex-session',
      agent: { type: 'codex', displayName: 'Codex', version: '0.125.0' },
      owner: { user: 'alice', pid: 42 },
      environment: { workingDirectory: '/repo', repository: 'repo', host: 'host' },
      lifecycle: {
        startTime: '2026-04-26T10:00:00.000Z',
        lastActivity: '2026-04-26T10:10:00.000Z',
        durationSeconds: 600,
      },
      status: 'completed',
      filesModified: [],
      commandsExecuted: [],
      conversation: [],
      timeline: [],
      logs: [],
    },
  ],
  tools: [
    {
      type: 'codex',
      displayName: 'Codex',
      command: 'codex',
      installed: true,
      version: '0.125.0',
      latestVersion: '0.126.0',
      updateAvailable: true,
      path: '/usr/local/bin/codex',
      checkedAt: '2026-04-26T10:00:00.000Z',
    },
    {
      type: 'claude-code',
      displayName: 'Claude Code',
      command: 'claude',
      installed: false,
      checkedAt: '2026-04-26T10:00:00.000Z',
      error: 'claude: command not found',
    },
  ],
  timestamp: '2026-04-26T10:00:00.000Z',
};

describe('ToolsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
  });

  it('renders a card-only catalog and opens details in a modal', async () => {
    render(<ToolsPanel snapshot={snapshot} />);

    expect(screen.getByText('Tool Catalog')).toBeDefined();
    expect(screen.queryByText('Codex Settings')).toBeNull();
    expect(screen.getByRole('button', { name: /Codex/i })).toBeDefined();
    expect(screen.getByText('update available')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Codex/i }));

    expect(await screen.findByRole('dialog', { name: /Codex/i })).toBeDefined();
    expect(screen.getByText('Command path')).toBeDefined();
    expect(screen.getByText('/usr/local/bin/codex')).toBeDefined();
    expect(screen.getByText('Recent Codex Sessions')).toBeDefined();
  });

  it('starts an update job from the modal and renders command output', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: {
            id: 'job-1',
            toolType: 'codex',
            action: 'update',
            status: 'running',
            output: 'updating codex\n',
          },
        }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          jobs: [
            {
              id: 'job-1',
              toolType: 'codex',
              action: 'update',
              status: 'succeeded',
              output: 'updating codex\ndone\n',
            },
          ],
        }),
      } as Response);

    render(<ToolsPanel snapshot={snapshot} />);
    fireEvent.click(screen.getByRole('button', { name: /Codex/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Update$/i }));

    await waitFor(() => {
      expect(screen.getByText(/updating codex/)).toBeDefined();
      expect(screen.getByText(/done/)).toBeDefined();
    });
  });
});
