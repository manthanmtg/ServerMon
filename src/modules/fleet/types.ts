// Shared client-side types for fleet UI components.
export interface NodeListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  tunnelStatus: string;
  tags: string[];
  lastSeen?: string;
  agentVersion?: string;
  frpcVersion?: string;
  metrics?: { cpuLoad?: number; ramUsed?: number; uptime?: number };
}

export interface PairingTokenResponse {
  nodeId: string;
  pairingToken: string;
  hubUrl: string;
  bindPort: number;
}
