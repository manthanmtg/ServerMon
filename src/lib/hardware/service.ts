import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { createLogger } from '@/lib/logger';
import type {
    CpuInfo,
    CpuTemperature,
    MemoryInfo,
    MemoryLayout,
    DiskDevice,
    GpuInfo,
    UsbDevice,
    OsInfo,
    HardwareSnapshot,
} from '@/modules/hardware/types';

const execFileAsync = promisify(execFile);
const log = createLogger('hardware');

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 });
        return stdout;
    } catch (err: unknown) {
        const error = err as { stdout?: string };
        if (error.stdout) return error.stdout;
        throw err;
    }
}

async function getCpuInfo(): Promise<CpuInfo> {
    const cpus = os.cpus();
    const first = cpus[0];
    const speeds = cpus.map(c => c.speed);
    const physicalCores = cpus.length;

    const brand = first?.model || 'Unknown';
    let manufacturer = 'Unknown';
    if (brand.includes('Intel')) manufacturer = 'Intel';
    else if (brand.includes('AMD')) manufacturer = 'AMD';
    else if (brand.includes('Apple')) manufacturer = 'Apple';

    return {
        manufacturer,
        brand: brand.trim(),
        speed: first?.speed ? first.speed / 1000 : 0,
        speedMin: Math.min(...speeds) / 1000,
        speedMax: Math.max(...speeds) / 1000,
        cores: cpus.length,
        physicalCores,
        processors: 1,
        socket: '',
        vendor: manufacturer,
        family: '',
        model: '',
        stepping: '',
        cache: { l1d: 0, l1i: 0, l2: 0, l3: 0 },
    };
}

async function getCpuTemperature(): Promise<CpuTemperature> {
    const result: CpuTemperature = { main: 0, cores: [], max: 0, socket: [] };

    try {
        if (process.platform === 'linux') {
            const raw = await execCmd('cat', ['/sys/class/thermal/thermal_zone0/temp']);
            const temp = parseInt(raw.trim(), 10) / 1000;
            if (!isNaN(temp)) {
                result.main = temp;
                result.max = temp;
                result.cores = [temp];
            }
        } else if (process.platform === 'darwin') {
            // macOS doesn't expose temps easily without sudo/SMC tools
            // Return 0 gracefully
        }
    } catch {
        // Temperature reading not available
    }

    return result;
}

function getMemoryInfo(): MemoryInfo {
    return {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        active: os.totalmem() - os.freemem(),
        available: os.freemem(),
        swaptotal: 0,
        swapused: 0,
        swapfree: 0,
    };
}

async function getMemoryLayout(): Promise<MemoryLayout[]> {
    if (process.platform !== 'linux') return [];
    try {
        const raw = await execCmd('dmidecode', ['-t', 'memory']);
        const modules: MemoryLayout[] = [];
        const sections = raw.split('Memory Device');
        for (const section of sections.slice(1)) {
            const sizeMatch = section.match(/Size:\s*(\d+)\s*(MB|GB)/i);
            if (!sizeMatch) continue;
            const size = parseInt(sizeMatch[1], 10) * (sizeMatch[2].toUpperCase() === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
            const typeMatch = section.match(/Type:\s*(.+)/);
            const speedMatch = section.match(/Speed:\s*(\d+)/);
            const mfgMatch = section.match(/Manufacturer:\s*(.+)/);
            const bankMatch = section.match(/Bank Locator:\s*(.+)/);
            const partMatch = section.match(/Part Number:\s*(.+)/);
            const formMatch = section.match(/Form Factor:\s*(.+)/);

            modules.push({
                size,
                bank: bankMatch?.[1]?.trim() || '',
                type: typeMatch?.[1]?.trim() || 'Unknown',
                ecc: section.includes('ECC'),
                clockSpeed: speedMatch ? parseInt(speedMatch[1], 10) : 0,
                formFactor: formMatch?.[1]?.trim() || '',
                manufacturer: mfgMatch?.[1]?.trim() || '',
                partNum: partMatch?.[1]?.trim() || '',
                voltageConfigured: 0,
            });
        }
        return modules;
    } catch {
        return [];
    }
}

async function getDiskDevices(): Promise<DiskDevice[]> {
    try {
        if (process.platform === 'linux') {
            const raw = await execCmd('lsblk', ['-Jb', '-o', 'NAME,TYPE,SIZE,MODEL,SERIAL,TRAN']);
            const parsed = JSON.parse(raw);
            const devices: DiskDevice[] = [];
            for (const dev of parsed.blockdevices || []) {
                if (dev.type !== 'disk') continue;
                devices.push({
                    device: `/dev/${dev.name}`,
                    type: dev.tran || 'unknown',
                    name: dev.model || dev.name,
                    vendor: '',
                    size: parseInt(dev.size, 10) || 0,
                    serialNum: dev.serial || '',
                    interfaceType: dev.tran || '',
                    smartStatus: 'unknown',
                    temperature: 0,
                });
            }
            return devices;
        } else if (process.platform === 'darwin') {
            const raw = await execCmd('diskutil', ['list', '-plist']);
            // Simplified: just list basic disks
            const devices: DiskDevice[] = [];
            const lines = raw.split('\n');
            for (const line of lines) {
                const match = line.match(/<string>(\/dev\/disk\d+)<\/string>/);
                if (match) {
                    devices.push({
                        device: match[1],
                        type: 'disk',
                        name: match[1],
                        vendor: 'Apple',
                        size: 0,
                        serialNum: '',
                        interfaceType: '',
                        smartStatus: 'unknown',
                        temperature: 0,
                    });
                }
            }
            return devices;
        }
    } catch {
        // fallback
    }
    return [];
}

async function getGpuInfo(): Promise<GpuInfo[]> {
    try {
        if (process.platform === 'linux') {
            const raw = await execCmd('lspci', ['-vmm']);
            const gpus: GpuInfo[] = [];
            const sections = raw.split('\n\n');
            for (const section of sections) {
                if (!section.includes('VGA') && !section.includes('3D') && !section.includes('Display')) continue;
                const vendorMatch = section.match(/Vendor:\s*(.+)/);
                const deviceMatch = section.match(/Device:\s*(.+)/);
                gpus.push({
                    vendor: vendorMatch?.[1]?.trim() || '',
                    model: deviceMatch?.[1]?.trim() || '',
                    bus: '',
                    vram: 0,
                    driver: '',
                    temperatureGpu: 0,
                    utilizationGpu: 0,
                    memoryUsed: 0,
                    memoryTotal: 0,
                });
            }
            return gpus;
        }
    } catch {
        // GPU info not available
    }
    return [];
}

async function getUsbDevices(): Promise<UsbDevice[]> {
    try {
        if (process.platform === 'linux') {
            const raw = await execCmd('lsusb', []);
            const devices: UsbDevice[] = [];
            for (const line of raw.split('\n')) {
                const match = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+\S+\s+(.*)/);
                if (match) {
                    devices.push({
                        bus: parseInt(match[1], 10),
                        deviceId: parseInt(match[2], 10),
                        id: 0,
                        name: match[3]?.trim() || 'Unknown',
                        type: '',
                        removable: false,
                        vendor: '',
                        manufacturer: '',
                        serial: '',
                    });
                }
            }
            return devices;
        } else if (process.platform === 'darwin') {
            const raw = await execCmd('system_profiler', ['SPUSBDataType', '-detailLevel', 'mini']);
            const devices: UsbDevice[] = [];
            const nameRegex = /^\s{4,8}(\S.+):$/gm;
            let match;
            while ((match = nameRegex.exec(raw)) !== null) {
                devices.push({
                    bus: 0,
                    deviceId: 0,
                    id: 0,
                    name: match[1].trim(),
                    type: 'USB',
                    removable: false,
                    vendor: '',
                    manufacturer: '',
                    serial: '',
                });
            }
            return devices;
        }
    } catch {
        // USB enumeration not available
    }
    return [];
}

function getOsInfo(): OsInfo {
    return {
        platform: process.platform,
        distro: '',
        release: os.release(),
        codename: '',
        kernel: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        fqdn: os.hostname(),
    };
}

function getMockData(): HardwareSnapshot {
    return {
        timestamp: new Date().toISOString(),
        source: 'mock',
        system: { manufacturer: 'Dell Inc.', model: 'PowerEdge R740', version: '', serial: 'ABC123', uuid: '', sku: '' },
        bios: { vendor: 'Dell Inc.', version: '2.14.1', releaseDate: '2023-06-15', revision: '', serial: '' },
        baseboard: { manufacturer: 'Dell Inc.', model: '0X8DXD', version: 'A01', serial: 'DEF456', assetTag: '', memMax: 3145728, memSlots: 16 },
        os: { platform: 'linux', distro: 'Ubuntu', release: '22.04', codename: 'jammy', kernel: '5.15.0-91-generic', arch: 'x64', hostname: 'server-01', fqdn: 'server-01.example.com' },
        cpu: {
            manufacturer: 'Intel', brand: 'Intel Xeon Gold 6248R', speed: 3.0, speedMin: 1.2, speedMax: 4.0,
            cores: 48, physicalCores: 24, processors: 2, socket: 'FCLGA3647',
            vendor: 'Intel', family: '6', model: '85', stepping: '7',
            cache: { l1d: 32768, l1i: 32768, l2: 1048576, l3: 36700160 },
        },
        cpuTemperature: { main: 42, cores: [40, 41, 43, 42, 44, 39], max: 44, socket: [42] },
        memory: { total: 137438953472, free: 68719476736, used: 68719476736, active: 51539607552, available: 85899345920, swaptotal: 8589934592, swapused: 0, swapfree: 8589934592 },
        memoryLayout: [
            { size: 17179869184, bank: 'DIMM A1', type: 'DDR4', ecc: true, clockSpeed: 2933, formFactor: 'DIMM', manufacturer: 'Samsung', partNum: 'M393A2K43CB2-CVF', voltageConfigured: 1.2 },
            { size: 17179869184, bank: 'DIMM A2', type: 'DDR4', ecc: true, clockSpeed: 2933, formFactor: 'DIMM', manufacturer: 'Samsung', partNum: 'M393A2K43CB2-CVF', voltageConfigured: 1.2 },
        ],
        disks: [
            { device: '/dev/sda', type: 'SSD', name: 'Samsung SSD 870 EVO', vendor: 'Samsung', size: 500107862016, serialNum: 'S5XXNF0R', interfaceType: 'SATA', smartStatus: 'OK', temperature: 32 },
            { device: '/dev/sdb', type: 'HDD', name: 'WDC WD40EFRX-68N', vendor: 'WDC', size: 4000787030016, serialNum: 'WD-WCC7K3', interfaceType: 'SATA', smartStatus: 'OK', temperature: 36 },
        ],
        gpus: [{ vendor: 'NVIDIA', model: 'Tesla T4', bus: '00:1e.0', vram: 16384, driver: '535.129.03', temperatureGpu: 38, utilizationGpu: 5, memoryUsed: 512, memoryTotal: 16384 }],
        usb: [
            { bus: 1, deviceId: 1, id: 0, name: 'Linux Foundation 3.0 root hub', type: 'Hub', removable: false, vendor: '', manufacturer: 'Linux', serial: '' },
            { bus: 2, deviceId: 1, id: 0, name: 'iDRAC Virtual Console', type: 'HID', removable: false, vendor: 'Dell', manufacturer: 'Dell', serial: '' },
        ],
        uptime: os.uptime(),
    };
}

async function getSnapshot(): Promise<HardwareSnapshot> {
    try {
        const [cpu, cpuTemperature, memoryLayout, disks, gpus, usb] = await Promise.all([
            getCpuInfo(),
            getCpuTemperature(),
            getMemoryLayout(),
            getDiskDevices(),
            getGpuInfo(),
            getUsbDevices(),
        ]);

        const memory = getMemoryInfo();
        const osInfo = getOsInfo();

        // If we got basically nothing, return mock
        if (cpu.brand === 'Unknown' && disks.length === 0) {
            return getMockData();
        }

        return {
            timestamp: new Date().toISOString(),
            source: 'live',
            system: { manufacturer: '', model: '', version: '', serial: '', uuid: '', sku: '' },
            bios: { vendor: '', version: '', releaseDate: '', revision: '', serial: '' },
            baseboard: { manufacturer: '', model: '', version: '', serial: '', assetTag: '', memMax: 0, memSlots: 0 },
            os: osInfo,
            cpu,
            cpuTemperature,
            memory,
            memoryLayout,
            disks,
            gpus,
            usb,
            uptime: os.uptime(),
        };
    } catch (err) {
        log.error('Failed to get hardware snapshot', err);
        return getMockData();
    }
}

export const hardwareService = {
    getSnapshot,
};
