import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCRIPT_RUNNER_DEFAULTS,
  type RunnerOverview,
  type SavedScript,
  type ScriptRun,
} from '../types';
import ScriptRunnerPage from './ScriptRunnerPage';

vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('./RunnerDialog', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <section role="dialog" aria-label={title}>
      {children}
    </section>
  ),
}));

const active: ScriptRun = {
  id: 'active-run',
  title: 'Restore data',
  cwd: '/srv',
  args: [],
  timeoutSeconds: 90,
  status: 'running',
  language: 'bash',
  requestedBy: 'admin',
  createdAt: '2026-11-20T10:00:00Z',
};

const completed: ScriptRun = {
  ...active,
  id: 'history-run',
  title: 'Host snapshot',
  status: 'succeeded',
  finishedAt: '2026-11-20T10:00:01Z',
};

let overview: RunnerOverview;

beforeEach(() => {
  overview = {
    ...SCRIPT_RUNNER_DEFAULTS,
    variables: [],
    active: [active],
    history: [completed],
    scripts: [],
    recentDirectories: [],
    online: true,
    supported: true,
    runtimes: ['bash'],
    environmentSupport: true,
    logRetentionDays: 3,
  };
  vi.stubGlobal('fetch', async () => Response.json(overview));
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal(
    'EventSource',
    class extends EventTarget {
      close = vi.fn();
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function openRuns() {
  const views = screen.getByRole('navigation', { name: 'Script Runner views' });
  fireEvent.click(within(views).getByRole('button', { name: /^Runs/ }));
  return within(screen.getByRole('region', { name: 'Script runs' }));
}

it('starts on Overview and opens the editor without the library', async () => {
  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  const views = within(screen.getByRole('navigation', { name: 'Script Runner views' }));
  expect(views.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
  expect(views.getByRole('button', { name: 'Saved Scripts' })).toBeVisible();
  expect(views.getByRole('button', { name: 'Env Vars' })).toBeVisible();
  expect(views.getByRole('button', { name: 'Settings' })).toBeVisible();

  fireEvent.click(views.getByRole('button', { name: 'Workspace' }));
  expect(screen.getByRole('button', { name: 'Open saved script' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Script library' })).not.toBeInTheDocument();
});

it('ignores a script details response after leaving the library', async () => {
  const saved: SavedScript = {
    id: 'saved-script',
    title: 'Deployment',
    language: 'bash',
    source: 'echo ready',
    cwd: '/srv',
    env: [],
    args: [],
    timeoutSeconds: 90,
    updatedAt: active.createdAt,
  };
  overview.scripts = [saved];
  let finishOpening!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finishOpening = resolve;
  });
  vi.stubGlobal('fetch', async (url: string) =>
    url.endsWith('/scripts/saved-script') ? pending : Response.json(overview)
  );

  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  const nav = within(screen.getByRole('navigation', { name: 'Script Runner views' }));
  fireEvent.click(nav.getByRole('button', { name: 'Saved Scripts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit in Workspace' }));
  fireEvent.click(nav.getByRole('button', { name: 'Settings' }));

  await act(async () => finishOpening(Response.json(saved)));
  expect(nav.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('region', { name: 'Script editor' })).not.toBeInTheDocument();
});

it('runs a saved script by ID and opens its console', async () => {
  const scriptId = '27ac89d0-0704-4662-9770-e143d2a47d3c';
  overview.scripts = [{ ...completed, id: scriptId, updatedAt: completed.createdAt }];
  const launched: ScriptRun = { ...completed, id: 'library-run', scriptId, status: 'queued' };
  const fetchRunner = vi.fn(async (url: string, options?: RequestInit) =>
    Response.json(url.endsWith('/runs') && options?.method === 'POST' ? launched : overview)
  );
  vi.stubGlobal('fetch', fetchRunner);

  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Saved Scripts' }));
  fireEvent.click(screen.getByRole('button', { name: `Run now: ${completed.title}` }));

  const console = within(await screen.findByRole('region', { name: 'Run console' }));
  expect(console.getByRole('heading', { name: 'Host snapshot Bash' })).toBeVisible();
  const submitted = fetchRunner.mock.calls.find(([url]) => url.endsWith('/runs'))?.[1];
  expect(JSON.parse(String(submitted?.body))).toEqual({ scriptId, id: expect.any(String) });
  expect(screen.queryByRole('dialog', { name: 'Configure run' })).not.toBeInTheDocument();
});

describe('Script Runner console selection', () => {
  it.each([
    ['Active', 'Restore data'],
    ['History', 'Host snapshot'],
  ])('leaves the console empty when opening %s with existing runs', async (tab, title) => {
    if (tab === 'History') overview.active = [];
    render(<ScriptRunnerPage />);
    await screen.findByText('Worker online');

    const runs = openRuns();
    fireEvent.click(runs.getByRole('button', { name: new RegExp(`^${tab}`) }));

    const row = runs.getByRole('button', { name: new RegExp(`^${title}`) });
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: 'Script output' })).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Script output' })).toBeVisible();
  });

  it('clears the console when switching to another list', async () => {
    render(<ScriptRunnerPage />);
    await screen.findByText('Worker online');

    const runs = openRuns();
    fireEvent.click(runs.getByRole('button', { name: /^Restore data/ }));
    expect(screen.getByRole('region', { name: 'Script output' })).toBeVisible();

    fireEvent.click(runs.getByRole('button', { name: 'History' }));
    expect(screen.queryByRole('region', { name: 'Script output' })).not.toBeInTheDocument();
  });

  it('opens the console for a run launched from the workspace', async () => {
    const launched: ScriptRun = {
      ...active,
      id: 'new-run',
      status: 'queued',
      title: 'Host snapshot',
    };
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(url.endsWith('/runs') ? launched : overview)
    );
    render(<ScriptRunnerPage />);
    await screen.findByText('Worker online');

    const views = screen.getByRole('navigation', { name: 'Script Runner views' });
    fireEvent.click(within(views).getByRole('button', { name: 'Workspace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Configure run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start run' }));

    const console = within(await screen.findByRole('region', { name: 'Run console' }));
    expect(console.getByRole('heading', { name: 'Host snapshot Bash' })).toBeVisible();
    expect(console.getByRole('region', { name: 'Script output' })).toBeVisible();
  });

  it('keeps a selected run visible in History when it finishes', async () => {
    vi.useFakeTimers();
    await act(async () => {
      render(<ScriptRunnerPage />);
    });
    const runs = openRuns();
    fireEvent.click(runs.getByRole('button', { name: /^Restore data/ }));

    overview = {
      ...overview,
      active: [],
      history: [{ ...completed, id: active.id, title: active.title }, completed],
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(runs.getByRole('button', { name: 'History' })).toHaveAttribute('aria-pressed', 'true');
    expect(runs.getByRole('button', { name: /^Restore data/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('region', { name: 'Script output' })).toBeVisible();
  });
});
