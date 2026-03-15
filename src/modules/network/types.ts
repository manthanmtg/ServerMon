export interface NetworkInterface {
  iface: string;
  ip4: string;
  ip6: string;
  mac: string;
  internal: boolean;
  virtual: boolean;
  operstate: string;
  type: string;
  duplex: string;
  mtu: number;
  speed: number;
  carrierChanges: number;
}

export interface NetworkStats {
  iface: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  rx_dropped: number;
  tx_dropped: number;
  rx_sec: number;
  tx_sec: number;
  ms: number;
}

export interface NetworkConnection {
  protocol: string;
  localAddress: string;
  localPort: string;
  peerAddress: string;
  peerPort: string;
  state: string;
  process: string;
  pid?: number;
}

export interface NetworkAlertSummary {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface NetworkSnapshot {
  timestamp: string;
  interfaces: NetworkInterface[];
  stats: NetworkStats[];
  connections: NetworkConnection[];
  alerts: NetworkAlertSummary[];
  history: {
    timestamp: string;
    stats: {
      iface: string;
      rx_sec: number;
      tx_sec: number;
    }[];
  }[];
}
