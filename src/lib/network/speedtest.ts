import { execFile, type ExecFileOptions } from 'node:child_process';
import connectDB from '@/lib/db';
import NetworkSpeedtestResult from '@/models/NetworkSpeedtestResult';
import NetworkSpeedtestSettings from '@/models/NetworkSpeedtestSettings';
import type {
  NetworkSpeedtestCli,
  NetworkSpeedtestOverview,
  NetworkSpeedtestResult as NetworkSpeedtestResultDto,
  NetworkSpeedtestScheduleInterval,
  NetworkSpeedtestSettings as NetworkSpeedtestSettingsDto,
  NetworkSpeedtestTrigger,
} from '@/modules/network/types';

const SETTINGS_ID = 'network-speedtest-settings';
const SPEEDTEST_TIMEOUT_MS = 180_000;
const HISTORY_LIMIT = 60;

const intervalMs: Record<Exclude<NetworkSpeedtestScheduleInterval, 'off'>, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

let activeRun: Promise<NetworkSpeedtestResultDto> | null = null;

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface LeanSpeedtestSettings {
  scheduleInterval?: NetworkSpeedtestScheduleInterval;
  nextRunAt?: Date | string | null;
  lastScheduledRunAt?: Date | string | null;
}

type LeanSpeedtestResult = Partial<
  Omit<NetworkSpeedtestResultDto, 'id' | 'startedAt' | 'finishedAt'>
> & {
  _id?: unknown;
  startedAt?: Date | string;
  finishedAt?: Date | string;
};

export const NETWORK_SPEEDTEST_INTERVALS = [
  'off',
  '30m',
  '1h',
  '3h',
  '6h',
  '24h',
] as const satisfies readonly NetworkSpeedtestScheduleInterval[];

function execFileStrict(
  file: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: SPEEDTEST_TIMEOUT_MS, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function roundMetric(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value * 100) / 100;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeSettings(settings?: LeanSpeedtestSettings | null): NetworkSpeedtestSettingsDto {
  return {
    scheduleInterval: settings?.scheduleInterval ?? 'off',
    nextRunAt: toIso(settings?.nextRunAt) ?? null,
    lastScheduledRunAt: toIso(settings?.lastScheduledRunAt),
  };
}

function serializeResult(result: LeanSpeedtestResult): NetworkSpeedtestResultDto {
  return {
    id: result._id ? String(result._id) : undefined,
    trigger: result.trigger ?? 'manual',
    status: result.status ?? 'failed',
    cli: result.cli ?? 'unknown',
    startedAt: toIso(result.startedAt) ?? new Date().toISOString(),
    finishedAt: toIso(result.finishedAt) ?? new Date().toISOString(),
    downloadMbps: result.downloadMbps,
    uploadMbps: result.uploadMbps,
    pingMs: result.pingMs,
    jitterMs: result.jitterMs,
    packetLoss: result.packetLoss,
    serverId: result.serverId,
    serverName: result.serverName,
    serverLocation: result.serverLocation,
    isp: result.isp,
    resultUrl: result.resultUrl,
    bytesReceived: result.bytesReceived,
    bytesSent: result.bytesSent,
    error: result.error,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown speedtest error';
}

function getCommandNotFoundMessage(error: unknown): string | null {
  const maybeCode = (error as { code?: unknown } | null)?.code;
  const message = getErrorMessage(error);
  if (maybeCode === 'ENOENT' || message.includes('ENOENT')) {
    return 'speedtest command not found. Install the Ookla speedtest CLI or speedtest-cli package.';
  }
  return null;
}

async function detectSpeedtestCli(): Promise<NetworkSpeedtestCli> {
  try {
    const { stdout } = await execFileStrict('speedtest', ['--help'], { timeout: 10_000 });
    if (stdout.includes('--format') || stdout.includes('Speedtest by Ookla')) return 'ookla';
    if (stdout.includes('--json')) return 'python';
    return 'python';
  } catch (error) {
    const notFound = getCommandNotFoundMessage(error);
    if (notFound) throw new Error(notFound);
    return 'python';
  }
}

function getSpeedtestArgs(cli: NetworkSpeedtestCli): string[] {
  if (cli === 'ookla') {
    return ['--accept-license', '--accept-gdpr', '--format=json', '--progress=no'];
  }
  return ['--json', '--secure'];
}

export function normalizeSpeedtestOutput(
  rawOutput: string,
  cli: NetworkSpeedtestCli,
  trigger: NetworkSpeedtestTrigger,
  startedAt: Date,
  finishedAt: Date
): Omit<NetworkSpeedtestResultDto, 'id'> {
  const parsed = objectValue(JSON.parse(rawOutput));
  const server = objectValue(parsed.server);
  const client = objectValue(parsed.client);

  if (cli === 'ookla') {
    const ping = objectValue(parsed.ping);
    const download = objectValue(parsed.download);
    const upload = objectValue(parsed.upload);
    const result = objectValue(parsed.result);
    const bandwidthDown = numberValue(download.bandwidth);
    const bandwidthUp = numberValue(upload.bandwidth);
    const city = stringValue(server.location) ?? stringValue(server.name);
    const country = stringValue(server.country);

    return {
      trigger,
      status: 'completed',
      cli,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      downloadMbps: roundMetric(bandwidthDown === undefined ? undefined : bandwidthDown * 8 * 1e-6),
      uploadMbps: roundMetric(bandwidthUp === undefined ? undefined : bandwidthUp * 8 * 1e-6),
      pingMs: roundMetric(numberValue(ping.latency)),
      jitterMs: roundMetric(numberValue(ping.jitter)),
      packetLoss: roundMetric(numberValue(parsed.packetLoss)),
      serverId:
        stringValue(server.id) ??
        (numberValue(server.id) === undefined ? undefined : String(server.id)),
      serverName: stringValue(server.sponsor) ?? stringValue(server.name),
      serverLocation: [city, country].filter(Boolean).join(', ') || undefined,
      isp: stringValue(parsed.isp),
      resultUrl: stringValue(result.url),
      bytesReceived: numberValue(download.bytes),
      bytesSent: numberValue(upload.bytes),
    };
  }

  const downloadBits = numberValue(parsed.download);
  const uploadBits = numberValue(parsed.upload);
  const city = stringValue(server.name);
  const country = stringValue(server.country);

  return {
    trigger,
    status: 'completed',
    cli,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    downloadMbps: roundMetric(downloadBits === undefined ? undefined : downloadBits * 1e-6),
    uploadMbps: roundMetric(uploadBits === undefined ? undefined : uploadBits * 1e-6),
    pingMs: roundMetric(numberValue(parsed.ping) ?? numberValue(server.latency)),
    serverId:
      stringValue(server.id) ??
      (numberValue(server.id) === undefined ? undefined : String(server.id)),
    serverName: stringValue(server.sponsor) ?? stringValue(server.name),
    serverLocation: [city, country].filter(Boolean).join(', ') || undefined,
    isp: stringValue(client.isp),
    resultUrl: stringValue(parsed.share),
    bytesReceived: numberValue(parsed.bytes_received),
    bytesSent: numberValue(parsed.bytes_sent),
  };
}

async function persistResult(
  result: Omit<NetworkSpeedtestResultDto, 'id'>
): Promise<NetworkSpeedtestResultDto> {
  await connectDB();
  const created = (await NetworkSpeedtestResult.create({
    ...result,
    startedAt: new Date(result.startedAt),
    finishedAt: new Date(result.finishedAt),
  })) as LeanSpeedtestResult;
  return serializeResult(created);
}

async function runNetworkSpeedtestInternal(
  trigger: NetworkSpeedtestTrigger
): Promise<NetworkSpeedtestResultDto> {
  const startedAt = new Date();
  let cli: NetworkSpeedtestCli = 'unknown';

  try {
    cli = await detectSpeedtestCli();
    const { stdout } = await execFileStrict('speedtest', getSpeedtestArgs(cli));
    const finishedAt = new Date();
    const result = normalizeSpeedtestOutput(stdout, cli, trigger, startedAt, finishedAt);
    return await persistResult(result);
  } catch (error) {
    const finishedAt = new Date();
    const result: Omit<NetworkSpeedtestResultDto, 'id'> = {
      trigger,
      status: 'failed',
      cli,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: getCommandNotFoundMessage(error) ?? getErrorMessage(error),
    };
    return await persistResult(result);
  }
}

export async function runNetworkSpeedtest(
  trigger: NetworkSpeedtestTrigger
): Promise<NetworkSpeedtestResultDto> {
  if (activeRun) {
    throw new Error('Speedtest already running');
  }

  activeRun = runNetworkSpeedtestInternal(trigger);
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

export function isNetworkSpeedtestRunning(): boolean {
  return activeRun !== null;
}

export function getNextSpeedtestRunAt(
  scheduleInterval: NetworkSpeedtestScheduleInterval,
  from = new Date()
): Date | null {
  if (scheduleInterval === 'off') return null;
  return new Date(from.getTime() + intervalMs[scheduleInterval]);
}

async function loadSettingsDocument(): Promise<LeanSpeedtestSettings | null> {
  await connectDB();
  const query = NetworkSpeedtestSettings.findById(SETTINGS_ID);
  const leanQuery = query.lean<LeanSpeedtestSettings | null>();
  return await leanQuery;
}

export async function getNetworkSpeedtestSettings(): Promise<NetworkSpeedtestSettingsDto> {
  return serializeSettings(await loadSettingsDocument());
}

export async function updateNetworkSpeedtestSchedule(
  scheduleInterval: NetworkSpeedtestScheduleInterval,
  now = new Date()
): Promise<NetworkSpeedtestSettingsDto> {
  await connectDB();
  const nextRunAt = getNextSpeedtestRunAt(scheduleInterval, now);
  const updatedQuery = NetworkSpeedtestSettings.findByIdAndUpdate(
    SETTINGS_ID,
    {
      scheduleInterval,
      nextRunAt,
      ...(scheduleInterval === 'off' ? { lastScheduledRunAt: null } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const updated = await updatedQuery.lean<LeanSpeedtestSettings>();
  return serializeSettings(updated);
}

export async function getNetworkSpeedtestOverview(
  limit = HISTORY_LIMIT
): Promise<NetworkSpeedtestOverview> {
  await connectDB();
  const [settingsDoc, historyDocs] = await Promise.all([
    NetworkSpeedtestSettings.findById(SETTINGS_ID).lean<LeanSpeedtestSettings | null>(),
    NetworkSpeedtestResult.find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean<LeanSpeedtestResult[]>(),
  ]);
  const history = historyDocs.map(serializeResult);

  return {
    running: isNetworkSpeedtestRunning(),
    settings: serializeSettings(settingsDoc),
    latest: history[0] ?? null,
    history,
  };
}

export async function runDueScheduledNetworkSpeedtest(now = new Date()): Promise<{
  ran: boolean;
  result?: NetworkSpeedtestResultDto;
  reason?: string;
}> {
  const settings = await getNetworkSpeedtestSettings();
  if (settings.scheduleInterval === 'off') return { ran: false, reason: 'disabled' };
  if (!settings.nextRunAt || new Date(settings.nextRunAt).getTime() > now.getTime()) {
    return { ran: false, reason: 'not-due' };
  }
  if (isNetworkSpeedtestRunning()) return { ran: false, reason: 'running' };

  const result = await runNetworkSpeedtest('scheduled');
  const nextRunAt = getNextSpeedtestRunAt(settings.scheduleInterval, new Date(result.finishedAt));
  await connectDB();
  await NetworkSpeedtestSettings.findByIdAndUpdate(
    SETTINGS_ID,
    {
      scheduleInterval: settings.scheduleInterval,
      nextRunAt,
      lastScheduledRunAt: new Date(result.finishedAt),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { ran: true, result };
}
