export interface NginxStatus {
    running: boolean;
    pid: number | null;
    version: string;
    configPath: string;
    uptime: string;
    workerProcesses: number;
}

export interface NginxConnection {
    active: number;
    reading: number;
    writing: number;
    waiting: number;
    accepts: number;
    handled: number;
    requests: number;
}

export interface NginxVirtualHost {
    name: string;
    filename: string;
    enabled: boolean;
    serverNames: string[];
    listenPorts: string[];
    root: string;
    sslEnabled: boolean;
    proxyPass: string;
    raw: string;
}

export interface NginxLogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export interface NginxConfigTest {
    success: boolean;
    output: string;
}

export interface NginxSnapshot {
    timestamp: string;
    source: 'live' | 'mock';
    available: boolean;
    status: NginxStatus;
    connections: NginxConnection | null;
    virtualHosts: NginxVirtualHost[];
    summary: {
        totalVhosts: number;
        enabledVhosts: number;
        sslVhosts: number;
        totalRequests: number;
    };
}
