import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, access, unlink, writeFile, stat } from 'node:fs/promises';
import { openSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import type {
  CronJob,
  CronLogEntry,
  CronSource,
  CronsSnapshot,
  CronRunStatus,
  SystemCronDir,
  CronCreateRequest,
  CronUpdateRequest,
} from '@/modules/crons/types';

const execFileAsync = promisify(execFile);
const log = createLogger('crons');

let crontabChecked = false;
let crontabAvailable = false;

async function checkCrontab(): Promise<boolean> {
  if (crontabChecked) return crontabAvailable;
  try {
    await execFileAsync('crontab', ['-l'], { timeout: 5000 });
    crontabAvailable = true;
  } catch (err: unknown) {
    const error = err as { code?: number; stderr?: string };
    if (error.stderr?.includes('no crontab for')) {
      crontabAvailable = true;
    } else {
      crontabAvailable = false;
      log.warn('crontab not available, using mock data');
    }
  }
  crontabChecked = true;
  return crontabAvailable;
}

async function execCmd(cmd: string, args: string[], timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout;
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    if (error.stdout) return error.stdout;
    throw err;
  }
}

function makeId(user: string, expression: string, command: string): string {
  const hash = createHash('sha256').update(`${user}:${expression}:${command}`).digest('hex');
  return hash.slice(0, 12);
}

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export function computeNextRuns(
  minute: string,
  hour: string,
  dom: string,
  month: string,
  dow: string,
  count = 5,
  now = new Date()
): string[] {
  const runs: string[] = [];
  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const maxIterations = 525600;
  let iterations = 0;

  while (runs.length < count && iterations < maxIterations) {
    iterations++;
    const dayOfMonthMatches = matchesCronField(dom, cursor.getDate(), 1, 31);
    const monthMatches = matchesCronField(month, cursor.getMonth() + 1, 1, 12, MONTH_ALIASES);
    const dayOfWeekMatches = matchesCronField(dow, cursor.getDay(), 0, 7, DAY_ALIASES);
    const dayMatches =
      dom === '*' && dow === '*'
        ? true
        : dom === '*'
          ? dayOfWeekMatches
          : dow === '*'
            ? dayOfMonthMatches
            : dayOfMonthMatches || dayOfWeekMatches;

    if (
      matchesCronField(minute, cursor.getMinutes(), 0, 59) &&
      matchesCronField(hour, cursor.getHours(), 0, 23) &&
      monthMatches &&
      dayMatches
    ) {
      runs.push(cursor.toISOString());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return runs;
}

function parseCronAtom(token: string, aliases?: Record<string, number>): number | null {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  if (aliases && normalized in aliases) return aliases[normalized] ?? null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function matchesCronField(
  field: string,
  value: number,
  min: number,
  max: number,
  aliases?: Record<string, number>
): boolean {
  if (field === '*') return true;

  const isDayOfWeek = min === 0 && max === 7;
  const normalizedValue = isDayOfWeek && value === 7 ? 0 : value;
  const parts = field.split(',');
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    let rangePart = part;
    let step = 1;

    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const parsedStep = Number.parseInt(stepStr, 10);
      if (Number.isNaN(parsedStep) || parsedStep <= 0) continue;
      rangePart = range;
      step = parsedStep;
    }

    let start = min;
    let end = max;

    if (rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [startToken, endToken] = rangePart.split('-');
        const parsedStart = parseCronAtom(startToken, aliases);
        const parsedEnd = parseCronAtom(endToken, aliases);
        if (parsedStart === null || parsedEnd === null) continue;
        start = parsedStart;
        end = parsedEnd;
      } else {
        const parsed = parseCronAtom(rangePart, aliases);
        if (parsed === null) continue;
        start = parsed;
        end = parsed;
      }
    }

    for (let candidate = start; candidate <= end; candidate += step) {
      if (candidate < min || candidate > max) continue;
      if (candidate === normalizedValue) return true;
      if (isDayOfWeek && candidate === 7 && normalizedValue === 0) return true;
    }
  }

  return false;
}

interface ParseCronExpressionOptions {
  hasSystemUserField?: boolean;
}

function parseCronExpression(
  line: string,
  fallbackUser: string,
  source: CronSource,
  sourceFile?: string,
  options?: ParseCronExpressionOptions
): CronJob | null {
  // Handle @reboot, @hourly, etc.
  const specialMap: Record<string, string> = {
    '@reboot': '- - - - -',
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  let minute: string,
    hour: string,
    dayOfMonth: string,
    month: string,
    dayOfWeek: string,
    command: string;

  const firstToken = line.split(/\s+/)[0];
  let resolvedUser = fallbackUser;

  if (firstToken && specialMap[firstToken]) {
    const expanded = specialMap[firstToken].split(' ');
    [minute, hour, dayOfMonth, month, dayOfWeek] = expanded;

    const remainder = line.slice(firstToken.length).trim();
    if (options?.hasSystemUserField) {
      const remainderParts = remainder.split(/\s+/);
      if (remainderParts.length < 2) return null;
      resolvedUser = remainderParts[0] || fallbackUser;
      command = remainderParts.slice(1).join(' ');
    } else {
      command = remainder;
    }
  } else {
    const parts = line.split(/\s+/);
    const minimumPartCount = options?.hasSystemUserField ? 7 : 6;
    if (parts.length < minimumPartCount) return null;

    [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (options?.hasSystemUserField) {
      resolvedUser = parts[5] || fallbackUser;
      command = parts.slice(6).join(' ');
    } else {
      command = parts.slice(5).join(' ');
    }
  }

  if (!command) return null;

  const expression = `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  const nextRuns =
    minute === '-' ? [] : computeNextRuns(minute, hour, dayOfMonth, month, dayOfWeek);

  return {
    id: makeId(resolvedUser, expression, command),
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    command,
    expression,
    user: resolvedUser,
    source,
    sourceFile,
    enabled: true,
    nextRuns,
    description: describeSchedule(minute, hour, dayOfMonth, month, dayOfWeek),
  };
}

function parseCrontabLine(
  line: string,
  user: string,
  source: CronSource,
  sourceFile?: string
): CronJob | null {
  const trimmed = line.trim();
  const parseOptions: ParseCronExpressionOptions = {
    hasSystemUserField: source === 'etc-cron.d',
  };

  if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('#!'))) {
    if (trimmed.startsWith('#') && trimmed.length > 1) {
      const uncommented = trimmed.slice(1).trim();
      const job = parseCronExpression(uncommented, user, source, sourceFile, parseOptions);
      if (job) {
        job.enabled = false;
        job.comment = trimmed;
        return job;
      }
    }
    return null;
  }

  if (trimmed.includes('=') && !trimmed.match(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/)) {
    return null;
  }

  return parseCronExpression(trimmed, user, source, sourceFile, parseOptions);
}

function describeSchedule(
  minute: string,
  hour: string,
  dom: string,
  month: string,
  dow: string
): string {
  if (minute === '-') return 'On reboot';
  if (minute === '*' && hour === '*') return 'Every minute';
  if (minute === '0' && hour === '*') return 'Every hour';
  if (minute === '0' && hour === '0' && dom === '*' && month === '*' && dow === '*')
    return 'Daily at midnight';
  if (minute === '0' && hour === '0' && dom === '1' && month === '*' && dow === '*')
    return 'Monthly on the 1st';
  if (minute === '0' && hour === '0' && dom === '*' && month === '*' && dow === '0')
    return 'Weekly on Sunday';

  const parts: string[] = [];

  if (minute.includes('/')) parts.push(`Every ${minute.split('/')[1]} minutes`);
  else if (minute !== '*') parts.push(`At minute ${minute}`);

  if (hour.includes('/')) parts.push(`every ${hour.split('/')[1]} hours`);
  else if (hour !== '*') parts.push(`at hour ${hour}`);

  if (dom !== '*') parts.push(`on day ${dom}`);
  if (month !== '*') parts.push(`in month ${month}`);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (dow !== '*') {
    const dayParts = dow.split(',').map((d) => {
      const num = parseInt(d, 10);
      return isNaN(num) ? d : dayNames[num % 7] || d;
    });
    parts.push(`on ${dayParts.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' ') : `${minute} ${hour} ${dom} ${month} ${dow}`;
}

async function getUserCrontab(user?: string): Promise<string> {
  try {
    const args = user ? ['-u', user, '-l'] : ['-l'];
    return await execCmd('crontab', args);
  } catch (err: unknown) {
    const error = err as { stderr?: string };
    if (error.stderr?.includes('no crontab for')) return '';
    throw err;
  }
}

async function setUserCrontab(content: string, user?: string): Promise<void> {
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const tmpFile = join(tmpdir(), `crontab-${Date.now()}.tmp`);

  try {
    writeFileSync(tmpFile, content);
    const args = user ? ['-u', user, tmpFile] : [tmpFile];
    await execCmd('crontab', args, 15000);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

async function listUserJobs(): Promise<CronJob[]> {
  const raw = await getUserCrontab();
  const jobs: CronJob[] = [];
  const currentUser = process.env.USER || 'root';

  for (const line of raw.split('\n')) {
    const job = parseCrontabLine(line, currentUser, 'user');
    if (job) jobs.push(job);
  }

  return jobs;
}

async function listSystemCronDirs(): Promise<SystemCronDir[]> {
  const dirs: SystemCronDir[] = [];
  const cronDirs: Array<{ name: string; path: string; source: CronSource }> = [
    { name: 'cron.d', path: '/etc/cron.d', source: 'etc-cron.d' },
    { name: 'cron.daily', path: '/etc/cron.daily', source: 'etc-cron.daily' },
    { name: 'cron.hourly', path: '/etc/cron.hourly', source: 'etc-cron.hourly' },
    { name: 'cron.weekly', path: '/etc/cron.weekly', source: 'etc-cron.weekly' },
    { name: 'cron.monthly', path: '/etc/cron.monthly', source: 'etc-cron.monthly' },
  ];

  for (const dir of cronDirs) {
    try {
      await access(dir.path);
      const files = await readdir(dir.path);
      dirs.push({
        name: dir.name,
        path: dir.path,
        count: files.length,
        scripts: files.filter((f) => !f.startsWith('.')),
      });
    } catch {
      // directory doesn't exist or not readable
    }
  }

  return dirs;
}

async function listSystemCronJobs(): Promise<CronJob[]> {
  const jobs: CronJob[] = [];

  try {
    await access('/etc/cron.d');
    const files = await readdir('/etc/cron.d');
    for (const file of files) {
      if (file.startsWith('.')) continue;
      try {
        const content = await readFile(join('/etc/cron.d', file), 'utf-8');
        for (const line of content.split('\n')) {
          const job = parseCrontabLine(line, 'system', 'etc-cron.d', file);
          if (job) jobs.push(job);
        }
      } catch {
        /* skip unreadable files */
      }
    }
  } catch {
    /* /etc/cron.d not accessible */
  }

  return jobs;
}

async function getRecentLogs(count = 50): Promise<CronLogEntry[]> {
  try {
    const raw = await execCmd('journalctl', [
      '-u',
      'cron',
      '-n',
      String(Math.min(count, 200)),
      '--no-pager',
      '-o',
      'json',
    ]);

    const entries: CronLogEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        entries.push({
          timestamp: parsed.__REALTIME_TIMESTAMP
            ? new Date(Number(parsed.__REALTIME_TIMESTAMP) / 1000).toISOString()
            : new Date().toISOString(),
          user: parsed._UID || 'unknown',
          command: parsed.MESSAGE || '',
          pid: Number(parsed._PID) || 0,
          message: parsed.MESSAGE || '',
        });
      } catch {
        /* skip malformed json */
      }
    }
    return entries;
  } catch {
    // Try syslog fallback
    try {
      const raw = await execCmd('grep', ['CRON', '/var/log/syslog'], 5000);
      const lines = raw.split('\n').filter(Boolean).slice(-count);
      return lines.map((line, i) => ({
        timestamp: new Date().toISOString(),
        user: 'unknown',
        command: line,
        pid: i,
        message: line,
      }));
    } catch {
      return [];
    }
  }
}

// ---- Mock data for non-Linux environments ----

function generateMockJobs(): CronJob[] {
  const mockEntries = [
    { expr: '0 * * * *', cmd: '/usr/local/bin/health-check.sh', comment: 'Hourly health check' },
    {
      expr: '*/5 * * * *',
      cmd: '/opt/scripts/sync-data.py --quiet',
      comment: 'Sync data every 5 minutes',
    },
    {
      expr: '0 2 * * *',
      cmd: '/usr/local/bin/backup.sh /data /backup',
      comment: 'Daily backup at 2 AM',
    },
    {
      expr: '0 0 * * 0',
      cmd: '/opt/maintenance/weekly-cleanup.sh',
      comment: 'Weekly cleanup on Sunday',
    },
    {
      expr: '30 3 1 * *',
      cmd: '/usr/local/bin/monthly-report.sh --email admin@example.com',
      comment: 'Monthly report',
    },
    {
      expr: '*/15 * * * *',
      cmd: '/opt/monitoring/check-disk-space.sh --threshold 90',
      comment: 'Disk space check',
    },
    {
      expr: '0 6 * * 1-5',
      cmd: '/opt/scripts/daily-digest.py --send',
      comment: 'Weekday daily digest',
    },
    { expr: '0 0 1 1 *', cmd: '/opt/maintenance/annual-archive.sh', comment: 'Annual archive' },
    {
      expr: '*/30 * * * *',
      cmd: '/usr/bin/certbot renew --quiet',
      comment: 'Certificate renewal check',
    },
    {
      expr: '0 4 * * *',
      cmd: '/opt/scripts/log-rotate.sh --compress',
      comment: 'Log rotation at 4 AM',
    },
    {
      expr: '15 10 * * *',
      cmd: '/opt/monitoring/uptime-report.sh',
      comment: 'Daily uptime report',
    },
    {
      expr: '0 */6 * * *',
      cmd: '/opt/scripts/cache-warmup.py',
      comment: 'Cache warmup every 6 hours',
    },
  ];

  const currentUser = process.env.USER || 'root';
  return mockEntries.map((entry, index) => {
    const [minute, hour, dom, month, dow] = entry.expr.split(' ');
    const expression = entry.expr;
    const enabled = index !== 3;
    const nextRuns = computeNextRuns(minute, hour, dom, month, dow);

    return {
      id: makeId(currentUser, expression, entry.cmd),
      minute,
      hour,
      dayOfMonth: dom,
      month,
      dayOfWeek: dow,
      command: entry.cmd,
      expression,
      user: index < 8 ? currentUser : 'root',
      source: (index < 8 ? 'user' : 'system') as CronSource,
      sourceFile: index >= 8 ? 'cron.d/maintenance' : undefined,
      enabled,
      comment: entry.comment,
      nextRuns: enabled ? nextRuns : [],
      description: describeSchedule(minute, hour, dom, month, dow),
    };
  });
}

function generateMockLogs(): CronLogEntry[] {
  const commands = [
    'health-check.sh',
    'sync-data.py',
    'backup.sh',
    'check-disk-space.sh',
    'log-rotate.sh',
  ];
  const logs: CronLogEntry[] = [];
  const now = Date.now();

  for (let i = 0; i < 30; i++) {
    const cmd = commands[i % commands.length];
    logs.push({
      timestamp: new Date(now - i * 300_000).toISOString(),
      user: 'root',
      command: `/opt/scripts/${cmd}`,
      pid: 10000 + i,
      message: `(root) CMD (/opt/scripts/${cmd})`,
    });
  }

  return logs;
}

function generateMockSystemDirs(): SystemCronDir[] {
  return [
    {
      name: 'cron.d',
      path: '/etc/cron.d',
      count: 4,
      scripts: ['certbot', 'sysstat', 'php', 'e2scrub_all'],
    },
    {
      name: 'cron.daily',
      path: '/etc/cron.daily',
      count: 6,
      scripts: ['logrotate', 'man-db', 'apt-compat', 'dpkg', 'passwd', 'mlocate'],
    },
    { name: 'cron.hourly', path: '/etc/cron.hourly', count: 1, scripts: ['0anacron'] },
    { name: 'cron.weekly', path: '/etc/cron.weekly', count: 2, scripts: ['man-db', 'fstrim'] },
    { name: 'cron.monthly', path: '/etc/cron.monthly', count: 0, scripts: [] },
  ];
}

// ---- Public API ----

async function getSnapshot(): Promise<CronsSnapshot> {
  const hasCrontab = await checkCrontab();

  if (!hasCrontab) {
    const mockJobs = generateMockJobs();
    const activeJobs = mockJobs.filter((j) => j.enabled);
    const nextJob = activeJobs
      .filter((j) => j.nextRuns.length > 0)
      .sort((a, b) => new Date(a.nextRuns[0]).getTime() - new Date(b.nextRuns[0]).getTime())[0];

    return {
      source: 'mock',
      crontabAvailable: false,
      summary: {
        total: mockJobs.length,
        active: activeJobs.length,
        disabled: mockJobs.length - activeJobs.length,
        userCrons: mockJobs.filter((j) => j.source === 'user').length,
        systemCrons: mockJobs.filter((j) => j.source !== 'user').length,
        nextRunJob: nextJob ? extractJobName(nextJob.command) : undefined,
        nextRunTime: nextJob?.nextRuns[0],
      },
      jobs: mockJobs,
      systemDirs: generateMockSystemDirs(),
      recentLogs: generateMockLogs(),
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const [userJobs, systemJobs, systemDirs, recentLogs] = await Promise.all([
      listUserJobs(),
      listSystemCronJobs(),
      listSystemCronDirs(),
      getRecentLogs(),
    ]);

    const allJobs = [...userJobs, ...systemJobs];
    const activeJobs = allJobs.filter((j) => j.enabled);
    const nextJob = activeJobs
      .filter((j) => j.nextRuns.length > 0)
      .sort((a, b) => new Date(a.nextRuns[0]).getTime() - new Date(b.nextRuns[0]).getTime())[0];

    return {
      source: 'crontab',
      crontabAvailable: true,
      summary: {
        total: allJobs.length,
        active: activeJobs.length,
        disabled: allJobs.length - activeJobs.length,
        userCrons: userJobs.length,
        systemCrons: systemJobs.length,
        nextRunJob: nextJob ? extractJobName(nextJob.command) : undefined,
        nextRunTime: nextJob?.nextRuns[0],
      },
      jobs: allJobs,
      systemDirs,
      recentLogs,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    log.error('Failed to get crons snapshot', err);
    throw err;
  }
}

async function createJob(
  req: CronCreateRequest
): Promise<{ success: boolean; message: string; job?: CronJob }> {
  const hasCrontab = await checkCrontab();
  if (!hasCrontab) {
    return { success: true, message: '[mock] Job created successfully' };
  }

  try {
    const expression = `${req.minute} ${req.hour} ${req.dayOfMonth} ${req.month} ${req.dayOfWeek}`;
    const commentLine = req.comment ? `# ${req.comment}\n` : '';
    const cronLine = `${expression} ${req.command}`;

    const existing = await getUserCrontab(req.user);
    const newContent = existing.trimEnd() + '\n' + commentLine + cronLine + '\n';
    await setUserCrontab(newContent, req.user);

    const job = parseCronExpression(cronLine, req.user || process.env.USER || 'root', 'user');
    return { success: true, message: 'Cron job created successfully', job: job || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Failed to create cron job', err);
    return { success: false, message };
  }
}

async function updateJob(
  id: string,
  req: CronUpdateRequest
): Promise<{ success: boolean; message: string }> {
  const hasCrontab = await checkCrontab();
  if (!hasCrontab) {
    return { success: true, message: '[mock] Job updated successfully' };
  }

  try {
    const raw = await getUserCrontab();
    const lines = raw.split('\n');
    const currentUser = process.env.USER || 'root';
    let found = false;

    const newLines = lines.map((line) => {
      const job = parseCrontabLine(line, currentUser, 'user');
      if (job && job.id === id) {
        found = true;
        const minute = req.minute ?? job.minute;
        const hour = req.hour ?? job.hour;
        const dom = req.dayOfMonth ?? job.dayOfMonth;
        const month = req.month ?? job.month;
        const dow = req.dayOfWeek ?? job.dayOfWeek;
        const command = req.command ?? job.command;
        const newLine = `${minute} ${hour} ${dom} ${month} ${dow} ${command}`;

        if (req.enabled === false) {
          return `# ${newLine}`;
        } else if (req.enabled === true && line.trim().startsWith('#')) {
          return newLine;
        }
        return newLine;
      }
      return line;
    });

    if (!found) {
      return { success: false, message: 'Cron job not found' };
    }

    await setUserCrontab(newLines.join('\n'));
    return { success: true, message: 'Cron job updated successfully' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Failed to update cron job', err);
    return { success: false, message };
  }
}

async function deleteJob(id: string): Promise<{ success: boolean; message: string }> {
  const hasCrontab = await checkCrontab();
  if (!hasCrontab) {
    return { success: true, message: '[mock] Job deleted successfully' };
  }

  try {
    const raw = await getUserCrontab();
    const lines = raw.split('\n');
    const currentUser = process.env.USER || 'root';
    let found = false;

    const newLines = lines.filter((line) => {
      const job = parseCrontabLine(line, currentUser, 'user');
      if (job && job.id === id) {
        found = true;
        return false;
      }
      return true;
    });

    if (!found) {
      return { success: false, message: 'Cron job not found' };
    }

    await setUserCrontab(newLines.join('\n'));
    return { success: true, message: 'Cron job deleted successfully' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('Failed to delete cron job', err);
    return { success: false, message };
  }
}

// ---- Helpers ----

function extractJobName(command: string): string {
  // Get the first token of the command (the executable), then its basename
  const firstToken = command.trim().split(/\s+/)[0] || command;
  const basename = firstToken.split('/').pop() || firstToken;
  return basename || 'job';
}

// ---- Manual Run Tracking ----

const MAX_TRACKED_RUNS = 100; // Increased since we are on disk
const MAX_OUTPUT_BYTES = 128 * 1024; // Increased to 128KB
const RUN_LOG_DIR = process.env.CRON_RUN_LOG_DIR || '/var/log/servermon_cron_manual_run';
const activeRuns = new Map<string, CronRunStatus & { logFile: string; metadataFile: string }>();

// Ensure log directory exists (called lazily on first use, not at import time)
let logDirReady = false;
function ensureLogDir() {
  if (logDirReady) return;
  logDirReady = true;
  try {
    if (!existsSync(RUN_LOG_DIR)) {
      mkdirSync(RUN_LOG_DIR, { recursive: true, mode: 0o755 });
      log.info(`Created manual run log directory: ${RUN_LOG_DIR}`);
    }
  } catch (err) {
    log.error(`Failed to create log directory ${RUN_LOG_DIR}. Falling back to tmp.`, err);
  }
}

async function pruneOldRuns() {
  try {
    const files = await readdir(RUN_LOG_DIR);
    const metadataFiles = files.filter((f) => f.endsWith('.json'));

    if (metadataFiles.length <= MAX_TRACKED_RUNS) return;

    const stats = await Promise.all(
      metadataFiles.map(async (f) => {
        const s = await stat(join(RUN_LOG_DIR, f));
        return { name: f, mtime: s.mtime.getTime() };
      })
    );

    stats.sort((a, b) => a.mtime - b.mtime);

    const TO_DELETE = stats.slice(0, stats.length - MAX_TRACKED_RUNS);
    for (const item of TO_DELETE) {
      const base = item.name.replace('.json', '');
      await unlink(join(RUN_LOG_DIR, `${base}.json`)).catch(() => {});
      await unlink(join(RUN_LOG_DIR, `${base}.log`)).catch(() => {});
      activeRuns.delete(base);
    }
  } catch (err) {
    log.error('Failed to prune old runs', err);
  }
}

async function readLogFile(path: string): Promise<string> {
  try {
    const content = await readFile(path, 'utf-8');
    if (content.length > MAX_OUTPUT_BYTES) {
      return content.slice(0, MAX_OUTPUT_BYTES) + '\n... [truncated]';
    }
    return content;
  } catch {
    return '';
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runJobNow(jobId: string, command: string): CronRunStatus {
  const runId = `${jobId}-${Date.now()}`;
  const startedAt = new Date().toISOString();
  let logFile = join(RUN_LOG_DIR, `${runId}.log`);
  let metadataFile = join(RUN_LOG_DIR, `${runId}.json`);

  log.info(`Manual run triggered for job ${jobId}`, { runId, command });

  ensureLogDir();

  // Open log file for the child to write to directly
  let logFd;
  try {
    logFd = openSync(logFile, 'w');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to open log file in ${RUN_LOG_DIR}, falling back to tmp`, { error: errorMsg });
    logFile = join(tmpdir(), `${runId}.log`);
    metadataFile = join(tmpdir(), `${runId}.json`);
    logFd = openSync(logFile, 'w');
  }

  const spawnCmd = 'sh';
  const spawnArgs = ['-c', command];

  const child = spawn(spawnCmd, spawnArgs, {
    detached: true,
    stdio: ['ignore', logFd, logFd], // Unified stdout and stderr
    env: { ...process.env },
  });

  closeSync(logFd);
  child.unref();

  const pid = child.pid || 0;

  const run: CronRunStatus & { logFile: string; metadataFile: string } = {
    runId,
    jobId,
    command,
    pid,
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt,
    logFile,
    metadataFile,
  };

  const updateMetadata = async () => {
    try {
      await writeFile(
        metadataFile,
        JSON.stringify(
          {
            runId: run.runId,
            jobId: run.jobId,
            command: run.command,
            pid: run.pid,
            status: run.status,
            exitCode: run.exitCode,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
          },
          null,
          2
        )
      );
    } catch (err) {
      log.error(`Failed to write metadata for run ${runId}`, err);
    }
  };

  // Initial metadata write
  updateMetadata();

  child.on('close', async (code) => {
    run.exitCode = code;
    run.status = code === 0 ? 'completed' : 'failed';
    run.finishedAt = new Date().toISOString();
    log.info(`Manual run finished for job ${jobId}`, { runId, exitCode: code });
    await updateMetadata();
  });

  child.on('error', async (err) => {
    run.status = 'failed';
    run.exitCode = -1;
    run.finishedAt = new Date().toISOString();
    log.error(`Manual run spawn error for job ${jobId}`, err);
    await updateMetadata();
  });

  activeRuns.set(runId, run);
  pruneOldRuns();

  return {
    runId,
    jobId,
    command,
    pid,
    status: 'running',
    exitCode: null,
    stdout: '',
    stderr: '',
    startedAt,
  };
}

async function getRunStatus(runId: string): Promise<CronRunStatus | null> {
  const active = activeRuns.get(runId);
  let run: (CronRunStatus & { logFile: string; metadataFile: string }) | null = null;

  if (active) {
    run = active;
  } else {
    // If not in memory, try to read from disk
    const metadataFile = join(RUN_LOG_DIR, `${runId}.json`);
    const logFile = join(RUN_LOG_DIR, `${runId}.log`);
    try {
      const content = await readFile(metadataFile, 'utf-8');
      const metadata = JSON.parse(content);
      run = {
        ...metadata,
        logFile,
        metadataFile,
      };
    } catch {
      return null;
    }
  }

  if (!run) return null;

  // If still marked running, check if the process is actually alive
  if (run.status === 'running' && run.pid > 0 && !isProcessRunning(run.pid)) {
    run.status = 'completed';
    run.finishedAt = new Date().toISOString();
    // Update on disk if it was a ghost process
    try {
      await writeFile(
        run.metadataFile,
        JSON.stringify(
          {
            runId: run.runId,
            jobId: run.jobId,
            command: run.command,
            pid: run.pid,
            status: run.status,
            exitCode: run.exitCode,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
          },
          null,
          2
        )
      );
    } catch {
      /* ignore */
    }
  }

  // Read current output from log file
  const logOutput = await readLogFile(run.logFile);

  return {
    runId: run.runId,
    jobId: run.jobId,
    command: run.command,
    pid: run.pid,
    status: run.status,
    exitCode: run.exitCode,
    stdout: logOutput,
    stderr: '', // Combined in logOutput
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

async function listRuns(jobId?: string): Promise<CronRunStatus[]> {
  const runs: CronRunStatus[] = [];

  try {
    const files = await readdir(RUN_LOG_DIR);
    const metadataFiles = files.filter((f) => f.endsWith('.json'));

    for (const f of metadataFiles) {
      try {
        const content = await readFile(join(RUN_LOG_DIR, f), 'utf-8');
        const run: CronRunStatus = JSON.parse(content);
        if (!jobId || jobId === 'all' || run.jobId === jobId) {
          runs.push({
            ...run,
            stdout: '',
            stderr: '',
          });
        }
      } catch {
        /* skip corrupted files */
      }
    }
  } catch {
    /* log dir might not exist yet */
  }

  // Merge with active in-memory runs that might not have hit disk yet or are more up-to-date
  for (const active of activeRuns.values()) {
    if (!jobId || jobId === 'all' || active.jobId === jobId) {
      const existingIdx = runs.findIndex((r) => r.runId === active.runId);
      const basicStatus = {
        runId: active.runId,
        jobId: active.jobId,
        command: active.command,
        pid: active.pid,
        status: active.status,
        exitCode: active.exitCode,
        stdout: '',
        stderr: '',
        startedAt: active.startedAt,
        finishedAt: active.finishedAt,
      };
      if (existingIdx >= 0) {
        runs[existingIdx] = basicStatus;
      } else {
        runs.push(basicStatus);
      }
    }
  }

  return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export const cronsService = {
  getSnapshot,
  createJob,
  updateJob,
  deleteJob,
  runJobNow,
  getRunStatus,
  listRuns,
};
