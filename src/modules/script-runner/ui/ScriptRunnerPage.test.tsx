import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCRIPT_RUNNER_DEFAULTS,
  type RunnerOverview,
  type SavedScript,
  type ScriptRun,
  type ScriptSchedule,
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
    envGroups: [],
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

it('creates, pauses, resumes, and deletes a saved script schedule', async () => {
  const scriptId = '27ac89d0-0704-4662-9770-e143d2a47d3c';
  overview.scripts = [{ ...completed, id: scriptId, updatedAt: completed.createdAt }];
  let schedule: ScriptSchedule | undefined;
  const fetchRunner = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/schedules')) return Response.json(schedule ? [schedule] : []);
    if (url.endsWith(`/schedules/${scriptId}`)) {
      if (options?.method === 'DELETE') {
        schedule = undefined;
        return Response.json({ deleted: true });
      }
      const { intervalMinutes, enabled } = JSON.parse(String(options?.body));
      schedule = {
        scriptId,
        intervalMinutes,
        enabled,
        nextRunAt: enabled ? active.createdAt : undefined,
      };
      return Response.json(schedule);
    }
    return Response.json(overview);
  });
  vi.stubGlobal('fetch', fetchRunner);

  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Schedules' }));
  await screen.findByText('No schedules yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
  expect(screen.getByLabelText('Saved script')).toHaveValue(scriptId);
  fireEvent.change(screen.getByLabelText('Interval in minutes'), { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  expect(await screen.findByText('Every 15 minutes · Enabled')).toBeVisible();
  expect(screen.getByText(/^Next run/)).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Pause Host snapshot schedule' }));
  expect(await screen.findByText('Every 15 minutes · Paused')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Resume Host snapshot schedule' }));
  expect(await screen.findByText('Every 15 minutes · Enabled')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Host snapshot schedule' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete schedule' }));
  expect(await screen.findByText('No schedules yet.')).toBeVisible();
  expect(schedule).toBeUndefined();
});

it('saves the history age and count limits together', async () => {
  const fetchRunner = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/settings')) {
      expect(options?.method).toBe('PATCH');
      expect(JSON.parse(String(options?.body))).toEqual({
        historyRetentionDays: 14,
        maxHistoryRuns: 75,
      });
      overview = { ...overview, historyRetentionDays: 14, maxHistoryRuns: 75 };
    }
    return Response.json(overview);
  });
  vi.stubGlobal('fetch', fetchRunner);
  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByLabelText('Run history retention'), { target: { value: '14' } });
  fireEvent.change(screen.getByLabelText('Max completed runs to keep'), {
    target: { value: '75' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  expect(await screen.findByText('Settings saved.')).toBeVisible();
});

it('previews and saves a weekday schedule in a selected timezone', async () => {
  const scriptId = '27ac89d0-0704-4662-9770-e143d2a47d3c';
  overview.scripts = [{ ...completed, id: scriptId, updatedAt: completed.createdAt }];
  let schedule: ScriptSchedule | undefined;
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/schedules')) return Response.json(schedule ? [schedule] : []);
    if (url.endsWith(`/schedules/${scriptId}`)) {
      const input = JSON.parse(String(options?.body));
      expect(input).toEqual({
        enabled: true,
        calendar: { frequency: 'weekdays', time: '09:15', timeZone: 'Asia/Kolkata' },
      });
      schedule = { ...input, scriptId, nextRunAt: active.createdAt };
      return Response.json(schedule);
    }
    return Response.json(overview);
  });
  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Schedules' }));
  await screen.findByText('No schedules yet.');
  fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
  fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'weekdays' } });
  fireEvent.change(screen.getByLabelText('Local time'), { target: { value: '09:15' } });
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Asia/Kolkata' } });
  expect(
    within(screen.getByRole('list', { name: 'Upcoming runs' })).getAllByRole('listitem')
  ).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
  expect(await screen.findByText('Weekdays at 09:15 · Asia/Kolkata · Enabled')).toBeVisible();
});

it('shows stored output and saves retention for a single script', async () => {
  const scriptId = '27ac89d0-0704-4662-9770-e143d2a47d3c';
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    if (url.endsWith('/storage'))
      return Response.json([
        { scriptId, title: 'Weather report', retainedRuns: 9, logBytes: 2048 },
      ]);
    if (url.endsWith(`/storage/${scriptId}`)) {
      expect(options?.method).toBe('PUT');
      expect(JSON.parse(String(options?.body))).toEqual({ logRetentionDays: 1, maxHistoryRuns: 5 });
      return Response.json({ logRetentionDays: 1, maxHistoryRuns: 5 });
    }
    return Response.json(overview);
  });
  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(await screen.findByText('2 KiB of logs')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit retention for Weather report' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Script retention' }));
  fireEvent.change(dialog.getByLabelText('Log retention (days)'), { target: { value: '1' } });
  fireEvent.change(dialog.getByLabelText('Maximum completed runs'), { target: { value: '5' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save retention' }));
  expect(await screen.findByText('1d logs · 30d history · 5 runs max')).toBeVisible();
});

it('creates a variable group in Env Vars and links it in saved script defaults', async () => {
  const variable = {
    id: 'weather-token',
    key: 'WEATHER_TOKEN',
    secret: true,
    updatedAt: active.createdAt,
  };
  const standalone = { ...variable, id: 'log-level', key: 'LOG_LEVEL', secret: false };
  overview.variables = [variable, standalone];
  const group = { id: 'weather-bot', name: 'Weather Telegram bot', variableIds: [variable.id] };
  const fetchRunner = vi.fn(async (url: string, options?: RequestInit) => {
    const input = options?.body ? JSON.parse(String(options.body)) : undefined;
    if (url.endsWith('/env-groups') && options?.method === 'POST') {
      expect(input).toEqual({ name: group.name, variableIds: group.variableIds });
      overview.envGroups = [group];
      return Response.json(group);
    }
    if (url.endsWith('/scripts') && options?.method === 'POST') {
      expect(input).toMatchObject({ envGroupIds: [group.id], envVarIds: [], env: [] });
      return Response.json({ ...input, id: 'weather-script', updatedAt: active.createdAt });
    }
    return Response.json(overview);
  });
  vi.stubGlobal('fetch', fetchRunner);

  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Env Vars' }));
  fireEvent.click(screen.getByRole('button', { name: 'New group' }));
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: group.name } });
  fireEvent.click(screen.getByRole('checkbox', { name: /WEATHER_TOKEN/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
  expect(await screen.findByRole('button', { name: `Edit group ${group.name}` })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
  fireEvent.click(screen.getByRole('button', { name: 'Run defaults' }));
  const variablePicker = within(screen.getByLabelText('Link saved environment variable'));
  const linkGroup = () =>
    fireEvent.change(screen.getByLabelText('Link environment variable group'), {
      target: { value: group.id },
    });
  expect(variablePicker.getByRole('option', { name: /WEATHER_TOKEN/ })).toBeInTheDocument();
  linkGroup();
  expect(variablePicker.queryByRole('option', { name: /WEATHER_TOKEN/ })).not.toBeInTheDocument();
  expect(variablePicker.getByRole('option', { name: 'LOG_LEVEL' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Unlink group ${group.name}` }));
  expect(variablePicker.getByRole('option', { name: /WEATHER_TOKEN/ })).toBeInTheDocument();
  linkGroup();
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await screen.findByText('Saved');
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

  it('drops a pruned run from loaded history and closes its console', async () => {
    vi.useFakeTimers();
    const expired = {
      ...completed,
      id: 'expired-run',
      title: 'Expired run',
      createdAt: '2026-11-19T10:00:00Z',
    };
    const older = { ...completed, id: 'older-run', createdAt: '2026-11-18T10:00:00Z' };
    overview = { ...overview, active: [], oldestHistory: older, nextHistoryCursor: completed.id };
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json(
        url.includes('?before=')
          ? { ...overview, history: [expired, older], nextHistoryCursor: undefined }
          : overview
      )
    );
    await act(async () => {
      render(<ScriptRunnerPage />);
    });
    const runs = openRuns();
    fireEvent.click(runs.getByRole('button', { name: 'History' }));
    await act(async () => {
      fireEvent.click(runs.getByRole('button', { name: 'Load older runs' }));
    });
    fireEvent.click(runs.getByRole('button', { name: /^Expired run/ }));
    expect(screen.getByRole('region', { name: 'Script output' })).toBeVisible();

    overview = { ...overview, historyPruneVersion: 1, inspectedRunId: expired.id };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(runs.queryByRole('button', { name: /^Expired run/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Script output' })).not.toBeInTheDocument();
  });
});

it('offers managed environments as soon as Python is selected and carries the choice into the run', async () => {
  const environmentId = '81d822e3-eeb2-4afe-a59b-c5cc10521317';
  const launched: ScriptRun = {
    ...active,
    id: 'python-run',
    status: 'queued',
    language: 'python',
    pythonEnvironment: {
      environmentId,
      name: 'Weather Bot',
      revisionId: 'queued-revision',
      pythonVersion: '3.12.16',
    },
  };
  overview = {
    ...overview,
    runtimes: ['bash', 'python'],
    pythonEnvironmentSupport: true,
    pythonEnvironments: [{ id: environmentId, name: 'Weather Bot', pythonVersion: '3.12.16' }],
  };
  const fetchRun = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/runs') && options?.method === 'POST') {
      overview = { ...overview, active: [...overview.active, launched] };
      return Response.json(launched);
    }
    return Response.json(overview);
  });
  vi.stubGlobal('fetch', fetchRun);

  render(<ScriptRunnerPage />);
  await screen.findByText('Worker online');
  fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
  expect(screen.queryByLabelText('Python environment')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Script runtime'), { target: { value: 'python' } });
  fireEvent.change(screen.getByLabelText('Python environment'), {
    target: { value: environmentId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure run' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Configure run' }));
  expect(dialog.getByLabelText('Python environment')).toHaveValue(environmentId);
  fireEvent.click(dialog.getByRole('button', { name: 'Start run' }));
  expect(await screen.findByText(/Weather Bot · Python 3\.12\.16 · Revision/)).toBeVisible();
  const request = fetchRun.mock.calls.find(([url]) => url.endsWith('/runs'))?.[1];
  expect(JSON.parse(String(request?.body))).toMatchObject({
    language: 'python',
    pythonEnvironmentId: environmentId,
  });
});
