export interface ProcessInfo {
  pid: number;
  parentPid: number;
  name: string;
  command: string;
  path: string;
  user: string;
  state: string;
  cpu: number;
  mem: number;
  memRss: number;
  started: string;
  priority: number;
}

export interface ProcessSummary {
  total: number;
  running: number;
  sleeping: number;
  blocked: number;
  cpuLoad: number;
  memTotal: number;
  memUsed: number;
  memPercent: number;
}

export type ProcessSortField = 'cpu' | 'mem' | 'pid' | 'name' | 'user';
