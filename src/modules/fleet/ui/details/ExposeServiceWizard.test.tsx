import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ExposeServiceWizard } from './ExposeServiceWizard';

// This legacy path is kept as a thin re-export; a full interaction test lives in
// ./exposeService/ExposeServiceWizard.test.tsx. Here we just assert the legacy
// import path still renders the new wizard shell.
describe('ExposeServiceWizard (legacy re-export)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the new wizard shell', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [], nodes: [] }) })
    );
    await act(async () => {
      render(<ExposeServiceWizard nodeId="n1" />);
    });
    expect(screen.getByText('Expose service')).toBeDefined();
    expect(screen.getByText('Identity')).toBeDefined();
  });
});
