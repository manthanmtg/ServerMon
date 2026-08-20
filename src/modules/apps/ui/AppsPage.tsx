'use client';

import {
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Globe2,
  History,
  FileText,
  LoaderCircle,
  Lock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { resilientFetch } from '@/lib/fetch-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { OperationLogViewer } from '@/components/operations/OperationLogViewer';
import type {
  AppAutoUpdateStatus,
  AppLogEntry,
  AppOperation,
  AppOperationType,
  AppRelease,
  AppSourceType,
  AppTemplateId,
  ManagedAppDTO,
} from '../types';
import { readManagedAppsList } from './appPayload';
import { AppsRuntimeLogsDialog } from './AppsRuntimeLogsDialog';
import { AppsDeploymentHistoryDialog } from './components/AppsDeploymentHistoryDialog';
import { AppsOperationLogsDialog } from './components/AppsOperationLogsDialog';
import { AppsSummaryCards } from './AppsSummaryCards';

interface FormState {
  templateId: AppTemplateId;
  sourceType: AppSourceType;
  name: string;
  sourcePath: string;
  gitUrl: string;
  gitBranch: string;
  autoUpdateEnabled: boolean;
  autoUpdateInterval: string;
  domain: string;
  port: string;
  install: string;
  build: string;
  start: string;
  healthCheckPath: string;
  tlsEnabled: boolean;
  envVars: EnvVarRow[];
}

interface EnvVarRow {
  id: string;
  key: string;
  value: string;
}

type AppsPageSummary = {
  total: number;
  running: number;
  failed: number;
};

type AppsPageSummaryInput = Pick<ManagedAppDTO, 'status'>;
type AppsPageViewModelInput = Pick<ManagedAppDTO, 'id' | 'operations'>;

interface AppsPageVisibleOperation {
  operation: AppOperation;
  isLiveOperation: boolean;
  visibleLogs: string[];
}

interface AppsPageViewModel<TApp extends AppsPageViewModelInput> {
  app: TApp;
  isExpanded: boolean;
  isUpdatingThisApp: boolean;
  latestUpdateOperation: AppOperation | undefined;
  hasRunningUpdateOperation: boolean;
  hasRunningOperation: boolean;
  operationCount: number;
  visibleOperations: AppsPageVisibleOperation[];
}

interface ActionResult {
  status?: string;
  releaseId?: string;
  operationId?: string;
  phase?: string;
  error?: string;
  logs: string[];
}

interface ActionNotice {
  tone: 'success' | 'info';
  title: string;
  detail?: string;
}

interface OperationLogsTarget {
  appId: string;
  operationId?: string;
  operationType: AppOperationType;
  existingOperationIds?: string[];
  operationSnapshot?: AppOperation;
  queueOperationId?: string;
}

interface AcceptedOperationLock {
  appId: string;
  operationId: string;
  operationType: AppOperationType;
}

interface TerminalQueueOperation {
  id: string;
  status: 'failed' | 'cancelled';
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export function deriveAppsPageSummary(apps: AppsPageSummaryInput[]): AppsPageSummary {
  return apps.reduce<AppsPageSummary>(
    (summary, app) => {
      summary.total += 1;
      if (app.status === 'running') summary.running += 1;
      if (app.status === 'failed') summary.failed += 1;
      return summary;
    },
    { total: 0, running: 0, failed: 0 }
  );
}

export function deriveAppsPageViewModels<TApp extends AppsPageViewModelInput>(
  apps: TApp[],
  expandedAppIds: ReadonlySet<string>,
  updatingId: string | null,
  allOperationAppIds: ReadonlySet<string> = new Set()
): AppsPageViewModel<TApp>[] {
  return apps.map((app) => {
    const isExpanded = expandedAppIds.has(app.id);
    const latestUpdateOperation = getLatestUpdateOperation(app);
    const isUpdatingThisApp = updatingId === app.id;
    const hasRunningUpdateOperation = appHasRunningUpdateOperation(app);
    const hasRunningOperation = appHasRunningOperation(app);
    const userOperations = app.operations.filter((operation) => !isWorkerQueueOperation(operation));

    return {
      app,
      isExpanded,
      isUpdatingThisApp,
      latestUpdateOperation,
      hasRunningUpdateOperation,
      hasRunningOperation,
      operationCount: userOperations.length,
      visibleOperations: isExpanded
        ? userOperations
            .reverse()
            .slice(0, allOperationAppIds.has(app.id) ? undefined : 3)
            .map((operation) => {
              const isLiveOperation = operation.status === 'running';

              return {
                operation,
                isLiveOperation,
                visibleLogs: operation.logs.slice(
                  isLiveOperation ? -LIVE_OPERATION_LOG_LIMIT : -RECENT_OPERATION_LOG_LIMIT
                ),
              };
            })
        : [],
    };
  });
}

export function countLogicalActiveOperations(
  apps: Array<{
    operations: Array<Pick<AppOperation, 'id' | 'type' | 'status'>>;
  }>
): number {
  return apps.reduce((total, app) => {
    const runningExecutions = app.operations.filter(
      (operation) => operation.status === 'running' && !isWorkerQueueOperation(operation)
    );
    const executionTypes = new Set(runningExecutions.map((operation) => operation.type));
    const queuedTypesWithoutExecution = new Set(
      app.operations
        .filter(
          (operation) =>
            operation.status === 'running' &&
            isWorkerQueueOperation(operation) &&
            !executionTypes.has(operation.type)
        )
        .map((operation) => operation.type)
    );
    return total + runningExecutions.length + queuedTypesWithoutExecution.size;
  }, 0);
}

const initialForm: FormState = {
  templateId: 'nextjs',
  sourceType: 'local',
  name: '',
  sourcePath: '',
  gitUrl: '',
  gitBranch: 'main',
  autoUpdateEnabled: false,
  autoUpdateInterval: '60',
  domain: '',
  port: '3010',
  install: 'pnpm install --frozen-lockfile',
  build: 'pnpm build',
  start: 'pnpm start',
  healthCheckPath: '/',
  tlsEnabled: false,
  envVars: [],
};

const templates: Array<{ id: AppTemplateId; label: string; description: string }> = [
  {
    id: 'nextjs',
    label: 'Next.js App',
    description: 'Pure Next.js app deployed with managed releases, systemd, and Nginx.',
  },
];

const autoUpdateIntervals = [
  { value: '15', label: 'Every 15 minutes' },
  { value: '30', label: 'Every 30 minutes' },
  { value: '60', label: 'Hourly' },
  { value: '1440', label: 'Daily' },
];

const UPDATE_OPERATION_POLL_MS = 1500;
const UPDATE_REQUEST_TIMEOUT_MS = 10 * 60_000;
const LIVE_OPERATION_LOG_LIMIT = 80;
const RECENT_OPERATION_LOG_LIMIT = 8;

function createEnvVarRow(): EnvVarRow {
  return {
    id: `env-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    key: '',
    value: '',
  };
}

function buildEnvVars(rows: EnvVarRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.map((row) => [row.key.trim(), row.value] as const).filter(([key]) => key.length > 0)
  );
}

function formToPayload(form: FormState) {
  return {
    templateId: form.templateId,
    sourceType: form.sourceType,
    name: form.name,
    sourcePath: form.sourceType === 'local' ? form.sourcePath : undefined,
    gitUrl: form.sourceType === 'git' ? form.gitUrl : undefined,
    gitBranch: form.sourceType === 'git' ? form.gitBranch || 'main' : undefined,
    autoUpdate:
      form.sourceType === 'git'
        ? {
            enabled: form.autoUpdateEnabled,
            intervalMinutes: Number(form.autoUpdateInterval),
          }
        : undefined,
    domain: form.domain,
    port: Number(form.port),
    commands: {
      install: form.install,
      build: form.build,
      start: form.start,
    },
    healthCheckPath: form.healthCheckPath || '/',
    tlsEnabled: form.tlsEnabled,
    envVars: buildEnvVars(form.envVars),
  };
}

function appToForm(app: ManagedAppDTO): FormState {
  return {
    templateId: app.templateId,
    sourceType: app.sourceType,
    name: app.name,
    sourcePath: app.sourcePath ?? '',
    gitUrl: app.git?.url ?? '',
    gitBranch: app.git?.branch ?? 'main',
    autoUpdateEnabled: Boolean(app.git?.autoUpdate.enabled),
    autoUpdateInterval: String(app.git?.autoUpdate.intervalMinutes ?? 60),
    domain: app.domain,
    port: String(app.port),
    install: app.commands.install,
    build: app.commands.build,
    start: app.commands.start,
    healthCheckPath: app.healthCheckPath || '/',
    tlsEnabled: app.tlsEnabled,
    envVars: Object.entries(app.envVars).map(([key, value], index) => ({
      id: `env-existing-${index}-${key}`,
      key,
      value,
    })),
  };
}

function statusBadge(app: ManagedAppDTO) {
  if (app.status === 'deploying') {
    return (
      <Badge variant="warning">
        <LoaderCircle className="h-3 w-3 animate-spin" />
        Deploying
      </Badge>
    );
  }
  if (app.status === 'running') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        Running
      </Badge>
    );
  }
  if (app.status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    );
  }
  return <Badge variant="secondary">{app.status}</Badge>;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return 'Not running';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function operationStatusBadge(operation: AppOperation) {
  if (operation.status === 'running') return <Badge variant="warning">Running</Badge>;
  if (operation.status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (operation.status === 'unchanged') return <Badge variant="secondary">Unchanged</Badge>;
  return <Badge variant="success">Succeeded</Badge>;
}

function operationLogsTitle(type: AppOperationType) {
  if (type === 'deploy') return 'Deployment logs';
  if (type === 'update') return 'Update logs';
  if (type === 'rollback') return 'Rollback logs';
  return 'Removal logs';
}

function operationLogSubject(type: AppOperationType) {
  return type === 'deploy' ? 'deployment' : type;
}

function autoUpdateStatusBadge(status?: AppAutoUpdateStatus) {
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'updated') return <Badge variant="success">Updated</Badge>;
  if (status === 'unchanged') return <Badge variant="secondary">Unchanged</Badge>;
  if (status === 'idle') return <Badge variant="secondary">Idle</Badge>;
  return <Badge variant="secondary">Never run</Badge>;
}

function formatOptionalDate(value: string | undefined, fallback: string) {
  return value ? new Date(value).toLocaleString() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPayloadError(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.error === 'string' ? payload.error : undefined;
}

function readActionResult(payload: unknown, key: string): ActionResult | null {
  if (!isRecord(payload) || !isRecord(payload[key])) return null;
  const result = payload[key];
  return {
    status: typeof result.status === 'string' ? result.status : undefined,
    releaseId: typeof result.releaseId === 'string' ? result.releaseId : undefined,
    operationId: typeof result.operationId === 'string' ? result.operationId : undefined,
    phase: typeof result.phase === 'string' ? result.phase : undefined,
    error: typeof result.error === 'string' ? result.error : undefined,
    logs: Array.isArray(result.logs)
      ? result.logs.filter((line): line is string => typeof line === 'string')
      : [],
  };
}

function updateNoticeFor(appName: string, result: ActionResult | null): ActionNotice {
  if (result?.operationId && (result.status === 'queued' || result.status === 'running')) {
    return {
      tone: 'info',
      title: `${appName} update queued.`,
      detail: 'Live logs are open and will update automatically.',
    };
  }
  if (result?.status === 'unchanged') {
    return {
      tone: 'info',
      title: `${appName} is already up to date.`,
      detail: result.logs.at(-1) || 'No upstream changes found.',
    };
  }
  if (result?.status === 'active') {
    return {
      tone: 'success',
      title: `${appName} updated successfully.`,
      detail: result.releaseId ? `Release ${result.releaseId} is now active.` : undefined,
    };
  }
  return {
    tone: 'success',
    title: `${appName} update completed.`,
    detail: result?.releaseId ? `Release ${result.releaseId} is now active.` : undefined,
  };
}

function deploymentNoticeFor(appName: string, result: ActionResult | null): ActionNotice {
  if (result?.operationId && (result.status === 'queued' || result.status === 'running')) {
    return {
      tone: 'info',
      title: `${appName} deployment queued.`,
      detail: 'Live logs are open and will update automatically.',
    };
  }
  if (result?.status === 'active') {
    return {
      tone: 'success',
      title: `${appName} deployed successfully.`,
      detail: result.releaseId ? `Release ${result.releaseId} is now active.` : undefined,
    };
  }
  return {
    tone: 'info',
    title: `${appName} deployment started.`,
    detail: 'Live logs are open and will update automatically.',
  };
}

function getLatestUpdateOperation(
  app: Pick<ManagedAppDTO, 'operations'>
): AppOperation | undefined {
  return [...app.operations]
    .reverse()
    .find((operation) => operation.type === 'update' && !isWorkerQueueOperation(operation));
}

function isWorkerQueueOperation(operation: Pick<AppOperation, 'id'>): boolean {
  // V2 queue rows describe worker coordination. The legacy operation created by
  // the executor has the deploy/update logs users actually need to follow.
  return operation.id.startsWith('op_');
}

function findOperationForLogs(
  app: Pick<ManagedAppDTO, 'operations'> | undefined,
  target: OperationLogsTarget | null
): AppOperation | undefined {
  if (!app || !target) return undefined;
  if (target.operationSnapshot) return target.operationSnapshot;
  if (target.operationId) {
    return app.operations.find((operation) => operation.id === target.operationId);
  }

  const existingOperationIds = new Set(target.existingOperationIds ?? []);
  return [...app.operations]
    .reverse()
    .find(
      (operation) =>
        operation.type === target.operationType &&
        !isWorkerQueueOperation(operation) &&
        !existingOperationIds.has(operation.id)
    );
}

function releaseToLogOperation(release: AppRelease): AppOperation {
  return {
    id: `release-${release.id}`,
    type: 'deploy',
    status:
      release.status === 'building'
        ? 'running'
        : release.status === 'failed'
          ? 'failed'
          : 'succeeded',
    title: 'Deployment release',
    step:
      release.status === 'building'
        ? 'Building release'
        : release.status === 'failed'
          ? 'Deployment failed'
          : 'Deployment completed',
    startedAt: release.createdAt,
    completedAt: release.status === 'building' ? undefined : release.activatedAt,
    releaseId: release.id,
    error: release.error,
    logs: release.logs,
  };
}

function appHasRunningUpdateOperation(app: Pick<ManagedAppDTO, 'operations'>): boolean {
  return app.operations.some(
    (operation) => operation.type === 'update' && operation.status === 'running'
  );
}

function appHasRunningOperation(app: Pick<ManagedAppDTO, 'operations'>): boolean {
  return app.operations.some((operation) => operation.status === 'running');
}

function isTerminalQueueStatus(status: unknown): boolean {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'unchanged'
  );
}

function readTerminalQueueOperation(payload: unknown): TerminalQueueOperation | null {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.operation)) {
    return null;
  }
  const operation = payload.data.operation;
  if (operation.status !== 'failed' && operation.status !== 'cancelled') return null;
  if (typeof operation.id !== 'string') return null;
  return {
    id: operation.id,
    status: operation.status,
    createdAt: typeof operation.createdAt === 'string' ? operation.createdAt : undefined,
    startedAt: typeof operation.startedAt === 'string' ? operation.startedAt : undefined,
    completedAt: typeof operation.completedAt === 'string' ? operation.completedAt : undefined,
    error: typeof operation.error === 'string' ? operation.error : undefined,
  };
}

function terminalQueueOperationToLogOperation(
  operation: TerminalQueueOperation,
  type: AppOperationType
): AppOperation {
  const subject = operationLogSubject(type);
  return {
    id: operation.id,
    type,
    status: 'failed',
    title: `${subject} did not start`,
    step:
      operation.status === 'cancelled' ? 'Cancelled before execution' : 'Failed before execution',
    startedAt: operation.startedAt ?? operation.createdAt ?? new Date().toISOString(),
    completedAt: operation.completedAt,
    error:
      operation.error ??
      (operation.status === 'cancelled'
        ? `The ${subject} was cancelled before execution started.`
        : `The ${subject} failed before build output became available.`),
    logs: [],
  };
}

function fieldClassName() {
  return 'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20';
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </div>
  );
}

export default function AppsPage() {
  const [apps, setApps] = useState<ManagedAppDTO[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [expandedAppIds, setExpandedAppIds] = useState<Set<string>>(() => new Set());
  const [allOperationAppIds, setAllOperationAppIds] = useState<Set<string>>(() => new Set());
  const [revealedEnvVars, setRevealedEnvVars] = useState<Set<string>>(() => new Set());
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ManagedAppDTO | null>(null);
  const [historyApp, setHistoryApp] = useState<ManagedAppDTO | null>(null);
  const [operationLogsTarget, setOperationLogsTarget] = useState<OperationLogsTarget | null>(null);
  const [acceptedOperationLocks, setAcceptedOperationLocks] = useState<
    Record<string, AcceptedOperationLock>
  >({});
  const [runtimeLogsApp, setRuntimeLogsApp] = useState<ManagedAppDTO | null>(null);
  const [runtimeLogs, setRuntimeLogs] = useState<AppLogEntry[]>([]);
  const [runtimeLogsLoading, setRuntimeLogsLoading] = useState(false);
  const [runtimeLogsError, setRuntimeLogsError] = useState<string | null>(null);
  const [editingApp, setEditingApp] = useState<ManagedAppDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [operationLogFollow, setOperationLogFollow] = useState<Record<string, boolean>>({});
  const [operationLogAutoscroll, setOperationLogAutoscroll] = useState<Record<string, boolean>>({});
  const [operationLogWrap, setOperationLogWrap] = useState<Record<string, boolean>>({});
  const [operationLogSnapshots, setOperationLogSnapshots] = useState<Record<string, string[]>>({});
  const appsRef = useRef<ManagedAppDTO[]>([]);
  const deployRequestIdsRef = useRef<Set<string>>(new Set());
  const updateRequestIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const response = await resilientFetch('/api/modules/apps', {
        cache: 'no-store',
        timeout: 10000,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = data && typeof data === 'object' ? (data as { error?: unknown }).error : null;
        throw new Error(typeof error === 'string' ? error : 'Failed to load apps');
      }
      const nextApps = readManagedAppsList(data);
      appsRef.current = nextApps;
      setApps(nextApps);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => deriveAppsPageSummary(apps), [apps]);
  const activeOperations = useMemo(() => countLogicalActiveOperations(apps), [apps]);

  const appViewModels = useMemo(
    () => deriveAppsPageViewModels(apps, expandedAppIds, updatingId, allOperationAppIds),
    [allOperationAppIds, apps, expandedAppIds, updatingId]
  );
  const operationLogsApp = operationLogsTarget
    ? apps.find((app) => app.id === operationLogsTarget.appId)
    : undefined;
  const selectedOperation = findOperationForLogs(operationLogsApp, operationLogsTarget);
  const awaitingOperationLogs = Boolean(operationLogsTarget && !selectedOperation);
  const selectedOperationFollow = selectedOperation
    ? operationLogFollow[selectedOperation.id] !== false
    : true;
  const selectedOperationForDialog = selectedOperation
    ? {
        ...selectedOperation,
        logs: selectedOperationFollow
          ? selectedOperation.logs
          : (operationLogSnapshots[selectedOperation.id] ?? selectedOperation.logs),
      }
    : undefined;

  useEffect(() => {
    const acceptedOperations = Object.values(acceptedOperationLocks);
    if (
      !deployingId &&
      !updatingId &&
      activeOperations === 0 &&
      !awaitingOperationLogs &&
      acceptedOperations.length === 0
    ) {
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const appListLoaded = await load();

      const terminalOperationIds = new Set<string>();
      const terminalFailures: TerminalQueueOperation[] = [];
      await Promise.all(
        acceptedOperations.map(async (operation) => {
          try {
            const response = await resilientFetch(
              `/api/modules/apps/operations/${operation.operationId}`,
              { cache: 'no-store', timeout: 10000 }
            );
            const payload: unknown = await response.json();
            const status =
              isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.operation)
                ? payload.data.operation.status
                : undefined;
            if (response.ok && isTerminalQueueStatus(status)) {
              terminalOperationIds.add(operation.operationId);
              const terminalFailure = readTerminalQueueOperation(payload);
              if (terminalFailure) terminalFailures.push(terminalFailure);
            }
          } catch {
            // Keep the local action lock until a later poll confirms a terminal state.
          }
        })
      );

      if (!cancelled && appListLoaded && terminalOperationIds.size > 0) {
        if (terminalFailures.length > 0) {
          setOperationLogsTarget((current) => {
            if (!current?.queueOperationId) return current;
            const terminalFailure = terminalFailures.find(
              (operation) => operation.id === current.queueOperationId
            );
            if (!terminalFailure) return current;
            const latestApp = appsRef.current.find((app) => app.id === current.appId);
            if (findOperationForLogs(latestApp, current)) return current;
            return {
              ...current,
              operationSnapshot: terminalQueueOperationToLogOperation(
                terminalFailure,
                current.operationType
              ),
            };
          });
        }
        setAcceptedOperationLocks((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, operation]) => !terminalOperationIds.has(operation.operationId)
            )
          )
        );
      }
      if (!cancelled) {
        timeout = setTimeout(() => void poll(), UPDATE_OPERATION_POLL_MS);
      }
    };

    timeout = setTimeout(() => void poll(), UPDATE_OPERATION_POLL_MS);

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [
    acceptedOperationLocks,
    activeOperations,
    awaitingOperationLogs,
    deployingId,
    load,
    updatingId,
  ]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateEnvRow = (id: string, key: keyof Omit<EnvVarRow, 'id'>, value: string) => {
    setForm((current) => ({
      ...current,
      envVars: current.envVars.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    }));
  };

  const addEnvRow = () => {
    setForm((current) => ({ ...current, envVars: [...current.envVars, createEnvVarRow()] }));
  };

  const removeEnvRow = (id: string) => {
    setForm((current) => ({
      ...current,
      envVars: current.envVars.filter((row) => row.id !== id),
    }));
  };

  const updateOperationFollow = (operation: AppOperation, shouldFollow: boolean) => {
    setOperationLogFollow((current) => ({
      ...current,
      [operation.id]: shouldFollow,
    }));
    setOperationLogSnapshots((current) => {
      const next = { ...current };
      if (shouldFollow) delete next[operation.id];
      else next[operation.id] = [...operation.logs];
      return next;
    });
  };

  const toggleAppExpanded = (appId: string) => {
    setExpandedAppIds((current) => {
      const next = new Set(current);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const toggleAllOperations = (appId: string) => {
    setAllOperationAppIds((current) => {
      const next = new Set(current);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const expandApp = (appId: string) => {
    setExpandedAppIds((current) => {
      if (current.has(appId)) return current;
      const next = new Set(current);
      next.add(appId);
      return next;
    });
  };

  const toggleEnvValue = (appId: string, key: string) => {
    const token = `${appId}:${key}`;
    setRevealedEnvVars((current) => {
      const next = new Set(current);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const copyToClipboard = async (value: string, token: string) => {
    await navigator.clipboard?.writeText(value);
    setCopiedTarget(token);
    window.setTimeout(() => {
      setCopiedTarget((current) => (current === token ? null : current));
    }, 1200);
  };

  const submitAppForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payload = formToPayload(form);
      const url = editingApp ? `/api/modules/apps/${editingApp.id}` : '/api/modules/apps';

      const response = await resilientFetch(url, {
        method: editingApp ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 15000,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || `Failed to ${editingApp ? 'update' : 'create'} app`);
      setFormMode(null);
      setForm(initialForm);
      setEditingApp(null);
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : `Failed to ${editingApp ? 'update' : 'create'} app`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateForm = () => {
    setForm(initialForm);
    setEditingApp(null);
    setFormMode('create');
    setError(null);
  };

  const startEditing = (app: ManagedAppDTO) => {
    setEditingApp(app);
    setForm(appToForm(app));
    setFormMode('edit');
    setError(null);
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingApp(null);
    setForm(initialForm);
  };

  const deployApp = async (appId: string) => {
    const app = apps.find((item) => item.id === appId);
    if (
      deployRequestIdsRef.current.has(appId) ||
      Boolean(acceptedOperationLocks[appId]) ||
      (app && (app.status === 'deploying' || appHasRunningOperation(app)))
    ) {
      return;
    }

    const appName = app?.name ?? 'App';
    deployRequestIdsRef.current.add(appId);
    setDeployingId(appId);
    setError(null);
    setNotice(null);
    expandApp(appId);
    setOperationLogsTarget({
      appId,
      operationType: 'deploy',
      existingOperationIds: app?.operations.map((operation) => operation.id) ?? [],
    });
    try {
      const response = await resilientFetch(`/api/modules/apps/${appId}/deploy`, {
        method: 'POST',
        timeout: 60000,
      });
      const data: unknown = await response.json();
      const result = readActionResult(data, 'deployment');
      if (!response.ok) {
        throw new Error(readPayloadError(data) || result?.error || 'Deploy failed');
      }
      if (result?.operationId) {
        setAcceptedOperationLocks((current) => ({
          ...current,
          [appId]: {
            appId,
            operationId: result.operationId as string,
            operationType: 'deploy',
          },
        }));
        setOperationLogsTarget((current) =>
          current?.appId === appId && current.operationType === 'deploy'
            ? { ...current, queueOperationId: result.operationId }
            : current
        );
      } else {
        setOperationLogsTarget((current) =>
          current?.appId === appId && current.operationType === 'deploy' ? null : current
        );
      }
      setNotice(deploymentNoticeFor(appName, result));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
      setOperationLogsTarget((current) =>
        current?.appId === appId && current.operationType === 'deploy' ? null : current
      );
      await load();
    } finally {
      deployRequestIdsRef.current.delete(appId);
      setDeployingId(null);
    }
  };

  const updateApp = async (appId: string) => {
    const app = apps.find((item) => item.id === appId);
    if (
      updateRequestIdsRef.current.has(appId) ||
      Boolean(acceptedOperationLocks[appId]) ||
      (app && (app.status === 'deploying' || appHasRunningOperation(app)))
    ) {
      return;
    }

    const appName = app?.name ?? 'App';
    updateRequestIdsRef.current.add(appId);
    setUpdatingId(appId);
    setError(null);
    setNotice(null);
    expandApp(appId);
    setOperationLogsTarget({
      appId,
      operationType: 'update',
      existingOperationIds: app?.operations.map((operation) => operation.id) ?? [],
    });
    try {
      const response = await resilientFetch(`/api/modules/apps/${appId}/update`, {
        method: 'POST',
        timeout: UPDATE_REQUEST_TIMEOUT_MS,
      });
      const data: unknown = await response.json();
      const result = readActionResult(data, 'update');
      if (!response.ok) {
        throw new Error(readPayloadError(data) || result?.error || 'Update failed');
      }
      if (result?.operationId) {
        setAcceptedOperationLocks((current) => ({
          ...current,
          [appId]: {
            appId,
            operationId: result.operationId as string,
            operationType: 'update',
          },
        }));
        setOperationLogsTarget((current) =>
          current?.appId === appId && current.operationType === 'update'
            ? { ...current, queueOperationId: result.operationId }
            : current
        );
      } else {
        setOperationLogsTarget((current) =>
          current?.appId === appId && current.operationType === 'update' ? null : current
        );
      }
      setNotice(updateNoticeFor(appName, result));
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setOperationLogsTarget((current) =>
        current?.appId === appId && current.operationType === 'update' ? null : current
      );
      await load();
    } finally {
      updateRequestIdsRef.current.delete(appId);
      setUpdatingId(null);
    }
  };

  const rollbackApp = async (appId: string, releaseId: string) => {
    const token = `${appId}:${releaseId}`;
    setRollbackTarget(token);
    setError(null);
    setNotice(null);
    try {
      const response = await resilientFetch(`/api/modules/apps/${appId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId }),
        timeout: 60000,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.rollback?.error || 'Rollback failed');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
      await load();
    } finally {
      setRollbackTarget(null);
    }
  };

  const openRuntimeLogs = async (app: ManagedAppDTO) => {
    setRuntimeLogsApp(app);
    setRuntimeLogs([]);
    setRuntimeLogsError(null);
    setRuntimeLogsLoading(true);
    try {
      const response = await resilientFetch(`/api/modules/apps/${app.id}/logs?lines=200`, {
        cache: 'no-store',
        timeout: 10000,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load runtime logs');
      setRuntimeLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err: unknown) {
      setRuntimeLogsError(err instanceof Error ? err.message : 'Failed to load runtime logs');
    } finally {
      setRuntimeLogsLoading(false);
    }
  };

  const deleteApp = async () => {
    if (!deleteCandidate) return;
    setDeletingId(deleteCandidate.id);
    setError(null);
    setNotice(null);
    try {
      const response = await resilientFetch(`/api/modules/apps/${deleteCandidate.id}`, {
        method: 'DELETE',
        timeout: 10000,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      setDeleteCandidate(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'success'
              ? 'border-success/20 bg-success/5 text-success'
              : 'border-border bg-muted/40 text-foreground'
          }`}
        >
          <div className="font-medium">{notice.title}</div>
          {notice.detail && <div className="mt-1 text-muted-foreground">{notice.detail}</div>}
        </div>
      )}

      <AppsSummaryCards summary={summary} activeOperations={activeOperations} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Registered Apps</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deploy, update, inspect history, and tune runtime settings for managed apps.
          </p>
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={openCreateForm}>
          <Plus className="h-4 w-4" />
          New App
        </Button>
      </div>

      {formMode && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-form-title"
            className="w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 id="app-form-title" className="flex items-center gap-2 text-lg font-semibold">
                  {editingApp ? (
                    <Pencil className="h-4 w-4 text-primary" />
                  ) : (
                    <Rocket className="h-4 w-4 text-primary" />
                  )}
                  {editingApp ? 'Edit App' : 'New App'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {editingApp
                    ? `Update ${editingApp.name}. Saved changes apply on the next deploy or update.`
                    : 'Pick a template, point ServerMon at the source repo, and configure how it should run.'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close app form"
                onClick={closeForm}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[78vh] overflow-auto p-5">
              <form onSubmit={submitAppForm} className="space-y-4">
                <Field
                  id="app-template"
                  label="Template"
                  hint={templates.find((template) => template.id === form.templateId)?.description}
                >
                  <select
                    id="app-template"
                    className={fieldClassName()}
                    value={form.templateId}
                    onChange={(event) =>
                      updateForm('templateId', event.target.value as AppTemplateId)
                    }
                    required
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Source</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      htmlFor="source-local"
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        form.sourceType === 'local'
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border bg-muted/10 text-muted-foreground'
                      }`}
                    >
                      <input
                        id="source-local"
                        type="radio"
                        name="source-type"
                        aria-label="Local folder"
                        checked={form.sourceType === 'local'}
                        onChange={() => updateForm('sourceType', 'local')}
                      />
                      <FolderOpen className="h-4 w-4" />
                      Local folder
                    </label>
                    <label
                      htmlFor="source-git"
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        form.sourceType === 'git'
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border bg-muted/10 text-muted-foreground'
                      }`}
                    >
                      <input
                        id="source-git"
                        type="radio"
                        name="source-type"
                        aria-label="Git repository"
                        checked={form.sourceType === 'git'}
                        onChange={() => updateForm('sourceType', 'git')}
                      />
                      <GitBranch className="h-4 w-4" />
                      Git repository
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="app-name" label="App name">
                    <input
                      id="app-name"
                      className={fieldClassName()}
                      placeholder="Inventory Portal"
                      value={form.name}
                      onChange={(event) => updateForm('name', event.target.value)}
                      required
                    />
                  </Field>
                  {form.sourceType === 'local' ? (
                    <Field id="source-path" label="Source path">
                      <input
                        id="source-path"
                        className={fieldClassName()}
                        placeholder="/srv/apps/inventory-portal"
                        value={form.sourcePath}
                        onChange={(event) => updateForm('sourcePath', event.target.value)}
                        required
                      />
                    </Field>
                  ) : (
                    <Field id="git-url" label="Git HTTPS URL">
                      <input
                        id="git-url"
                        className={fieldClassName()}
                        placeholder="https://github.com/acme/app.git"
                        value={form.gitUrl}
                        onChange={(event) => updateForm('gitUrl', event.target.value)}
                        required
                      />
                    </Field>
                  )}
                </div>

                {form.sourceType === 'git' && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                      <Field id="git-branch" label="Git branch">
                        <input
                          id="git-branch"
                          className={fieldClassName()}
                          placeholder="main"
                          value={form.gitBranch}
                          onChange={(event) => updateForm('gitBranch', event.target.value)}
                          required
                        />
                      </Field>
                      <Field id="auto-update-interval" label="Auto update interval">
                        <select
                          id="auto-update-interval"
                          className={fieldClassName()}
                          value={form.autoUpdateInterval}
                          onChange={(event) => updateForm('autoUpdateInterval', event.target.value)}
                          disabled={!form.autoUpdateEnabled}
                        >
                          {autoUpdateIntervals.map((interval) => (
                            <option key={interval.value} value={interval.value}>
                              {interval.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <label
                      htmlFor="auto-update"
                      className="flex min-h-[44px] items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm"
                    >
                      <input
                        id="auto-update"
                        type="checkbox"
                        aria-label="Auto update"
                        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                        checked={form.autoUpdateEnabled}
                        onChange={(event) => updateForm('autoUpdateEnabled', event.target.checked)}
                      />
                      <span className="space-y-1">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <RefreshCw className="h-4 w-4 text-primary" />
                          Auto update from upstream
                        </span>
                        <span className="block text-xs leading-5 text-muted-foreground">
                          ServerMon checks the git branch on schedule and deploys only when upstream
                          changes are available.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <Field id="app-domain" label="Domain">
                    <input
                      id="app-domain"
                      className={fieldClassName()}
                      placeholder="app.example.com"
                      value={form.domain}
                      onChange={(event) => updateForm('domain', event.target.value)}
                      required
                    />
                  </Field>
                  <Field id="local-port" label="Local port">
                    <input
                      id="local-port"
                      className={fieldClassName()}
                      placeholder="3010"
                      type="number"
                      min="1"
                      max="65535"
                      value={form.port}
                      onChange={(event) => updateForm('port', event.target.value)}
                      required
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="install-command" label="Install command">
                    <input
                      id="install-command"
                      className={fieldClassName()}
                      placeholder="pnpm install --frozen-lockfile"
                      value={form.install}
                      onChange={(event) => updateForm('install', event.target.value)}
                      required
                    />
                  </Field>
                  <Field id="build-command" label="Build command">
                    <input
                      id="build-command"
                      className={fieldClassName()}
                      placeholder="pnpm build"
                      value={form.build}
                      onChange={(event) => updateForm('build', event.target.value)}
                      required
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="start-command" label="Start command">
                    <input
                      id="start-command"
                      className={fieldClassName()}
                      placeholder="pnpm start"
                      value={form.start}
                      onChange={(event) => updateForm('start', event.target.value)}
                      required
                    />
                  </Field>
                  <Field id="health-check-path" label="Health check path">
                    <input
                      id="health-check-path"
                      className={fieldClassName()}
                      placeholder="/"
                      value={form.healthCheckPath}
                      onChange={(event) => updateForm('healthCheckPath', event.target.value)}
                    />
                  </Field>
                </div>

                <label
                  htmlFor="enable-ssl"
                  className="flex min-h-[44px] items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm"
                >
                  <input
                    id="enable-ssl"
                    type="checkbox"
                    aria-label="Enable SSL"
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    checked={form.tlsEnabled}
                    onChange={(event) => updateForm('tlsEnabled', event.target.checked)}
                  />
                  <span className="space-y-1">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Lock className="h-4 w-4 text-primary" />
                      Enable SSL
                    </span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      Uses Certbot to issue a Let&apos;s Encrypt certificate and redirect HTTP to
                      HTTPS during deployment.
                    </span>
                  </span>
                </label>

                <div className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Environment variables
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        Add one variable per row. Values are hidden by default after saving.
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addEnvRow}>
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>

                  {form.envVars.length > 0 && (
                    <div className="space-y-2">
                      {form.envVars.map((row, index) => (
                        <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_44px]">
                          <input
                            className={fieldClassName()}
                            aria-label={`Environment variable ${index + 1} key`}
                            placeholder="NEXT_PUBLIC_APP_URL"
                            value={row.key}
                            onChange={(event) => updateEnvRow(row.id, 'key', event.target.value)}
                          />
                          <input
                            className={fieldClassName()}
                            aria-label={`Environment variable ${index + 1} value`}
                            placeholder="https://app.example.com"
                            value={row.value}
                            onChange={(event) => updateEnvRow(row.id, 'value', event.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove environment variable ${index + 1}`}
                            onClick={() => removeEnvRow(row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {form.envVars.length === 0 && (
                    <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      No environment variables added.
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={closeForm}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto" loading={submitting}>
                    {editingApp ? <Pencil className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                    {editingApp ? 'Save Changes' : 'Create App'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {appViewModels.map((viewModel) => {
          const {
            app,
            isExpanded,
            isUpdatingThisApp,
            hasRunningUpdateOperation,
            hasRunningOperation,
            operationCount,
            visibleOperations,
          } = viewModel;
          const updateInProgress = isUpdatingThisApp || hasRunningUpdateOperation;
          const deployInProgress =
            deployingId === app.id ||
            app.status === 'deploying' ||
            app.operations.some(
              (operation) => operation.type === 'deploy' && operation.status === 'running'
            );
          const operationInProgress = hasRunningOperation || app.status === 'deploying';
          const acceptedOperation = acceptedOperationLocks[app.id];
          const acceptedDeployInProgress = acceptedOperation?.operationType === 'deploy';
          const acceptedUpdateInProgress = acceptedOperation?.operationType === 'update';
          const operationLocked = operationInProgress || Boolean(acceptedOperation);
          const isDeployingThisApp = deployingId === app.id;
          const showingAllOperations = allOperationAppIds.has(app.id);
          return (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <Globe2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{app.name}</span>
                    </CardTitle>
                    <CardDescription className="mt-1 truncate">
                      {app.sourceType === 'git' ? app.git?.url : app.sourcePath}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(app)}
                    <Badge variant="outline">{app.sourceType === 'git' ? 'Git' : 'Local'}</Badge>
                    {app.sourceType === 'git' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void updateApp(app.id);
                        }}
                        loading={updateInProgress || acceptedUpdateInProgress}
                        disabled={operationLocked}
                        aria-label={
                          updateInProgress || acceptedUpdateInProgress
                            ? 'Update in progress'
                            : undefined
                        }
                        title="Fetch the latest Git branch and deploy it when changes are available"
                      >
                        {!updateInProgress && !acceptedUpdateInProgress && (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        {updateInProgress || acceptedUpdateInProgress ? 'Updating…' : 'Update'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void deployApp(app.id)}
                      loading={deployInProgress || acceptedDeployInProgress}
                      disabled={operationLocked}
                      aria-label={
                        deployInProgress || acceptedDeployInProgress
                          ? 'Deployment in progress'
                          : undefined
                      }
                      title="Build the configured source, activate a new release, and verify its health"
                    >
                      {!deployInProgress && !acceptedDeployInProgress && (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {deployInProgress || acceptedDeployInProgress ? 'Deploying…' : 'Deploy'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Edit ${app.name}`}
                      onClick={() => startEditing(app)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Deployment history for ${app.name}`}
                      onClick={() => setHistoryApp(app)}
                    >
                      <History className="h-3.5 w-3.5" />
                      History
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Runtime logs for ${app.name}`}
                      onClick={() => void openRuntimeLogs(app)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Logs
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${app.name}`}
                      onClick={() => toggleAppExpanded(app.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {isExpanded ? 'Less' : 'More'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      aria-label={`Delete ${app.name}`}
                      onClick={() => setDeleteCandidate(app)}
                      loading={deletingId === app.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Public URL</div>
                    <a
                      href={`https://${app.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex min-w-0 items-center gap-1 font-medium text-primary"
                    >
                      <span className="truncate">{app.domain}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Local port</div>
                    <div className="mt-1 font-medium">127.0.0.1:{app.port}</div>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Current release</div>
                    <div className="mt-1 truncate font-medium">
                      {app.currentReleaseId || 'Not deployed'}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-lg border border-border p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Activity className="h-4 w-4 text-primary" />
                            Runtime
                          </div>
                          {app.runtime?.available ? (
                            <Badge variant="success">{app.runtime.activeState || 'active'}</Badge>
                          ) : (
                            <Badge variant="warning">Unavailable</Badge>
                          )}
                        </div>
                        {app.runtime?.available ? (
                          <div className="grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">Service</div>
                              <div className="mt-1 truncate font-mono">
                                {app.runtime.serviceName}
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">Process</div>
                              <div className="mt-1 font-medium">PID {app.runtime.mainPid || 0}</div>
                            </div>
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">CPU</div>
                              <div className="mt-1 font-medium">
                                {(app.runtime.cpuPercent ?? 0).toFixed(1)}% CPU
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">Memory</div>
                              <div className="mt-1 font-medium">
                                {formatBytes(app.runtime.memoryBytes)} memory
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">Uptime</div>
                              <div className="mt-1 font-medium">
                                {formatUptime(app.runtime.uptimeSeconds)}
                              </div>
                            </div>
                            <div className="rounded-md bg-muted/30 p-2">
                              <div className="text-muted-foreground">Restarts</div>
                              <div className="mt-1 font-medium">
                                {app.runtime.restartCount ?? 0}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                            {app.runtime?.error ||
                              'Runtime inspection is not available for this app.'}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <RefreshCw className="h-4 w-4 text-primary" />
                            Operations
                          </div>
                        </div>
                        {(isDeployingThisApp || isUpdatingThisApp) &&
                          !app.operations.some((operation) => operation.status === 'running') && (
                            <div className="mb-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                              {isDeployingThisApp
                                ? 'Starting deployment and waiting for output…'
                                : 'Checking for updates and waiting for output…'}
                            </div>
                          )}
                        {visibleOperations.length > 0 ? (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {visibleOperations.map(
                                ({ operation, isLiveOperation, visibleLogs }) => {
                                  const logsTitle = operationLogsTitle(operation.type);
                                  const followingLiveOutput =
                                    operationLogFollow[operation.id] !== false;
                                  const displayedLogs =
                                    isLiveOperation && !followingLiveOutput
                                      ? (operationLogSnapshots[operation.id] ?? visibleLogs).slice(
                                          -LIVE_OPERATION_LOG_LIMIT
                                        )
                                      : visibleLogs;
                                  return (
                                    <div
                                      key={operation.id}
                                      className="rounded-md bg-muted/30 p-2 text-xs"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 py-1">
                                          <div className="font-medium text-foreground">
                                            {logsTitle}
                                          </div>
                                          <div className="mt-1 text-muted-foreground">
                                            Started{' '}
                                            {formatOptionalDate(operation.startedAt, 'recently')}
                                          </div>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                          {operationStatusBadge(operation)}
                                        </div>
                                      </div>
                                      <OperationLogViewer
                                        className="mt-2"
                                        output={displayedLogs}
                                        status={operation.status}
                                        label={`${isLiveOperation ? 'Live ' : ''}${operationLogSubject(operation.type)} logs for ${app.name}`}
                                        follow={followingLiveOutput}
                                        onFollowChange={(shouldFollow) =>
                                          updateOperationFollow(operation, shouldFollow)
                                        }
                                        autoscroll={operationLogAutoscroll[operation.id] !== false}
                                        onAutoscrollChange={(shouldAutoscroll) =>
                                          setOperationLogAutoscroll((current) => ({
                                            ...current,
                                            [operation.id]: shouldAutoscroll,
                                          }))
                                        }
                                        wrap={operationLogWrap[operation.id] !== false}
                                        onWrapChange={(shouldWrap) =>
                                          setOperationLogWrap((current) => ({
                                            ...current,
                                            [operation.id]: shouldWrap,
                                          }))
                                        }
                                        onRequestFullscreen={() =>
                                          setOperationLogsTarget({
                                            appId: app.id,
                                            operationId: operation.id,
                                            operationType: operation.type,
                                          })
                                        }
                                        emptyMessage={`Waiting for ${operationLogSubject(operation.type)} output…`}
                                        error={operation.error}
                                        downloadableFilename={`${app.slug}-${operation.type}-${operation.id}.log`}
                                        maxHeightClassName={
                                          isLiveOperation ? 'max-h-56' : 'max-h-24'
                                        }
                                      />
                                    </div>
                                  );
                                }
                              )}
                            </div>
                            {operationCount > 3 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full"
                                aria-expanded={showingAllOperations}
                                onClick={() => toggleAllOperations(app.id)}
                              >
                                {showingAllOperations
                                  ? 'Show recent operations'
                                  : `View all operations (${operationCount})`}
                              </Button>
                            )}
                          </div>
                        ) : !isDeployingThisApp && !isUpdatingThisApp && !hasRunningOperation ? (
                          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            No operations recorded yet.
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                            Waiting for operation output…
                          </div>
                        )}
                      </div>
                    </div>

                    {app.sourceType === 'git' && app.git && (
                      <div className="grid gap-3 text-sm md:grid-cols-4">
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Repository</div>
                          <div className="mt-1 truncate font-medium">{app.git.url}</div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Branch</div>
                          <div className="mt-1 font-medium">{app.git.branch}</div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Commit</div>
                          <div className="mt-1 font-mono font-medium">
                            {app.git.currentSha?.slice(0, 7) || 'Not fetched'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Auto update</div>
                          <div className="mt-1 font-medium">
                            {app.git.autoUpdate.enabled
                              ? `${app.git.autoUpdate.intervalMinutes} min`
                              : 'Off'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Last auto update</div>
                          <div className="mt-1 font-medium">
                            {formatOptionalDate(app.git.autoUpdate.lastRunAt, 'Never run')}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Last result</div>
                          <div className="mt-1">
                            {autoUpdateStatusBadge(app.git.autoUpdate.lastStatus)}
                          </div>
                          {app.git.autoUpdate.lastError && (
                            <div className="mt-2 text-xs leading-5 text-destructive">
                              {app.git.autoUpdate.lastError}
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Next check</div>
                          <div className="mt-1 font-medium">
                            {app.git.autoUpdate.enabled
                              ? formatOptionalDate(app.git.autoUpdate.nextRunAt, 'Pending schedule')
                              : 'Not scheduled'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                      <div className="mb-2 font-medium">TLS</div>
                      <code>
                        {app.tlsEnabled
                          ? `Certbot-managed HTTPS requested for ${app.domain}.`
                          : 'HTTP only. Enable SSL before deploying to request HTTPS.'}
                      </code>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                      <div className="mb-2 font-medium">DNS</div>
                      <code>
                        {app.dns?.summary ||
                          `Create A record for ${app.domain} pointing at this server public IP.`}
                      </code>
                    </div>

                    <div className="rounded-lg border border-border p-3">
                      <div className="mb-2 text-xs font-medium text-muted-foreground">
                        Environment variables
                      </div>
                      {Object.entries(app.envVars).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(app.envVars).map(([key, value]) => {
                            const token = `${app.id}:${key}`;
                            const keyCopyToken = `${token}:key`;
                            const valueCopyToken = `${token}:value`;
                            const isRevealed = revealedEnvVars.has(token);

                            return (
                              <div
                                key={key}
                                className="grid gap-2 rounded-md bg-muted/30 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_36px]"
                              >
                                <button
                                  type="button"
                                  className="flex min-h-9 items-center gap-2 rounded px-2 text-left font-medium text-foreground transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
                                  title="Copy key"
                                  onClick={() => void copyToClipboard(key, keyCopyToken)}
                                >
                                  <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{key}</span>
                                  {copiedTarget === keyCopyToken && (
                                    <span className="ml-auto text-[10px] text-success">Copied</span>
                                  )}
                                </button>
                                {isRevealed ? (
                                  <button
                                    type="button"
                                    className="flex min-h-9 items-center gap-2 rounded px-2 text-left font-mono text-foreground transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring/20"
                                    title="Copy value"
                                    onClick={() => void copyToClipboard(value, valueCopyToken)}
                                  >
                                    <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{value || '(empty)'}</span>
                                    {copiedTarget === valueCopyToken && (
                                      <span className="ml-auto font-sans text-[10px] text-success">
                                        Copied
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <div className="flex min-h-9 items-center rounded px-2 font-mono text-muted-foreground">
                                    <span className="truncate">••••••••••••</span>
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${isRevealed ? 'Hide' : 'Show'} ${key}`}
                                  onClick={() => toggleEnvValue(app.id, key)}
                                >
                                  {isRevealed ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                          No environment variables configured.
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-border p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          Commands
                        </div>
                        <pre className="whitespace-pre-wrap text-xs">{`${app.commands.install}\n${app.commands.build}\n${app.commands.start}`}</pre>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          Latest logs
                        </div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                          {app.releases.at(-1)?.logs.join('\n') || 'No deployments yet.'}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {apps.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Create your first app to start managing deployments from ServerMon.
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(deleteCandidate)}
        title={deleteCandidate ? `Delete ${deleteCandidate.name}?` : 'Delete app?'}
        message={
          deleteCandidate
            ? `This will permanently remove ${deleteCandidate.name}, stop and disable its service, delete its Nginx config, remove all managed releases and repository data, and delete the app record. This cannot be undone.`
            : 'This cannot be undone.'
        }
        description={deleteCandidate?.domain}
        confirmLabel="Delete permanently"
        cancelLabel="Keep app"
        variant="danger"
        isLoading={Boolean(deleteCandidate && deletingId === deleteCandidate.id)}
        onConfirm={() => void deleteApp()}
        onCancel={() => setDeleteCandidate(null)}
      />

      {historyApp && (
        <AppsDeploymentHistoryDialog
          historyApp={historyApp}
          rollbackTarget={rollbackTarget}
          onClose={() => setHistoryApp(null)}
          onOpenLogs={(release) => {
            const matchingOperation = [...historyApp.operations]
              .reverse()
              .find(
                (operation) =>
                  operation.releaseId === release.id && !isWorkerQueueOperation(operation)
              );
            setOperationLogsTarget({
              appId: historyApp.id,
              operationId: matchingOperation?.id,
              operationType: 'deploy',
              operationSnapshot: matchingOperation ? undefined : releaseToLogOperation(release),
            });
          }}
          onRollback={async (appId, releaseId) => {
            await rollbackApp(appId, releaseId);
          }}
        />
      )}

      {runtimeLogsApp && (
        <AppsRuntimeLogsDialog
          app={runtimeLogsApp}
          logs={runtimeLogs}
          loading={runtimeLogsLoading}
          error={runtimeLogsError}
          onClose={() => setRuntimeLogsApp(null)}
        />
      )}

      {operationLogsTarget && operationLogsApp && (
        <AppsOperationLogsDialog
          appName={operationLogsApp.name}
          operationType={operationLogsTarget.operationType}
          operation={selectedOperationForDialog}
          pendingState={operationLogsTarget.queueOperationId ? 'starting' : 'queueing'}
          follow={selectedOperationFollow}
          onFollowChange={(shouldFollow) => {
            if (selectedOperation) updateOperationFollow(selectedOperation, shouldFollow);
          }}
          autoscroll={
            selectedOperation ? operationLogAutoscroll[selectedOperation.id] !== false : true
          }
          onAutoscrollChange={(shouldAutoscroll) => {
            if (!selectedOperation) return;
            setOperationLogAutoscroll((current) => ({
              ...current,
              [selectedOperation.id]: shouldAutoscroll,
            }));
          }}
          wrap={selectedOperation ? operationLogWrap[selectedOperation.id] !== false : true}
          onWrapChange={(shouldWrap) => {
            if (!selectedOperation) return;
            setOperationLogWrap((current) => ({
              ...current,
              [selectedOperation.id]: shouldWrap,
            }));
          }}
          onClose={() => setOperationLogsTarget(null)}
        />
      )}
    </div>
  );
}
