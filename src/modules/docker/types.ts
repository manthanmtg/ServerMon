export interface DockerContainerSummary {
    id: string;
    name: string;
    image: string;
    imageId?: string;
    command?: string;
    state: string;
    status: string;
    createdAt: string;
    ports: string[];
    networks: string[];
    mounts: { source: string; destination: string; mode: string; rw: boolean }[];
    env: string[];
    restartCount: number;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsageBytes: number;
    memoryLimitBytes: number;
    blockReadBytes: number;
    blockWriteBytes: number;
    networkInBytes: number;
    networkOutBytes: number;
}

export interface DockerImageSummary {
    id: string;
    repository: string;
    tag: string;
    sizeBytes: number;
    createdAt: string;
    containersUsing: number;
}

export interface DockerVolumeSummary {
    name: string;
    driver: string;
    mountpoint?: string;
    scope?: string;
}

export interface DockerNetworkSummary {
    id: string;
    name: string;
    driver: string;
    scope?: string;
}

export interface DockerEventEntry {
    id: string;
    time: string;
    action: string;
    type: string;
    actor: string;
    attributes: Record<string, string>;
}

export interface DockerAlertSummary {
    id: string;
    severity: 'warning' | 'critical';
    title: string;
    message: string;
    source: string;
    active: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
}

export interface DockerSnapshot {
    source: 'docker' | 'mock' | 'crictl';
    daemonReachable: boolean;
    daemonError?: string;
    daemon: {
        name: string;
        serverVersion: string;
        apiVersion: string;
        operatingSystem: string;
        architecture: string;
        containersRunning: number;
        containersStopped: number;
        containersPaused: number;
        storageDriver: string;
        cgroupVersion?: string;
    };
    diskUsage: {
        imagesBytes: number;
        containersBytes: number;
        volumesBytes: number;
        buildCacheBytes: number;
        totalBytes: number;
        usedPercent: number;
    };
    containers: DockerContainerSummary[];
    images: DockerImageSummary[];
    volumes: DockerVolumeSummary[];
    networks: DockerNetworkSummary[];
    events: DockerEventEntry[];
    alerts: DockerAlertSummary[];
    history: Array<{
        timestamp: string;
        containers: Array<{
            id: string;
            name: string;
            cpuPercent: number;
            memoryPercent: number;
            blockReadBytes: number;
            blockWriteBytes: number;
            networkInBytes: number;
            networkOutBytes: number;
        }>;
    }>;
    timestamp: string;
}
