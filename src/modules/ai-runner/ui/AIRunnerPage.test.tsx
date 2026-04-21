import { createElement, type ImgHTMLAttributes } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
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

const mockSchedules: AIRunnerScheduleDTO[] = [];
const mockRuns: AIRunnerRunsResponse = { runs: [], total: 0 };
const mockDirectories: AIRunnerDirectoriesResponse = { directories: ['/root/repos/ServerMon'] };

describe('AIRunnerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/modules/ai-runner/profiles')) {
        return Promise.resolve({ ok: true, json: async () => mockProfiles });
      }
      if (url.includes('/api/modules/ai-runner/prompts')) {
        return Promise.resolve({ ok: true, json: async () => mockPrompts });
      }
      if (url.includes('/api/modules/ai-runner/schedules')) {
        return Promise.resolve({ ok: true, json: async () => mockSchedules });
      }
      if (url.includes('/api/modules/ai-runner/runs')) {
        return Promise.resolve({ ok: true, json: async () => mockRuns });
      }
      if (url.includes('/api/modules/ai-runner/directories')) {
        return Promise.resolve({ ok: true, json: async () => mockDirectories });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('keeps the prompts tab focused on a single library surface', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Saved Prompts/i }));
    });

    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('Browse')).not.toBeInTheDocument();
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
      fireEvent.click(screen.getByRole('button', { name: /History/i }));
    });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => typeof url === 'string' && url.includes('/api/modules/ai-runner/runs')
        )
      ).toBe(true)
    );
  });

  it('filters the library list and clears the focused prompt when nothing matches', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Saved Prompts/i }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search'), {
        target: { value: 'nonexistent prompt' },
      });
    });

    expect(screen.getByText('No prompts match this filter')).toBeInTheDocument();
    expect(screen.getByText('Select a prompt to preview it here')).toBeInTheDocument();
    expect(screen.queryByText('Fix tests')).not.toBeInTheDocument();
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
        fireEvent.click(screen.getByRole('button', { name: /Schedules/i }));
      });

      expect(screen.getByText('Last run')).toBeInTheDocument();
      expect(screen.queryByText('Last activity')).not.toBeInTheDocument();
      expect(screen.getByText('in 1h 5m 0s')).toBeInTheDocument();
      expect(screen.getByText('5m ago')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('in 1h 4m 59s')).toBeInTheDocument();
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
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
        fireEvent.click(screen.getByRole('button', { name: /Schedules/i }));
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

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /All Schedules/i }));
      });

      expect(screen.getByText('Full Schedule View')).toBeInTheDocument();
      expect(screen.getAllByText('/root/repos/LifeOS').length).toBeGreaterThan(0);
      expect(screen.getAllByText('/root/repos/ServerMon').length).toBeGreaterThan(0);
    } finally {
      mockSchedules.splice(0, mockSchedules.length);
    }
  });

  it('shows schedule retries in the create schedule studio with a default of 1', async () => {
    await act(async () => {
      render(<AIRunnerPage />);
    });

    await waitFor(() => expect(screen.getByText('AI Agent Runner')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Schedules/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Create Schedule$/i })[0]!);
    });

    expect(screen.getByLabelText('Retries')).toHaveValue(1);
    expect(screen.getByText('1 retry allowed after a failed scheduled run.')).toBeInTheDocument();
  });
});
