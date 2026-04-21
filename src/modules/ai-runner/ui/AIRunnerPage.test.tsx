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
});
