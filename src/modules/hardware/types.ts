export interface CpuInfo {
    manufacturer: string;
    brand: string;
    speed: number;
    speedMin: number;
    speedMax: number;
    cores: number;
    physicalCores: number;
    processors: number;
    socket: string;
    vendor: string;
    family: string;
    model: string;
    stepping: string;
    cache: {
        l1d: number;
        l1i: number;
        l2: number;
        l3: number;
    };
}

export interface CpuTemperature {
    main: number;
    cores: number[];
    max: number;
    socket: number[];
}

export interface MemoryInfo {
    total: number;
    free: number;
    used: number;
    active: number;
    available: number;
    swaptotal: number;
    swapused: number;
    swapfree: number;
}

export interface MemoryLayout {
    size: number;
    bank: string;
    type: string;
    ecc: boolean;
    clockSpeed: number;
    formFactor: string;
    manufacturer: string;
    partNum: string;
    voltageConfigured: number;
}

export interface DiskDevice {
    device: string;
    type: string;
    name: string;
    vendor: string;
    size: number;
    serialNum: string;
    interfaceType: string;
    smartStatus: string;
    temperature: number;
}

export interface GpuInfo {
    vendor: string;
    model: string;
    bus: string;
    vram: number;
    driver: string;
    temperatureGpu: number;
    utilizationGpu: number;
    memoryUsed: number;
    memoryTotal: number;
}

export interface UsbDevice {
    bus: number;
    deviceId: number;
    id: number;
    name: string;
    type: string;
    removable: boolean;
    vendor: string;
    manufacturer: string;
    serial: string;
}

export interface SystemInfo {
    manufacturer: string;
    model: string;
    version: string;
    serial: string;
    uuid: string;
    sku: string;
}

export interface BiosInfo {
    vendor: string;
    version: string;
    releaseDate: string;
    revision: string;
    serial: string;
}

export interface BaseboardInfo {
    manufacturer: string;
    model: string;
    version: string;
    serial: string;
    assetTag: string;
    memMax: number;
    memSlots: number;
}

export interface OsInfo {
    platform: string;
    distro: string;
    release: string;
    codename: string;
    kernel: string;
    arch: string;
    hostname: string;
    fqdn: string;
}

export interface HardwareSnapshot {
    timestamp: string;
    source: 'live' | 'mock';
    system: SystemInfo;
    bios: BiosInfo;
    baseboard: BaseboardInfo;
    os: OsInfo;
    cpu: CpuInfo;
    cpuTemperature: CpuTemperature;
    memory: MemoryInfo;
    memoryLayout: MemoryLayout[];
    disks: DiskDevice[];
    gpus: GpuInfo[];
    usb: UsbDevice[];
    uptime: number;
}
