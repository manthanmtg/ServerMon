import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceUnit } from '../../types';
import { ServicesTable } from './ServicesTable';

const services: ServiceUnit[] = [
  {
    name: 'nginx.service',
    description: 'Nginx HTTP Server',
    loadState: 'loaded',
    activeState: 'active',
    subState: 'running',
    type: 'simple',
    mainPid: 1234,
    cpuPercent: 0.5,
    memoryBytes: 1024 * 1024 * 50,
    memoryPercent: 1.2,
    uptimeSeconds: 3600,
    restartCount: 0,
    enabled: true,
    unitFileState: 'enabled',
    fragmentPath: '/lib/systemd/system/nginx.service',
  },
  {
    name: 'mongodb.service',
    description: 'MongoDB Database',
    loadState: 'loaded',
    activeState: 'inactive',
    subState: 'dead',
    type: 'forking',
    mainPid: 0,
    cpuPercent: 0,
    memoryBytes: 0,
    memoryPercent: 0,
    uptimeSeconds: 0,
    restartCount: 0,
    enabled: false,
    unitFileState: 'disabled',
    fragmentPath: '/lib/systemd/system/mongodb.service',
  },
];

describe('ServicesTable', () => {
  it('renders service rows and dispatches row actions', () => {
    const onRunAction = vi.fn();

    render(
      <ServicesTable
        services={services}
        totalServices={2}
        expandedService={null}
        pendingAction={null}
        sortField="name"
        sortDir="asc"
        onToggleExpanded={vi.fn()}
        onToggleSort={vi.fn()}
        onRunAction={onRunAction}
      />
    );

    expect(screen.getByText('nginx.service')).toBeDefined();
    expect(screen.getByText('mongodb.service')).toBeDefined();
    expect(screen.getByText('Showing 2 of 2 services')).toBeDefined();

    const inactiveRow = screen.getByText('mongodb.service').closest('tr');
    expect(inactiveRow).not.toBeNull();

    fireEvent.click(within(inactiveRow!).getByTitle('Start'));

    expect(onRunAction).toHaveBeenCalledWith('mongodb.service', 'start');
  });
});
