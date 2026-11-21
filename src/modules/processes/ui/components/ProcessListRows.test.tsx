import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProcessRow } from './ProcessListRows';
import type { ProcessInfo } from '../types';

const process: ProcessInfo = {
  pid: 101,
  parentPid: 1,
  name: 'node',
  command: 'node server.js',
  path: '/usr/bin/node',
  user: 'root',
  state: 'running',
  cpu: 15.5,
  mem: 5.2,
  memRss: 1024 * 1024 * 256,
  started: new Date(Date.now() - 3600000).toISOString(),
  priority: 20,
};

describe('ProcessRow', () => {
  it('renders expanded process details and destructive actions', () => {
    render(
      <table>
        <tbody>
          <ProcessRow
            process={process}
            isExpanded
            isKilling={false}
            onToggleExpand={vi.fn()}
            onKill={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('node')).toBeInTheDocument();
    expect(screen.getByText('node server.js')).toBeInTheDocument();
    expect(screen.getByText('/usr/bin/node')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Send SIGKILL to process node \(101\)/i })
    ).toBeInTheDocument();
  });
});
