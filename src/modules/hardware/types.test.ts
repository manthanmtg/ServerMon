/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import type {
  CpuInfo,
  CpuTemperature,
  MemoryInfo,
  MemoryLayout,
  DiskDevice,
  GpuInfo,
  UsbDevice,
  SystemInfo,
  BiosInfo,
  BaseboardInfo,
  OsInfo,
  HardwareSnapshot,
} from './types';

describe('hardware type shapes', () => {
  it('CpuInfo captures processor details', () => {
    const cpu: CpuInfo = {
      manufacturer: 'Intel',
      brand: 'Core i7-12700K',
      speed: 3.6,
      speedMin: 0.8,
      speedMax: 5.0,
      cores: 12,
      physicalCores: 8,
      processors: 1,
      socket: 'LGA1700',
      vendor: 'Intel',
      family: '6',
      model: '151',
      stepping: '2',
      cache: { l1d: 49152, l1i: 32768, l2: 12288, l3: 25165824 },
    };
    expect(cpu.manufacturer).toBe('Intel');
    expect(cpu.cores).toBe(12);
    expect(cpu.cache.l3).toBeGreaterThan(cpu.cache.l2);
  });

  it('CpuTemperature tracks main and per-core temps', () => {
    const temp: CpuTemperature = {
      main: 55,
      cores: [50, 52, 55, 53],
      max: 55,
      socket: [55],
    };
    expect(temp.main).toBe(55);
    expect(temp.cores).toHaveLength(4);
    expect(Math.max(...temp.cores)).toBe(temp.max);
  });

  it('MemoryInfo tracks total, used, and swap', () => {
    const mem: MemoryInfo = {
      total: 17179869184,
      free: 8589934592,
      used: 8589934592,
      active: 6442450944,
      available: 10737418240,
      swaptotal: 2147483648,
      swapused: 0,
      swapfree: 2147483648,
    };
    expect(mem.total).toBe(mem.free + mem.used);
    expect(mem.swapused).toBe(0);
  });

  it('MemoryLayout captures DIMM slot info', () => {
    const slot: MemoryLayout = {
      size: 8589934592,
      bank: 'BANK 0',
      type: 'DDR5',
      ecc: false,
      clockSpeed: 4800,
      formFactor: 'DIMM',
      manufacturer: 'Kingston',
      partNum: 'KF548C38-8',
      voltageConfigured: 1.1,
    };
    expect(slot.type).toBe('DDR5');
    expect(slot.size).toBe(8589934592);
  });

  it('DiskDevice tracks drive info', () => {
    const disk: DiskDevice = {
      device: '/dev/sda',
      type: 'SSD',
      name: 'Samsung 870 EVO',
      vendor: 'Samsung',
      size: 1099511627776,
      serialNum: 'S4EMNX0R123456',
      interfaceType: 'SATA',
      smartStatus: 'Passed',
      temperature: 35,
    };
    expect(disk.device).toBe('/dev/sda');
    expect(disk.smartStatus).toBe('Passed');
    expect(disk.temperature).toBe(35);
  });

  it('GpuInfo captures GPU metrics', () => {
    const gpu: GpuInfo = {
      vendor: 'NVIDIA',
      model: 'RTX 4080',
      bus: 'PCIe',
      vram: 17179869184,
      driver: '535.113.01',
      temperatureGpu: 72,
      utilizationGpu: 85,
      memoryUsed: 8589934592,
      memoryTotal: 17179869184,
    };
    expect(gpu.vendor).toBe('NVIDIA');
    expect(gpu.utilizationGpu).toBe(85);
    expect(gpu.memoryUsed).toBeLessThanOrEqual(gpu.memoryTotal);
  });

  it('UsbDevice captures bus and device info', () => {
    const usb: UsbDevice = {
      bus: 1,
      deviceId: 3,
      id: 1003,
      name: 'USB Keyboard',
      type: 'HID',
      removable: false,
      vendor: 'Logitech',
      manufacturer: 'Logitech',
      serial: '',
    };
    expect(usb.type).toBe('HID');
    expect(usb.removable).toBe(false);
  });

  it('SystemInfo captures system identifiers', () => {
    const sys: SystemInfo = {
      manufacturer: 'ASUSTeK',
      model: 'ROG MAXIMUS Z790',
      version: 'Rev 1.xx',
      serial: 'SN12345',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      sku: 'SKU0001',
    };
    expect(sys.manufacturer).toBe('ASUSTeK');
  });

  it('BiosInfo captures firmware details', () => {
    const bios: BiosInfo = {
      vendor: 'American Megatrends',
      version: '1401',
      releaseDate: '2023-10-15',
      revision: '5.27',
      serial: '',
    };
    expect(bios.vendor).toBe('American Megatrends');
  });

  it('BaseboardInfo includes memory capacity', () => {
    const board: BaseboardInfo = {
      manufacturer: 'ASUSTeK',
      model: 'ROG MAXIMUS Z790',
      version: 'Rev 1.xx',
      serial: 'MB123',
      assetTag: '',
      memMax: 137438953472,
      memSlots: 4,
    };
    expect(board.memSlots).toBe(4);
    expect(board.memMax).toBeGreaterThan(0);
  });

  it('OsInfo captures OS details', () => {
    const os: OsInfo = {
      platform: 'linux',
      distro: 'Ubuntu',
      release: '22.04',
      codename: 'jammy',
      kernel: '5.15.0-89-generic',
      arch: 'x64',
      hostname: 'myserver',
      fqdn: 'myserver.example.com',
    };
    expect(os.platform).toBe('linux');
    expect(os.distro).toBe('Ubuntu');
  });

  it('HardwareSnapshot wraps all hardware components', () => {
    const snapshot: HardwareSnapshot = {
      timestamp: '2026-03-18T00:00:00Z',
      source: 'live',
      system: {
        manufacturer: 'Dell',
        model: 'PowerEdge R720',
        version: '',
        serial: 'SN001',
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        sku: '',
      },
      bios: {
        vendor: 'Dell Inc.',
        version: '2.7.1',
        releaseDate: '2020-01-01',
        revision: '',
        serial: '',
      },
      baseboard: {
        manufacturer: 'Dell',
        model: 'PowerEdge R720',
        version: '',
        serial: '',
        assetTag: '',
        memMax: 274877906944,
        memSlots: 24,
      },
      os: {
        platform: 'linux',
        distro: 'Ubuntu',
        release: '22.04',
        codename: 'jammy',
        kernel: '5.15.0',
        arch: 'x64',
        hostname: 'server01',
        fqdn: 'server01.local',
      },
      cpu: {
        manufacturer: 'Intel',
        brand: 'Xeon E5-2670',
        speed: 2.6,
        speedMin: 1.2,
        speedMax: 3.3,
        cores: 16,
        physicalCores: 8,
        processors: 2,
        socket: 'LGA2011',
        vendor: 'Intel',
        family: '6',
        model: '45',
        stepping: '7',
        cache: { l1d: 32768, l1i: 32768, l2: 2097152, l3: 20971520 },
      },
      cpuTemperature: { main: 45, cores: [], max: 45, socket: [] },
      memory: {
        total: 274877906944,
        free: 137438953472,
        used: 137438953472,
        active: 100000000000,
        available: 174877906944,
        swaptotal: 8589934592,
        swapused: 0,
        swapfree: 8589934592,
      },
      memoryLayout: [],
      disks: [],
      gpus: [],
      usb: [],
      uptime: 1209600,
    };
    expect(snapshot.source).toBe('live');
    expect(snapshot.uptime).toBe(1209600);
    expect(snapshot.cpu.processors).toBe(2);
  });
});
