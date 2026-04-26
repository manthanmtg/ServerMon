import { createElement, type ImgHTMLAttributes } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) =>
    createElement('span', { 'data-next-image-alt': props.alt }),
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import AIRunnerPage from './AIRunnerPage';
import type {
  AIRunnerDirectoriesResponse,
  AIRunnerAutoflowDTO,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerRunDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
  AIRunnerSettingsDTO,
  AIRunnerWorkspaceDTO,
} from '../types';

const mockProfiles: AIRunnerProfileDTO[] = [
  {
    _id: 'profile-1',
    name: 'Codex',
    slug: 'codex',
    agentType: 'codex',
    invocationTemplate: 'codex "$PROMPT"',
    defaultTimeout: 30,
    maxTimeout: 120,
    shell: '/bin/bash',
    requiresTTY: false,
    env: {},
    enabled: true,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
  },
];

const mockPrompts: AIRunnerPromptDTO[] = [
  {
    _id: 'prompt-1',
    name: 'Fix tests',
    content: 'Audit failing tests and patch the root cause.',
    type: 'inline',
    tags: ['tests', 'ci'],
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
  },
  {
    _id: 'prompt-2',
    name: 'Repo prompt',
    content: '/root/repos/ServerMon/prompts/test_adder.md',
    type: 'file-reference',
    tags: ['file'],
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
  },
];

const mockPromptTemplates: AIRunnerPromptTemplateDTO[] = [];
const mockWorkspaces: AIRunnerWorkspaceDTO[] = [];
const mockAutoflows: AIRunnerAutoflowDTO[] = [];
const mockSchedules: AIRunnerScheduleDTO[] = [];
const mockRuns: AIRunnerRunsResponse = { runs: [], total: 0 };
const mockActiveRuns: AIRunnerRunDTO[] = [];
const mockDirectories: AIRunnerDirectoriesResponse = { directories: ['/root/repos/ServerMon'] };
const mockRunnerSettings: AIRunnerSettingsDTO = {
  schedulesGloballyEnabled: true,
  autoflowMode: 'sequential',
};
const mockDiagnostics: {
  runtime: {
    kind: 'interactive' | 'systemd' | 'launchd' | 'background';
    serviceManager: 'systemd' | 'launchd' | null;
    scheduleReliability: 'session-bound' | 'reboot-safe' | 'unknown';
    summary: string;
  };
  process: {
    platform: string;
  };
} = {
  runtime: {
    kind: 'systemd',
    serviceManager: 'systemd',
    scheduleReliability: 'reboot-safe',
    summary: 'Managed by systemd.',
  },
  process: {
    platform: 'linux',
  },
};

describe('AIRunnerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunnerSettings.schedulesGloballyEnabled = true;
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/modules/ai-runner/prompt-templates')) {
        return Promise.resolve({ ok: true, json: async () => mockPromptTemplates });
      }
      if (url.includes('/api/modules/ai-runner/workspaces')) {
        return Promise.resolve({ ok: true, json: async () => mockWorkspaces });
      }
      if (url.includes('/api/modules/ai-runner/autoflows')) {
        return Promise.resolve({ ok: true, json: async () => mockAutoflows });
      }
      if (url.includes('/api/modules/ai-runner/profiles')) {
        return Promise.resolve({ ok: true, json: async () => mockProfiles });
      }
      if (url.includes('/api/modules/ai-runner/prompts')) {
        return Promise.resolve({ ok: true, json: async () => mockPrompts });
      }
      if (url.includes('/api/modules/ai-runner/settings')) {
        if (init?.method === 'PATCH') {
          const payload = JSON.parse(String(init.body ?? '{}')) as AIRunnerSettingsDTO;
          mockRunnerSettings.schedulesGloballyEnabled = payload.schedulesGloballyEnabled;
        }
        return Promise.resolve({ ok: true, json: async () => mockRunnerSettings });
      }
      if (url.includes('/api/modules/ai-runner/schedules')) {
        return Promise.resolve({ ok: true, json: async () => mockSchedules });
      }
      if (url.includes('/api/modules/ai-runner/runs/active')) {
        return Promise.resolve({ ok: true, json: async () => mockActiveRuns });
      }
      if (url.includes('/api/modules/ai-runner/runs')) {
        return Promise.resolve({ ok: true, json: async () => mockRuns });
      }
      if (url.includes('/api/modules/ai-runner/directories')) {
        return Promise.resolve({ ok: true, json: async () => mockDirectories });
      }
      if (url.includes('/api/system/diagnostics')) {
        return Promise.resolve({ ok: true, json: async () => mockDiagnostics });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the prompts tab focused on a single library surface', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Saved Prompts/i }));
    });

    expect(screen.getByRole('button', { name: /^Create Prompt$/i })).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('Selected')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('warns when schedules are running from an interactive session', async () => {
    mockDiagnostics.runtime = {
      kind: 'interactive',
      serviceManager: null,
      scheduleReliability: 'session-bound',
      summary: 'Running from an interactive session.',
    };

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

      expect(screen.getByText('Schedules are tied to this live session')).toBeInTheDocument();
    } finally {
      mockDiagnostics.runtime = {
        kind: 'systemd',
        serviceManager: 'systemd',
        scheduleReliability: 'reboot-safe',
        summary: 'Managed by systemd.',
      };
    }
  });

  it('defers history runs loading until the history tab is opened', async () => {
    const fetchMock = vi.mocked(global.fetch);

    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    expect(
      fetchMock.mock.calls.some(
        ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs')
      )
    ).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs')
        )
      ).toBe(true)
    );
  });

  it('keeps prompt actions inline without a separate filter panel', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Saved Prompts/i }));
    });

    expect(screen.getByText('Fix tests')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Run$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Edit$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Delete$/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Search & Filter')).not.toBeInTheDocument();
  });

  it('shows and toggles the global schedule queue button', async () => {
    const fetchMock = vi.mocked(global.fetch);

    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
    });

    expect(screen.getByRole('button', { name: /Global Auto-Queue ON/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Global Auto-Queue ON/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/modules/ai-runner/settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ schedulesGloballyEnabled: false }),
      })
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Global Auto-Queue OFF/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Global schedule pause is active')).toBeInTheDocument();
  });

  it('shows a live countdown and last run label on schedule rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T09:25:00.000Z'));
    mockSchedules.splice(0, mockSchedules.length, {
      _id: 'schedule-1',
      name: 'LifeOS Improve',
      promptId: 'prompt-1',
      agentProfileId: 'profile-1',
      workingDirectory: '/root/repos/LifeOS',
      timeout: 28,
      retries: 1,
      cronExpression: '30 9 * * *',
      enabled: true,
      lastRunId: 'run-1',
      lastRunStatus: 'completed',
      lastRunAt: '2026-04-21T09:20:00.000Z',
      nextRunTime: '2026-04-21T10:30:00.000Z',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    });

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('AI Agent Runner')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
      });

      expect(screen.getByText('Last run')).toBeInTheDocument();
      expect(screen.queryByText('Last activity')).not.toBeInTheDocument();
      expect(screen.getByText('in 1h 5m 0s')).toBeInTheDocument();
      expect(screen.getByText('5m ago')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('in 1h 4m 59s')).toBeInTheDocument();

      await act(async () => {
        vi.setSystemTime(new Date('2026-04-21T10:31:00.000Z'));
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('overdue by 1m 1s')).toBeInTheDocument();
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
      mockActiveRuns.splice(0, mockActiveRuns.length);
      vi.useRealTimers();
    }
  });

  it('shows a live run status instead of overdue when the scheduled run is active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T10:31:00.000Z'));
    mockSchedules.splice(0, mockSchedules.length, {
      _id: 'schedule-1',
      name: 'LifeOS Improve',
      promptId: 'prompt-1',
      agentProfileId: 'profile-1',
      workingDirectory: '/root/repos/LifeOS',
      timeout: 28,
      retries: 1,
      cronExpression: '30 9 * * *',
      enabled: true,
      nextRunTime: '2026-04-21T10:30:00.000Z',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    });
    mockActiveRuns.splice(0, mockActiveRuns.length, {
      _id: 'run-1',
      scheduleId: 'schedule-1',
      agentProfileId: 'profile-1',
      promptContent: 'Audit failing tests and patch the root cause.',
      workingDirectory: '/root/repos/LifeOS',
      command: 'codex "$PROMPT"',
      status: 'running',
      stdout: '',
      stderr: '',
      rawOutput: '',
      queuedAt: '2026-04-21T10:30:00.000Z',
      startedAt: '2026-04-21T10:30:07.000Z',
      triggeredBy: 'schedule',
    });

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('AI Agent Runner')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
      });

      expect(screen.getAllByText('running now').length).toBeGreaterThan(0);
      expect(screen.queryByText('overdue by 1m 1s')).not.toBeInTheDocument();
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
      mockActiveRuns.splice(0, mockActiveRuns.length);
      vi.useRealTimers();
    }
  });

  it('refreshes history every 5 seconds only while the history tab is open', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(global.fetch);

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText('AI Agent Runner')).toBeInTheDocument();

      const runsRequestCountBeforeHistory = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs?limit=25')
      ).length;
      expect(runsRequestCountBeforeHistory).toBe(0);

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /History/i }));
      });

      await act(async () => {
        await Promise.resolve();
      });

      const runsRequestCountAfterOpen = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs?limit=25')
      ).length;
      expect(runsRequestCountAfterOpen).toBeGreaterThan(0);

      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      const runsRequestCountAfterPoll = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs?limit=25')
      ).length;
      expect(runsRequestCountAfterPoll).toBeGreaterThan(runsRequestCountAfterOpen);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the schedule visualization modal from the schedules tab', async () => {
    mockSchedules.splice(
      0,
      mockSchedules.length,
      {
        _id: 'schedule-1',
        name: 'LifeOS Improve',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/root/repos/LifeOS',
        timeout: 28,
        retries: 1,
        cronExpression: '30 9 * * *',
        enabled: true,
        nextRunTime: '2026-04-21T10:30:00.000Z',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      },
      {
        _id: 'schedule-2',
        name: 'ServerMon Audit',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/root/repos/ServerMon',
        timeout: 20,
        retries: 1,
        cronExpression: '0 13 * * *',
        enabled: true,
        nextRunTime: '2026-04-21T13:00:00.000Z',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      }
    );

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Visualize Schedule/i }));
      });

      expect(
        screen.getByRole('dialog', {
          name: /Visualize schedule pressure and overall split before agents step on each other/i,
        })
      ).toBeInTheDocument();
      expect(screen.getByText('Schedule Visualization')).toBeInTheDocument();
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
    }
  });

  it('opens a profile-scoped schedule visualization from the settings tab', async () => {
    mockProfiles.splice(1, 0, {
      _id: 'profile-2',
      name: 'Claude Code',
      slug: 'claude-code',
      agentType: 'claude-code',
      invocationTemplate: 'claude "$PROMPT"',
      defaultTimeout: 25,
      maxTimeout: 90,
      shell: '/bin/bash',
      requiresTTY: false,
      env: {},
      enabled: true,
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    });
    mockSchedules.splice(
      0,
      mockSchedules.length,
      {
        _id: 'schedule-1',
        name: 'Codex Audit',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/root/repos/ServerMon',
        timeout: 28,
        retries: 1,
        cronExpression: '30 9 * * *',
        enabled: true,
        nextRunTime: '2026-04-21T10:30:00.000Z',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      },
      {
        _id: 'schedule-2',
        name: 'Claude Review',
        promptId: 'prompt-1',
        agentProfileId: 'profile-2',
        workingDirectory: '/root/repos/OtherRepo',
        timeout: 20,
        retries: 1,
        cronExpression: '0 13 * * *',
        enabled: true,
        nextRunTime: '2026-04-21T13:00:00.000Z',
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      }
    );

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /Settings/i }));
      });

      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Visualize Schedules/i })[0]!);
      });

      expect(
        screen.getByRole('dialog', {
          name: /Visualize Codex schedule pressure before runs step on each other/i,
        })
      ).toBeInTheDocument();
      expect(screen.getByText(/Profile scope:/i)).toBeInTheDocument();
      expect(screen.getByText('Codex Audit')).toBeInTheDocument();
      expect(screen.queryByText('Claude Review')).not.toBeInTheDocument();
    } finally {
      mockProfiles.splice(1, 1);
      mockSchedules.splice(0, mockSchedules.length);
    }
  });

  it('shows schedule retries in the create schedule studio with a default of 1', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Create Schedule$/i })[0]!);
    });

    expect(screen.getByLabelText('Retries')).toHaveValue(1);
    expect(screen.getByText('1 retry allowed after a failed scheduled run.')).toBeInTheDocument();
  });

  it('allows duplicating a schedule with a "Copy" name suffix', async () => {
    mockSchedules.splice(0, mockSchedules.length, {
      _id: 'schedule-1',
      name: 'Original Schedule',
      promptId: 'prompt-1',
      agentProfileId: 'profile-1',
      workingDirectory: '/root/repos/ServerMon',
      timeout: 30,
      retries: 1,
      cronExpression: '0 0 * * *',
      enabled: true,
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
    });

    try {
      await act(async () => {
        render(<AIRunnerPage />);
      });

      await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /Schedules/i }));
      });

      expect(screen.getByText('Original Schedule')).toBeInTheDocument();

      const duplicateButton = screen.getByTitle('Duplicate Schedule');

      const fetchMock = vi.mocked(global.fetch);

      await act(async () => {
        fireEvent.click(duplicateButton);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/modules/ai-runner/schedules',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"Original Schedule Copy"'),
        })
      );

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/modules/ai-runner/schedules',
        expect.objectContaining({
          body: expect.stringContaining('"enabled":false'),
        })
      );

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Schedule duplicated',
          })
        )
      );
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
    }
  });
});
