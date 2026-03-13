export type CronSource = 'user' | 'system' | 'etc-cron.d' | 'etc-cron.daily' | 'etc-cron.hourly' | 'etc-cron.weekly' | 'etc-cron.monthly';

export interface CronJob {
    id: string;
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
    command: string;
    expression: string;
    user: string;
    source: CronSource;
    sourceFile?: string;
    enabled: boolean;
    comment?: string;
    nextRuns: string[];
    lastRun?: string;
    description?: string;
}

export interface CronLogEntry {
    timestamp: string;
    user: string;
    command: string;
    pid: number;
    message: string;
}

export interface SystemCronDir {
    name: string;
    path: string;
    count: number;
    scripts: string[];
}

export interface CronsSnapshot {
    source: 'crontab' | 'mock';
    crontabAvailable: boolean;
    crontabError?: string;
    summary: {
        total: number;
        active: number;
        disabled: number;
        userCrons: number;
        systemCrons: number;
        nextRunJob?: string;
        nextRunTime?: string;
    };
    jobs: CronJob[];
    systemDirs: SystemCronDir[];
    recentLogs: CronLogEntry[];
    timestamp: string;
}

export interface CronCreateRequest {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
    command: string;
    comment?: string;
    user?: string;
}

export interface CronUpdateRequest {
    minute?: string;
    hour?: string;
    dayOfMonth?: string;
    month?: string;
    dayOfWeek?: string;
    command?: string;
    comment?: string;
    enabled?: boolean;
}
