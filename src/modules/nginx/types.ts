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
  id?: string;
  name: string;
  filename: string;
  enabled: boolean;
  loaded?: boolean;
  managed?: boolean;
  sourcePath?: string;
  sourceLine?: number;
  serverNames: string[];
  primaryServerName?: string;
  wildcard?: boolean;
  listenPorts: string[];
  listen?: NginxListenDirective[];
  root: string;
  sslEnabled: boolean;
  tls?: NginxTlsDetails;
  proxyPass: string;
  locations?: NginxLocation[];
  redirects?: NginxRedirect[];
  warnings?: string[];
  raw: string;
}

export interface NginxListenDirective {
  value: string;
  port?: number;
  ssl: boolean;
  http2: boolean;
  defaultServer: boolean;
}

export interface NginxTlsDetails {
  enabled: boolean;
  certificate?: string;
  certificateKey?: string;
  certbotManaged: boolean;
}

export interface NginxLocation {
  path: string;
  proxyPass?: string;
  root?: string;
  directives: Record<string, string>;
}

export interface NginxRedirect {
  code: number;
  target?: string;
  raw: string;
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
