import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import HardwarePage from './HardwarePage';

const mockHardwareSnapshot = {
  source: 'live',
  uptime: 3600,
  system: { manufacturer: 'Apple', model: 'MacBook Pro' },
  os: { hostname: 'server-1', platform: 'darwin', kernel: '23.4.0', arch: 'arm64', distro: 'macOS', release: '14.4' },
  cpu: { manufacturer: 'Apple', brand: 'M2 Max', speed: 3.5, cores: 12, physicalCores: 12, cache: { l3: 0 } },
  memory: { total: 34359738368, used: 17179869184, available: 17179869184, swaptotal: 0, swapused: 0 },
  cpuTemperature: { main: 45, cores: [42, 43, 45, 44], max: 48 },
  memoryLayout: [
    { bank: 'BANK 0', size: 17179869184, type: 'LPDDR5', clockSpeed: 6400, manufacturer: 'Apple', partNum: 'M2-1' },
    { bank: 'BANK 1', size: 17179869184, type: 'LPDDR5', clockSpeed: 6400, manufacturer: 'Apple', partNum: 'M2-2' }
  ],
  disks: [
    { device: '/dev/disk0', name: 'APPLE SSD', type: 'SSD', size: 1000204886016, interfaceType: 'PCIe', smartStatus: 'OK', temperature: 35 }
  ],
  gpus: [
    { vendor: 'Apple', model: 'M2 Max', vram: 0, driver: 'Apple', temperatureGpu: 40, utilizationGpu: 10 }
  ],
  usb: [
    { name: 'USB-C Keyboard', bus: 1, type: 'HID' }
  ],
  bios: { vendor: 'Apple', version: '10151', releaseDate: '2024-01-01' },
  baseboard: { manufacturer: 'Apple', model: 'MacBookPro18,2', memSlots: 0 }
};

vi.mock('@/components/layout/ProShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="pro-shell">{children}</div>
}));

describe('HardwarePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(() => 
      Promise.resolve({ ok: true, json: async () => mockHardwareSnapshot })
    );
  });

  const renderPage = async () => {
    await act(async () => {
      render(<HardwarePage />);
    });
  };

  it('renders system information', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getAllByText('server-1').length).toBeGreaterThan(0));
    expect(screen.getAllByText('MacBook Pro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('darwin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('arm64').length).toBeGreaterThan(0);
  });

  it('renders CPU information', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getAllByText('M2 Max').length).toBeGreaterThan(0));
    expect(screen.getAllByText('3.5 GHz').length).toBeGreaterThan(0);
  });

  it('renders memory information', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getAllByText(/GiB/).length).toBeGreaterThan(0));
  });

  it('renders temperature sensors', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('Temperature Sensors')).toBeDefined());
    expect(screen.getAllByText(/45°C/).length).toBeGreaterThan(0);
  });

  it('renders hardware tables', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText('Memory Modules')).toBeDefined());
    expect(screen.getByText('BANK 0')).toBeDefined();
    expect(screen.getByText('Storage Devices')).toBeDefined();
    expect(screen.getByText('APPLE SSD')).toBeDefined();
  });
});
