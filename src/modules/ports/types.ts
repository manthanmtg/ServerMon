export interface ListeningPort {
  protocol: 'tcp' | 'udp' | 'tcp6' | 'udp6';
  port: number;
  address: string;
  pid: number | null;
  process: string;
  user: string;
  state: string;
  family: 'IPv4' | 'IPv6';
}

export interface FirewallRule {
  chain: string;
  action: string;
  protocol: string;
  port: string;
  source: string;
  destination: string;
  raw: string;
}

export interface PortCheckResult {
  port: number;
  available: boolean;
  process?: string;
  pid?: number;
}

export interface PortsSnapshot {
  timestamp: string;
  source: 'live' | 'mock';
  listening: ListeningPort[];
  summary: {
    totalListening: number;
    tcpCount: number;
    udpCount: number;
    uniqueProcesses: number;
  };
  firewall: {
    available: boolean;
    backend: 'ufw' | 'iptables' | 'firewalld' | 'none';
    enabled: boolean;
    rules: FirewallRule[];
  };
}
