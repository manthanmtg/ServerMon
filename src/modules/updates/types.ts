export interface PackageUpdate {
  name: string;
  currentVersion: string;
  newVersion: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repository: string;
  category: 'security' | 'regular' | 'optional' | 'language';
  description?: string;
  changelog?: string;
  size?: number;
  manager: 'apt' | 'dnf' | 'npm' | 'pip' | 'snap' | 'flatpak';
}

export interface UpdateHistoryEntry {
  id: string;
  timestamp: string;
  packages: string[];
  count: number;
  success: boolean;
  error?: string;
  osVersion?: string;
}

export interface UpdateAlertSummary {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface UpdateSnapshot {
  timestamp: string;
  osName: string;
  osVersion: string;
  packageManager: string;
  updates: PackageUpdate[];
  counts: {
    security: number;
    regular: number;
    optional: number;
    language: number;
  };
  pendingRestart: boolean;
  restartRequiredBy: string[];
  lastCheck: string;
  nextCheck?: string;
  history: UpdateHistoryEntry[];
  alerts: UpdateAlertSummary[];
}
