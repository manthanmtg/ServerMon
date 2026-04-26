import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EnvVarsWidget from './EnvVarsWidget';

describe('EnvVarsWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        platform: 'linux',
        persistent: [{ key: 'OPENAI_API_KEY', sensitive: true }],
        session: [{ key: 'PATH' }, { key: 'HOME' }],
        skipped: [],
        target: { userFile: '/home/app/.profile' },
      }),
    } as Response);
  });

  it('renders environment variable counts', async () => {
    render(<EnvVarsWidget />);

    await waitFor(() => expect(screen.getByText('EnvVars')).toBeTruthy());
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('/home/app/.profile')).toBeTruthy();
  });
});
