export type ServiceState =
  | 'active'
  | 'inactive'
  | 'failed'
  | 'activating'
  | 'deactivating'
  | 'reloading'
  | 'unknown';
export type ServiceSubState =
  | 'running'
  | 'exited'
  | 'dead'
  | 'waiting'
  | 'start-pre'
  | 'start'
  | 'stop'
  | 'stop-post'
  | 'failed'
  | 'auto-restart'
  | 'listening'
  | 'mounted'
  | 'plugged'
  | 'unknown';
export type ServiceType = 'simple' | 'forking' | 'oneshot' | 'dbus' | 'notify' | 'idle' | 'unknown';

export interface ServiceUnit {
  name: string;
  description: string;
  loadState: string;
  activeState: ServiceState;
  subState: ServiceSubState;
  type: ServiceType;
  mainPid: number;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  uptimeSeconds: number;
  restartCount: number;
  enabled: boolean;
  unitFileState: string;
  fragmentPath: string;
  triggeredBy?: string;
  wants?: string[];
  requires?: string[];
  after?: string[];
}

export interface ServiceLogEntry {
  timestamp: string;
  priority: 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug';
  message: string;
  unit: string;
}

export interface ServiceAlertSummary {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  service: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ServiceTimerInfo {
  name: string;
  nextRun: string;
  lastRun: string;
  activates: string;
  persistent: boolean;
}

export interface ServiceResourceHistory {
  timestamp: string;
  services: Array<{
    name: string;
    cpuPercent: number;
    memoryBytes: number;
  }>;
}

export interface ServicesSnapshot {
  source: 'systemd' | 'mock';
  systemdAvailable: boolean;
  systemdError?: string;
  summary: {
    total: number;
    running: number;
    exited: number;
    failed: number;
    inactive: number;
    enabled: number;
    disabled: number;
    healthScore: number;
  };
  services: ServiceUnit[];
  timers: ServiceTimerInfo[];
  alerts: ServiceAlertSummary[];
  history: ServiceResourceHistory[];
  timestamp: string;
}
