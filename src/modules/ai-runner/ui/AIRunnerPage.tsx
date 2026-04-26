'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Clock3,
  Copy,
  Download,
  Eye,
  FileJson,
  HardDrive,
  ListFilter,
  Plus,
  Play,
  RefreshCcw,
  Save,
  Search,
  Square,
  TerminalSquare,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type {
  AIRunnerLogEntry,
  AIRunnerLogsResponse,
  AIRunnerAutoflowDTO,
  AIRunnerImportConflictDTO,
  AIRunnerImportDecision,
  AIRunnerImportPreviewDTO,
  AIRunnerImportResultDTO,
  AIRunnerPortableBundle,
  AIRunnerPortableResource,
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerPromptAttachmentDTO,
  AIRunnerPromptAttachmentRefDTO,
  AIRunnerPromptTemplateDTO,
  AIRunnerRunDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
  AIRunnerSettingsDTO,
  AIRunnerWorkspaceDTO,
} from '../types';
import { TAB_META, DEFAULT_PROFILE_FORM, ICON_PRESETS } from './constants';
import { RunDetailDrawer } from './components/RunDetailDrawer';
import { ScheduleBuilder } from './components/ScheduleBuilder';
import { ScheduleVisualizationModal } from './components/ScheduleVisualizationModal';
import { CompactStat, LabelWithHint, ProfileIconPreview } from './components/AIRunnerShared';
import type {
  HistoryDetailSection,
  AutoflowItemDraft,
  ProfileFormState,
  PromptFormState,
  PromptTemplateFormState,
  ScheduleFormState,
  ViewTab,
  WorkspaceFormState,
} from './types';
import { useRealtimeNow } from './useRealtimeNow';
import {
  emptyPromptForm,
  emptyScheduleForm,
  formatCountdown,
  formatDateTime,
  formatDuration,
  formatMemory,
  formatRelative,
  formatScheduleDate,
  getRunStatusVariant,
  getScheduleModeLabel,
  getScheduleStatusVariant,
  humanizeCron,
  slugifyValue,
} from './utils';
import { buildScheduleVisualizationModel } from './scheduleVisualization';

const SCHEDULE_SURFACE_REFRESH_MS = 15_000;
const HISTORY_REFRESH_MS = 5_000;
const ACTIVE_SCHEDULE_RUN_REFRESH_MS = 5_000;
const LOG_ENTRY_LIMIT = 500;
const PROMPT_TEMPLATE_PLACEHOLDER = '<YOUR_PROMPT>';
const PORTABLE_RESOURCE_OPTIONS: Array<{
  id: AIRunnerPortableResource;
  label: string;
  description: string;
}> = [
  {
    id: 'settings',
    label: 'Settings',
    description: 'Global schedule queue and default AutoFlow mode.',
  },
  {
    id: 'profiles',
    label: 'Agent Profiles',
    description: 'CLI invocation templates, timeouts, env, icons, and enabled state.',
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    description: 'Named paths, blocking behavior, and availability.',
  },
  {
    id: 'prompts',
    label: 'Saved Prompts',
    description: 'Reusable prompts that can be run or scheduled.',
  },
  {
    id: 'promptTemplates',
    label: 'Prompt Templates',
    description: 'Prompt wrappers loaded into editors.',
  },
  {
    id: 'schedules',
    label: 'Schedules',
    description: 'Cron automations with portable prompt/profile/workspace references.',
  },
];
const DEFAULT_PORTABLE_RESOURCES = PORTABLE_RESOURCE_OPTIONS.map((item) => item.id);
const MAX_PROMPT_ATTACHMENTS = 8;
const MAX_PROMPT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
const DEFAULT_MONGO_RETENTION_DAYS = 30;
const DEFAULT_ARTIFACT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;

interface AIRunnerRuntimeDiagnostics {
  runtime?: {
    kind?: 'interactive' | 'systemd' | 'launchd' | 'background';
    serviceManager?: 'systemd' | 'launchd' | null;
    scheduleReliability?: 'session-bound' | 'reboot-safe' | 'unknown';
    summary?: string;
  };
  process?: {
    platform?: string;
  };
}

type LinkedDeleteTarget =
  | { kind: 'prompt'; id: string; name: string; scheduleCount: number }
  | { kind: 'profile'; id: string; name: string; scheduleCount: number }
  | { kind: 'workspace'; id: string; name: string; scheduleCount: number };

interface StorageSettingsFormState {
  artifactBaseDir: string;
  mongoRetentionDays: string;
  artifactRetentionDays: string;
}

function storageSettingsFormFromSettings(
  settings: AIRunnerSettingsDTO | null
): StorageSettingsFormState {
  return {
    artifactBaseDir: settings?.artifactBaseDir ?? '',
    mongoRetentionDays: String(settings?.mongoRetentionDays ?? DEFAULT_MONGO_RETENTION_DAYS),
    artifactRetentionDays: String(
      settings?.artifactRetentionDays ?? DEFAULT_ARTIFACT_RETENTION_DAYS
    ),
  };
}

function defaultStorageSettingsFormFromSettings(
  settings: AIRunnerSettingsDTO | null
): StorageSettingsFormState {
  return {
    artifactBaseDir: settings?.defaultArtifactBaseDir ?? settings?.artifactBaseDir ?? '',
    mongoRetentionDays: String(
      settings?.defaultMongoRetentionDays ?? DEFAULT_MONGO_RETENTION_DAYS
    ),
    artifactRetentionDays: String(
      settings?.defaultArtifactRetentionDays ?? DEFAULT_ARTIFACT_RETENTION_DAYS
    ),
  };
}

function parseRetentionDays(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_RETENTION_DAYS || parsed > MAX_RETENTION_DAYS) return null;
  return parsed;
}

function getActiveScheduleRunLabel(run?: AIRunnerRunDTO | null): string | null {
  if (!run) return null;
  if (run.status === 'running') return 'running now';
  if (run.status === 'retrying') return 'retrying now';
  if (run.status === 'queued') return 'queued now';
  return null;
}

function getSchedulerReliabilityWarning(
  diagnostics: AIRunnerRuntimeDiagnostics | null
): { title: string; body: string } | null {
  const reliability = diagnostics?.runtime?.scheduleReliability;

  if (reliability === 'reboot-safe') {
    return null;
  }

  if (reliability === 'session-bound') {
    return {
      title: 'Schedules are tied to this live session',
      body: 'ServerMon is running from an interactive session, so scheduled AI runs stop when this process exits, the terminal closes, or the machine reboots. Run ServerMon as a boot-time service for reboot-safe schedules.',
    };
  }

  if (reliability === 'unknown') {
    return {
      title: 'Reboot persistence is not confirmed',
      body: 'ServerMon is running without a detected system service manager, so scheduled runs may pause after reboot until the app starts again.',
    };
  }

  return null;
}

function mergeLogEntries(
  current: AIRunnerLogEntry[],
  incoming: AIRunnerLogEntry[]
): AIRunnerLogEntry[] {
  const merged = new Map<string, AIRunnerLogEntry>();
  for (const entry of [...current, ...incoming]) {
    merged.set(entry.id, entry);
  }

  return Array.from(merged.values())
    .sort((left, right) => {
      return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
    })
    .slice(-LOG_ENTRY_LIMIT);
}

function applyPromptTemplate(template: string, current: string): string {
  if (!current.trim()) return template;
  if (template.includes(PROMPT_TEMPLATE_PLACEHOLDER)) {
    return template.replaceAll(PROMPT_TEMPLATE_PLACEHOLDER, current);
  }
  return `${template.trim()}\n\n${current.trim()}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function validateAttachmentFiles(
  files: File[],
  currentSize: number,
  currentCount: number
): string | null {
  if (currentCount + files.length > MAX_PROMPT_ATTACHMENTS) {
    return `Attach up to ${MAX_PROMPT_ATTACHMENTS} files.`;
  }
  if (files.some((file) => file.size > MAX_PROMPT_ATTACHMENT_BYTES)) {
    return 'Each attachment must be 5 MB or smaller.';
  }
  const total = files.reduce((sum, file) => sum + file.size, currentSize);
  if (total > MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES) {
    return 'Prompt attachments must be 10 MB or smaller in total.';
  }
  return null;
}

function acceptAttachmentDrag(event: DragEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'copy';
}

function getDroppedAttachmentFiles(event: DragEvent<HTMLElement>): FileList {
  acceptAttachmentDrag(event);
  return event.dataTransfer.files;
}

function emptyWorkspaceForm(path = ''): WorkspaceFormState {
  return {
    name: '',
    path,
    blocking: true,
    enabled: true,
    notes: '',
  };
}

function emptyPromptTemplateForm(): PromptTemplateFormState {
  return {
    name: '',
    content: `Checkout main, reset code,\n\n${PROMPT_TEMPLATE_PLACEHOLDER}\n\nCreate PR using gh cli`,
    description: '',
    tags: [],
  };
}

function getResourceLabel(resource: AIRunnerPortableResource): string {
  return PORTABLE_RESOURCE_OPTIONS.find((item) => item.id === resource)?.label ?? resource;
}

export default function AIRunnerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ViewTab>('autoflows');
  const liveNow = useRealtimeNow(activeTab === 'schedules');
  const [loading, setLoading] = useState(true);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [profiles, setProfiles] = useState<AIRunnerProfileDTO[]>([]);
  const [prompts, setPrompts] = useState<AIRunnerPromptDTO[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<AIRunnerPromptTemplateDTO[]>([]);
  const [workspaces, setWorkspaces] = useState<AIRunnerWorkspaceDTO[]>([]);
  const [autoflows, setAutoflows] = useState<AIRunnerAutoflowDTO[]>([]);
  const [schedules, setSchedules] = useState<AIRunnerScheduleDTO[]>([]);
  const [runs, setRuns] = useState<AIRunnerRunDTO[]>([]);
  const [activeScheduleRuns, setActiveScheduleRuns] = useState<AIRunnerRunDTO[]>([]);
  const [logEntries, setLogEntries] = useState<AIRunnerLogEntry[]>([]);
  const [logStreamConnected, setLogStreamConnected] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | AIRunnerLogEntry['level']>('all');
  const [logFilePath, setLogFilePath] = useState('');
  const [logSessionId, setLogSessionId] = useState('');
  const [logsError, setLogsError] = useState<string | null>(null);
  const [directories, setDirectories] = useState<string[]>([]);
  const [runnerSettings, setRunnerSettings] = useState<AIRunnerSettingsDTO | null>(null);
  const [storageSettingsForm, setStorageSettingsForm] = useState<StorageSettingsFormState>(() =>
    storageSettingsFormFromSettings(null)
  );
  const [storageSettingsSaving, setStorageSettingsSaving] = useState(false);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<AIRunnerRuntimeDiagnostics | null>(
    null
  );
  const [selectedRun, setSelectedRun] = useState<AIRunnerRunDTO | null>(null);
  const [runSearch, setRunSearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | AIRunnerRunDTO['status']>(
    'all'
  );
  const [historyTriggerFilter, setHistoryTriggerFilter] = useState<
    'all' | AIRunnerRunDTO['triggeredBy']
  >('all');
  const [historyProfileFilter, setHistoryProfileFilter] = useState<string>('all');
  const [historyScheduleFilter, setHistoryScheduleFilter] = useState<string>('all');
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetailSection, setHistoryDetailSection] = useState<HistoryDetailSection>('summary');
  const [focusedHistoryRunId, setFocusedHistoryRunId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [globalScheduleTogglePending, setGlobalScheduleTogglePending] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptTemplateId, setEditingPromptTemplateId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptTemplateModalOpen, setPromptTemplateModalOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleMode, setBundleMode] = useState<'export' | 'import'>('export');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleVisualizationOpen, setScheduleVisualizationOpen] = useState(false);
  const [linkedDeleteTarget, setLinkedDeleteTarget] = useState<LinkedDeleteTarget | null>(null);
  const [linkedDeletePending, setLinkedDeletePending] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [scheduleVisualizationProfileId, setScheduleVisualizationProfileId] = useState<
    string | null
  >(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM);
  const [promptForm, setPromptForm] = useState<PromptFormState>(emptyPromptForm());
  const [promptTemplateForm, setPromptTemplateForm] =
    useState<PromptTemplateFormState>(emptyPromptTemplateForm());
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormState>(emptyWorkspaceForm());
  const [selectedExportResources, setSelectedExportResources] = useState<
    AIRunnerPortableResource[]
  >(DEFAULT_PORTABLE_RESOURCES);
  const [selectedImportResources, setSelectedImportResources] = useState<
    AIRunnerPortableResource[]
  >(DEFAULT_PORTABLE_RESOURCES);
  const [exportJson, setExportJson] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importPreview, setImportPreview] = useState<AIRunnerImportPreviewDTO | null>(null);
  const [importResult, setImportResult] = useState<AIRunnerImportResultDTO | null>(null);
  const [importDecisions, setImportDecisions] = useState<AIRunnerImportDecision[]>([]);
  const [bundlePending, setBundlePending] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(emptyScheduleForm());
  const [autoflowName, setAutoflowName] = useState('');
  const [autoflowMode, setAutoflowMode] = useState<'sequential' | 'parallel'>('sequential');
  const [autoflowContinueOnFailure, setAutoflowContinueOnFailure] = useState(false);
  const [autoflowItems, setAutoflowItems] = useState<AutoflowItemDraft[]>([]);
  const [autoflowDraft, setAutoflowDraft] = useState<AutoflowItemDraft>({
    name: '',
    promptContent: '',
    promptType: 'inline',
    attachments: [],
    agentProfileId: '',
    workspaceId: undefined,
    workingDirectory: '',
    timeout: 30,
  });
  const selectedRunPromptDoc =
    prompts.find((prompt) => prompt._id === selectedRun?.promptId) ?? null;
  const selectedRunSchedule =
    schedules.find((schedule) => schedule._id === selectedRun?.scheduleId) ?? null;

  // Keep latest values in refs so that data-loading callbacks can stay stable
  // (not dependent on search/form state) and don't re-run 5 parallel fetches
  // on every keystroke.
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;

  const runsAbortRef = useRef<AbortController | null>(null);
  const metadataAbortRef = useRef<AbortController | null>(null);
  const schedulesAbortRef = useRef<AbortController | null>(null);
  const pendingActionsRef = useRef<Set<string>>(new Set());
  const logViewportRef = useRef<HTMLDivElement | null>(null);
  const logsEventSourceRef = useRef<EventSource | null>(null);
  const historyRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const setActionPending = useCallback((key: string, pending: boolean) => {
    const nextPendingActions = new Set(pendingActionsRef.current);
    if (pending) {
      nextPendingActions.add(key);
    } else {
      nextPendingActions.delete(key);
    }
    pendingActionsRef.current = nextPendingActions;
    setPendingActions(nextPendingActions);
  }, []);

  const runExclusiveAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      if (pendingActionsRef.current.has(key)) return;
      setActionPending(key, true);
      try {
        await action();
      } catch (error) {
        toast({
          title: 'Action failed',
          description: error instanceof Error ? error.message : 'Unable to complete this action',
          variant: 'destructive',
        });
      } finally {
        setActionPending(key, false);
      }
    },
    [setActionPending, toast]
  );

  const isActionPending = useCallback((key: string) => pendingActions.has(key), [pendingActions]);

  const loadRuns = useCallback(
    async (searchOverride?: string) => {
      const search = searchOverride ?? runSearchRef.current;
      runsAbortRef.current?.abort();
      const controller = new AbortController();
      runsAbortRef.current = controller;
      try {
        const response = await fetch(
          `/api/modules/ai-runner/runs?limit=25${search ? `&search=${encodeURIComponent(search)}` : ''}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) return;
        const payload: AIRunnerRunsResponse = await response.json();
        if (controller.signal.aborted) return;
        setRuns(payload.runs);
        setRunsLoaded(true);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        toast({
          title: 'Load failed',
          description: error instanceof Error ? error.message : 'Failed to load runs',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const loadMetadata = useCallback(async () => {
    metadataAbortRef.current?.abort();
    const controller = new AbortController();
    metadataAbortRef.current = controller;
    try {
      const [
        profilesRes,
        promptsRes,
        templatesRes,
        workspacesRes,
        autoflowsRes,
        directoriesRes,
        diagnosticsRes,
        settingsRes,
      ] = await Promise.all([
        fetch('/api/modules/ai-runner/profiles', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/modules/ai-runner/prompts', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/modules/ai-runner/prompt-templates', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/modules/ai-runner/workspaces', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/modules/ai-runner/autoflows', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/modules/ai-runner/directories', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        fetch('/api/system/diagnostics', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/modules/ai-runner/settings', {
          cache: 'no-store',
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      if (profilesRes.ok) {
        const profilePayload: AIRunnerProfileDTO[] = await profilesRes.json();
        setProfiles(profilePayload);
        if (profilePayload[0]) {
          // Initialise launch forms only when they haven't been
          // touched yet — functional setters read the current value so this
          // stays idempotent across reloads.
          setScheduleForm((current) =>
            current.agentProfileId
              ? current
              : {
                  ...current,
                  agentProfileId: profilePayload[0]._id,
                  timeout: profilePayload[0].defaultTimeout,
                }
          );
          setAutoflowDraft((current) =>
            current.agentProfileId
              ? current
              : {
                  ...current,
                  agentProfileId: profilePayload[0]._id,
                  timeout: profilePayload[0].defaultTimeout,
                }
          );
        }
      }

      if (promptsRes.ok) {
        setPrompts(await promptsRes.json());
      }

      if (templatesRes.ok) {
        setPromptTemplates(await templatesRes.json());
      }

      if (workspacesRes.ok) {
        const workspacePayload: AIRunnerWorkspaceDTO[] = await workspacesRes.json();
        setWorkspaces(workspacePayload);
        const firstWorkspace = workspacePayload.find((workspace) => workspace.enabled);
        if (firstWorkspace) {
          setScheduleForm((current) => ({
            ...current,
            workspaceId: current.workspaceId || firstWorkspace._id,
            workingDirectory: current.workingDirectory || firstWorkspace.path,
          }));
          setAutoflowDraft((current) => ({
            ...current,
            workspaceId: current.workspaceId || firstWorkspace._id,
            workingDirectory: current.workingDirectory || firstWorkspace.path,
          }));
        }
      }

      if (autoflowsRes.ok) {
        setAutoflows(await autoflowsRes.json());
      }

      if (directoriesRes.ok) {
        const payload = await directoriesRes.json();
        if (controller.signal.aborted) return;
        setDirectories(payload.directories ?? []);
        setScheduleForm((current) => ({
          ...current,
          workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
        }));
        setAutoflowDraft((current) => ({
          ...current,
          workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
        }));
      }

      if (diagnosticsRes.ok) {
        const payload: AIRunnerRuntimeDiagnostics = await diagnosticsRes.json();
        if (controller.signal.aborted) return;
        setRuntimeDiagnostics(payload);
      }

      if (settingsRes.ok) {
        const payload: AIRunnerSettingsDTO = await settingsRes.json();
        if (controller.signal.aborted) return;
        setRunnerSettings(payload);
        setStorageSettingsForm(storageSettingsFormFromSettings(payload));
        setAutoflowMode(payload.autoflowMode);
      }

      setMetadataLoaded(true);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load AI Runner data',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadSchedules = useCallback(async () => {
    schedulesAbortRef.current?.abort();
    const controller = new AbortController();
    schedulesAbortRef.current = controller;
    try {
      const response = await fetch('/api/modules/ai-runner/schedules', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok || controller.signal.aborted) return;
      setSchedules(await response.json());
      setSchedulesLoaded(true);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load schedules',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadActiveRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/ai-runner/runs/active', {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const payload: AIRunnerRunDTO[] = await response.json();
      setActiveScheduleRuns(payload.filter((run) => Boolean(run.scheduleId)));
    } catch {
      /* lightweight background poll; ignore transient failures */
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/modules/ai-runner/logs?limit=250', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to load AI Runner logs');
      }
      const payload: AIRunnerLogsResponse = await response.json();
      setLogEntries(payload.entries ?? []);
      setLogFilePath(payload.filePath ?? '');
      setLogSessionId(payload.sessionId ?? '');
      setLogsError(null);
    } catch (error) {
      toast({
        title: 'Log load failed',
        description: error instanceof Error ? error.message : 'Failed to load AI Runner logs',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadAll = useCallback(
    async (searchOverride?: string) => {
      setRefreshing(true);
      try {
        const tasks: Promise<unknown>[] = [loadMetadata()];
        if (activeTab === 'history') {
          tasks.push(loadRuns(searchOverride), loadSchedules());
        } else if (activeTab === 'schedules') {
          tasks.push(loadSchedules(), loadActiveRuns());
        } else if (activeTab === 'settings') {
          tasks.push(loadSchedules());
        } else if (activeTab === 'logs') {
          tasks.push(loadLogs());
        }
        await Promise.all(tasks);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, loadActiveRuns, loadLogs, loadMetadata, loadRuns, loadSchedules]
  );

  // Initial load — runs once on mount. Abort any in-flight fetches on unmount.
  useEffect(() => {
    void (async () => {
      try {
        await loadMetadata();
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      runsAbortRef.current?.abort();
      metadataAbortRef.current?.abort();
      schedulesAbortRef.current?.abort();
    };
  }, [loadMetadata]);

  // Debounced refetch of runs when the history search input changes. We
  // deliberately don't re-run metadata loads here — typing in the search
  // field used to refire 5 parallel fetches on every keystroke.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!metadataLoaded) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!runsLoaded) return;
    const handle = window.setTimeout(() => {
      void loadRuns(runSearch);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [loadRuns, metadataLoaded, runSearch, runsLoaded]);

  useEffect(() => {
    if (!metadataLoaded || activeTab !== 'history') return;

    if (!schedulesLoaded) {
      void loadSchedules();
    }

    const refreshHistoryRuns = () => {
      if (document.visibilityState !== 'visible') return;
      void loadRuns();
    };

    refreshHistoryRuns();
    const interval = window.setInterval(refreshHistoryRuns, HISTORY_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [activeTab, loadRuns, loadSchedules, metadataLoaded, schedulesLoaded]);

  useEffect(() => {
    if (!metadataLoaded) return;
    if (activeTab !== 'schedules' && activeTab !== 'settings') return;

    const refreshSchedules = () => {
      if (document.visibilityState !== 'visible') return;
      void loadSchedules();
    };

    refreshSchedules();
    const interval = window.setInterval(refreshSchedules, SCHEDULE_SURFACE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [activeTab, loadSchedules, metadataLoaded]);

  useEffect(() => {
    if (!metadataLoaded || activeTab !== 'schedules') return;

    const refreshActiveScheduleRuns = () => {
      if (document.visibilityState !== 'visible') return;
      void loadActiveRuns();
    };

    refreshActiveScheduleRuns();
    const interval = window.setInterval(refreshActiveScheduleRuns, ACTIVE_SCHEDULE_RUN_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [activeTab, loadActiveRuns, metadataLoaded]);

  useEffect(() => {
    if (!metadataLoaded || activeTab !== 'logs') return;
    void loadLogs();
  }, [activeTab, loadLogs, metadataLoaded]);

  useEffect(() => {
    if (activeTab !== 'logs') {
      logsEventSourceRef.current?.close();
      logsEventSourceRef.current = null;
      setLogStreamConnected(false);
      return;
    }

    const source = new EventSource('/api/modules/ai-runner/logs/stream');
    logsEventSourceRef.current = source;

    source.onopen = () => {
      setLogStreamConnected(true);
      setLogsError(null);
    };

    source.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as AIRunnerLogEntry;
        setLogEntries((current) => mergeLogEntries(current, [entry]));
      } catch {
        /* ignore malformed stream payloads */
      }
    };

    source.onerror = () => {
      setLogStreamConnected(false);
      setLogsError('Live stream disconnected. Waiting to reconnect...');
    };

    return () => {
      source.close();
      if (logsEventSourceRef.current === source) {
        logsEventSourceRef.current = null;
      }
      setLogStreamConnected(false);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'logs' || !logViewportRef.current) return;
    logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
  }, [activeTab, logEntries]);

  // Poll the currently-selected run while it's active. Depend only on the
  // run id/status so setSelectedRun(run) inside the interval doesn't tear
  // down and recreate the interval on every tick.
  const selectedRunId = selectedRun?._id;
  const selectedRunStatus = selectedRun?.status;
  useEffect(() => {
    if (!selectedRunId || !selectedRunStatus) return;
    if (!['queued', 'running', 'retrying'].includes(selectedRunStatus)) return;

    let cancelled = false;
    const controller = new AbortController();

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/modules/ai-runner/runs/${selectedRunId}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || cancelled) return;
        const run: AIRunnerRunDTO = await response.json();
        if (cancelled) return;
        setSelectedRun((current) => (current?._id === run._id ? run : current));
        setRuns((current) => current.map((item) => (item._id === run._id ? run : item)));
      } catch {
        /* aborted or transient — ignored */
      }
    }, 2000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [selectedRunId, selectedRunStatus]);

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((profile) => [profile._id, profile])),
    [profiles]
  );

  const promptMap = useMemo(
    () => Object.fromEntries(prompts.map((prompt) => [prompt._id, prompt])),
    [prompts]
  );
  const workspaceMap = useMemo(
    () => Object.fromEntries(workspaces.map((workspace) => [workspace._id, workspace])),
    [workspaces]
  );
  const scheduleMap = useMemo(
    () => Object.fromEntries(schedules.map((schedule) => [schedule._id, schedule])),
    [schedules]
  );
  const autoflowMap = useMemo(
    () => Object.fromEntries(autoflows.map((autoflow) => [autoflow._id, autoflow])),
    [autoflows]
  );
  const getAutoflowItemForRun = useCallback(
    (run: Pick<AIRunnerRunDTO, '_id' | 'autoflowId' | 'autoflowItemId'>) => {
      if (!run.autoflowId) return undefined;
      return autoflowMap[run.autoflowId]?.items.find(
        (item) => item.runId === run._id || item._id === run.autoflowItemId
      );
    },
    [autoflowMap]
  );
  const getLinkedScheduleCount = (kind: LinkedDeleteTarget['kind'], id: string): number => {
    if (kind === 'prompt') {
      return schedules.filter((schedule) => schedule.promptId === id).length;
    }
    if (kind === 'profile') {
      return schedules.filter((schedule) => schedule.agentProfileId === id).length;
    }
    return schedules.filter((schedule) => schedule.workspaceId === id).length;
  };
  const getScheduleMissingReferences = (schedule: AIRunnerScheduleDTO): string[] => {
    const missing: string[] = [];
    if (!promptMap[schedule.promptId]) missing.push('prompt');
    if (!profileMap[schedule.agentProfileId]) missing.push('profile');
    if (schedule.workspaceId && !workspaceMap[schedule.workspaceId]) missing.push('workspace');
    return missing;
  };
  const filteredPrompts = useMemo(() => prompts, [prompts]);
  const activeWorkspaceCount = workspaces.filter((workspace) => workspace.enabled).length;
  const blockingWorkspaceCount = workspaces.filter((workspace) => workspace.blocking).length;

  const filteredHistoryRuns = useMemo(() => {
    const query = runSearch.trim().toLowerCase();
    return runs.filter((run) => {
      const matchesStatus = historyStatusFilter === 'all' || run.status === historyStatusFilter;
      const matchesTrigger =
        historyTriggerFilter === 'all' || run.triggeredBy === historyTriggerFilter;
      const matchesProfile =
        historyProfileFilter === 'all' || run.agentProfileId === historyProfileFilter;
      const matchesSchedule =
        historyScheduleFilter === 'all' ||
        (historyScheduleFilter === 'none'
          ? !run.scheduleId
          : run.scheduleId === historyScheduleFilter);
      const promptName = run.promptId ? (promptMap[run.promptId]?.name ?? '') : '';
      const scheduleName = run.scheduleId ? (scheduleMap[run.scheduleId]?.name ?? '') : '';
      const autoflowName = run.autoflowId ? (autoflowMap[run.autoflowId]?.name ?? '') : '';
      const autoflowItemName = getAutoflowItemForRun(run)?.name ?? '';
      const profileName = profileMap[run.agentProfileId]?.name ?? '';
      const matchesSearch =
        query.length === 0 ||
        run.promptContent.toLowerCase().includes(query) ||
        run.command.toLowerCase().includes(query) ||
        run.workingDirectory.toLowerCase().includes(query) ||
        promptName.toLowerCase().includes(query) ||
        scheduleName.toLowerCase().includes(query) ||
        autoflowName.toLowerCase().includes(query) ||
        autoflowItemName.toLowerCase().includes(query) ||
        profileName.toLowerCase().includes(query);

      return matchesStatus && matchesTrigger && matchesProfile && matchesSchedule && matchesSearch;
    });
  }, [
    historyProfileFilter,
    historyScheduleFilter,
    historyStatusFilter,
    historyTriggerFilter,
    profileMap,
    promptMap,
    runSearch,
    runs,
    scheduleMap,
    autoflowMap,
    getAutoflowItemForRun,
  ]);

  const enabledScheduleCount = schedules.filter((schedule) => schedule.enabled).length;
  const schedulesGloballyEnabled = runnerSettings?.schedulesGloballyEnabled ?? true;
  const schedulerReliabilityWarning = getSchedulerReliabilityWarning(runtimeDiagnostics);
  const enabledProfileCount = profiles.filter((profile) => profile.enabled).length;
  const pausedScheduleCount = schedules.length - enabledScheduleCount;
  const scheduledProfileCount = new Set(schedules.map((schedule) => schedule.agentProfileId)).size;
  const recentlyActiveScheduleCount = schedules.filter((schedule) => {
    if (!schedule.lastRunAt) return false;
    return Date.now() - new Date(schedule.lastRunAt).getTime() < 24 * 60 * 60 * 1000;
  }).length;
  const nextSchedule = schedules
    .filter((schedule) => schedule.enabled && schedule.nextRunTime)
    .sort((a, b) => new Date(a.nextRunTime!).getTime() - new Date(b.nextRunTime!).getTime())[0];
  const activeScheduleRunMap = useMemo(() => {
    const statusRank: Record<AIRunnerRunDTO['status'], number> = {
      running: 3,
      retrying: 2,
      queued: 1,
      completed: 0,
      failed: 0,
      timeout: 0,
      killed: 0,
    };

    const selectedRuns = new Map<string, AIRunnerRunDTO>();
    for (const run of activeScheduleRuns) {
      if (!run.scheduleId) continue;
      const current = selectedRuns.get(run.scheduleId);
      if (!current) {
        selectedRuns.set(run.scheduleId, run);
        continue;
      }

      const currentRank = statusRank[current.status] ?? 0;
      const nextRank = statusRank[run.status] ?? 0;
      if (nextRank > currentRank) {
        selectedRuns.set(run.scheduleId, run);
        continue;
      }

      const currentTime = new Date(current.startedAt ?? current.queuedAt).getTime();
      const nextTime = new Date(run.startedAt ?? run.queuedAt).getTime();
      if (nextTime > currentTime) {
        selectedRuns.set(run.scheduleId, run);
      }
    }

    return Object.fromEntries(selectedRuns.entries());
  }, [activeScheduleRuns]);
  const nextScheduleActiveRun = nextSchedule ? activeScheduleRunMap[nextSchedule._id] : undefined;
  const nextScheduleStatusLabel = getActiveScheduleRunLabel(nextScheduleActiveRun);
  const sortedSchedules = [...schedules].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.nextRunTime && right.nextRunTime) {
      return new Date(left.nextRunTime).getTime() - new Date(right.nextRunTime).getTime();
    }
    if (left.nextRunTime) return -1;
    if (right.nextRunTime) return 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
  const scheduleFormPromptName = scheduleForm.promptId
    ? promptMap[scheduleForm.promptId]?.name || 'Unknown prompt'
    : 'Choose a saved prompt';
  const scheduleFormProfileName = scheduleForm.agentProfileId
    ? profileMap[scheduleForm.agentProfileId]?.name || 'Unknown profile'
    : 'Choose an agent profile';
  const scheduleVisualizationProfile = scheduleVisualizationProfileId
    ? (profileMap[scheduleVisualizationProfileId] ?? null)
    : null;
  const visualizationSchedules = scheduleVisualizationProfileId
    ? schedules.filter((schedule) => schedule.agentProfileId === scheduleVisualizationProfileId)
    : schedules;
  const profileScheduleSummaryMap = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((profile) => {
          const profileSchedules = schedules.filter(
            (schedule) => schedule.agentProfileId === profile._id
          );
          const visualization = buildScheduleVisualizationModel(profileSchedules);
          const nextLaunch = profileSchedules
            .filter((schedule) => schedule.enabled && schedule.nextRunTime)
            .sort((left, right) => {
              return new Date(left.nextRunTime!).getTime() - new Date(right.nextRunTime!).getTime();
            })[0]?.nextRunTime;

          return [
            profile._id,
            {
              totalSchedules: profileSchedules.length,
              enabledSchedules: profileSchedules.filter((schedule) => schedule.enabled).length,
              workspaceCount: visualization.workspaceCount,
              highRiskWorkspaceCount: visualization.highRiskWorkspaceCount,
              nextLaunch,
            },
          ];
        })
      ),
    [profiles, schedules]
  );

  const hasAutoflowDraftPrompt = Boolean(autoflowDraft.promptContent?.trim());
  const filteredLogEntries = useMemo(() => {
    if (logLevelFilter === 'all') return logEntries;
    return logEntries.filter((entry) => entry.level === logLevelFilter);
  }, [logEntries, logLevelFilter]);

  const selectProfileForEdit = (profile: AIRunnerProfileDTO) => {
    setEditingProfileId(profile._id);
    setProfileForm({
      name: profile.name,
      slug: profile.slug,
      agentType: profile.agentType,
      invocationTemplate: profile.invocationTemplate,
      defaultTimeout: profile.defaultTimeout,
      maxTimeout: profile.maxTimeout,
      shell: profile.shell,
      requiresTTY: profile.requiresTTY,
      env: profile.env,
      enabled: profile.enabled,
      icon: profile.icon ?? '',
    });
    setProfileModalOpen(true);
    setActiveTab('settings');
  };

  const selectPromptForEdit = (prompt: AIRunnerPromptDTO) => {
    setSelectedPromptId(prompt._id);
    setEditingPromptId(prompt._id);
    setPromptForm({
      name: prompt.name,
      content: prompt.content,
      type: prompt.type,
      tags: prompt.tags,
      attachments: prompt.attachments,
    });
    setPromptModalOpen(true);
    setActiveTab('prompts');
  };

  const selectPromptTemplateForEdit = (template: AIRunnerPromptTemplateDTO) => {
    setEditingPromptTemplateId(template._id);
    setPromptTemplateForm({
      name: template.name,
      content: template.content,
      description: template.description ?? '',
      tags: template.tags,
    });
    setPromptTemplateModalOpen(true);
    setActiveTab('settings');
  };

  const selectWorkspaceForEdit = (workspace: AIRunnerWorkspaceDTO) => {
    setEditingWorkspaceId(workspace._id);
    setWorkspaceForm({
      name: workspace.name,
      path: workspace.path,
      blocking: workspace.blocking,
      enabled: workspace.enabled,
      notes: workspace.notes ?? '',
    });
    setWorkspaceModalOpen(true);
    setActiveTab('settings');
  };

  const selectScheduleForEdit = (schedule: AIRunnerScheduleDTO) => {
    setEditingScheduleId(schedule._id);
    setScheduleForm({
      name: schedule.name,
      promptId: schedule.promptId,
      agentProfileId: schedule.agentProfileId,
      workspaceId: schedule.workspaceId,
      workingDirectory: schedule.workingDirectory,
      timeout: schedule.timeout,
      retries: schedule.retries,
      cronExpression: schedule.cronExpression,
      enabled: schedule.enabled,
    });
    setScheduleModalOpen(true);
    setActiveTab('schedules');
  };

  const resetProfileForm = () => {
    setEditingProfileId(null);
    setProfileForm(DEFAULT_PROFILE_FORM);
  };

  const resetPromptForm = () => {
    setEditingPromptId(null);
    setPromptForm(emptyPromptForm());
  };

  const resetScheduleForm = () => {
    const workspace = workspaces.find((item) => item.enabled);
    setEditingScheduleId(null);
    setScheduleForm(
      emptyScheduleForm(profiles[0]?._id, workspace?.path ?? directories[0], workspace?._id)
    );
  };

  const closeScheduleModal = () => {
    setScheduleModalOpen(false);
    resetScheduleForm();
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    resetProfileForm();
  };

  const closePromptModal = () => {
    setPromptModalOpen(false);
    resetPromptForm();
  };

  const closePromptTemplateModal = () => {
    setPromptTemplateModalOpen(false);
    setEditingPromptTemplateId(null);
    setPromptTemplateForm(emptyPromptTemplateForm());
  };

  const closeWorkspaceModal = () => {
    setWorkspaceModalOpen(false);
    setEditingWorkspaceId(null);
    setWorkspaceForm(emptyWorkspaceForm());
  };

  const openBundleModal = (mode: 'export' | 'import') => {
    setBundleMode(mode);
    setBundleModalOpen(true);
    setActiveTab('settings');
    if (mode === 'export') {
      setExportJson('');
    } else {
      setImportPreview(null);
      setImportResult(null);
      setImportDecisions([]);
    }
  };

  const closeBundleModal = () => {
    setBundleModalOpen(false);
    setBundlePending(false);
  };

  const openCreateProfileModal = () => {
    resetProfileForm();
    setProfileModalOpen(true);
    setActiveTab('settings');
  };

  const openCreatePromptModal = () => {
    resetPromptForm();
    setPromptModalOpen(true);
    setActiveTab('prompts');
  };

  const openCreatePromptTemplateModal = () => {
    setEditingPromptTemplateId(null);
    setPromptTemplateForm(emptyPromptTemplateForm());
    setPromptTemplateModalOpen(true);
    setActiveTab('settings');
  };

  const openCreateWorkspaceModal = (path?: string) => {
    setEditingWorkspaceId(null);
    setWorkspaceForm(emptyWorkspaceForm(path));
    setWorkspaceModalOpen(true);
    setActiveTab('settings');
  };

  const openCreateScheduleModal = () => {
    resetScheduleForm();
    setScheduleModalOpen(true);
    setActiveTab('schedules');
  };

  const openScheduleVisualization = async (profileId?: string) => {
    if (!schedulesLoaded) {
      await loadSchedules();
    }
    setScheduleVisualizationProfileId(profileId ?? null);
    setScheduleVisualizationOpen(true);
    setActiveTab(profileId ? 'settings' : 'schedules');
  };

  const closeScheduleVisualization = () => {
    setScheduleVisualizationOpen(false);
    setScheduleVisualizationProfileId(null);
  };

  const getRunDisplayName = useCallback(
    (run: AIRunnerRunDTO) => {
      if (run.autoflowId) {
        const autoflow = autoflowMap[run.autoflowId];
        const item = getAutoflowItemForRun(run);
        if (autoflow && item) {
          return `${autoflow.name} / ${item.name}`;
        }
        if (autoflow) {
          return autoflow.name;
        }
        return 'AutoFlow run';
      }
      if (run.scheduleId) {
        return scheduleMap[run.scheduleId]?.name || 'Scheduled run';
      }
      if (run.promptId) {
        return promptMap[run.promptId]?.name || 'Saved prompt run';
      }
      return run.promptContent.split('\n')[0]?.trim().slice(0, 72) || 'Manual run';
    },
    [autoflowMap, getAutoflowItemForRun, promptMap, scheduleMap]
  );

  const getRunContextLabel = useCallback(
    (run: AIRunnerRunDTO) => {
      if (run.autoflowId) {
        const item = getAutoflowItemForRun(run);
        return item ? `AutoFlow step: ${item.name}` : 'AutoFlow';
      }
      if (run.scheduleId) {
        return scheduleMap[run.scheduleId]?.name || 'Schedule';
      }
      return 'Ad hoc';
    },
    [getAutoflowItemForRun, scheduleMap]
  );

  const revealHistoryRun = useCallback(
    async (runId: string) => {
      setRunSearch('');
      setHistoryStatusFilter('all');
      setHistoryTriggerFilter('all');
      setHistoryProfileFilter('all');
      setHistoryScheduleFilter('all');
      setFocusedHistoryRunId(runId);
      setActiveTab('history');

      let detail: AIRunnerRunDTO | null = null;
      try {
        const response = await fetch(`/api/modules/ai-runner/runs/${runId}`, {
          cache: 'no-store',
        });
        if (response.ok) {
          detail = await response.json();
        }
      } catch {
        /* history list refresh below is enough for recent runs */
      }

      await loadRuns('');
      if (detail) {
        setRuns((current) => {
          if (current.some((run) => run._id === detail?._id)) {
            return current.map((run) => (run._id === detail?._id ? detail : run));
          }
          return [detail, ...current];
        });
      }
    },
    [loadRuns]
  );

  useEffect(() => {
    if (activeTab !== 'history' || !focusedHistoryRunId) return;
    const row = historyRowRefs.current[focusedHistoryRunId];
    if (!row) return;
    row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row.focus({ preventScroll: true });
  }, [activeTab, filteredHistoryRuns, focusedHistoryRunId]);

  const openRunDetail = (run: AIRunnerRunDTO, section: HistoryDetailSection = 'summary') => {
    setSelectedRun(run);
    setHistoryDetailSection(section);
    setHistoryDetailOpen(true);
    void (async () => {
      try {
        const response = await fetch(`/api/modules/ai-runner/runs/${run._id}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const detail: AIRunnerRunDTO = await response.json();
        setSelectedRun((current) => (current?._id === detail._id ? detail : current));
        setRuns((current) => current.map((item) => (item._id === detail._id ? detail : item)));
      } catch {
        /* keep drawer usable with summary data */
      }
    })();
  };

  const handleTabChange = useCallback((tab: ViewTab) => {
    setActiveTab(tab);
  }, []);

  const rerunHistoryItem = async (run: AIRunnerRunDTO) => {
    try {
      const requestBody = run.promptId
        ? {
            promptId: run.promptId,
            agentProfileId: run.agentProfileId,
            workingDirectory: run.workingDirectory,
          }
        : {
            content: run.promptContent,
            type: 'inline',
            agentProfileId: run.agentProfileId,
            workingDirectory: run.workingDirectory,
          };
      const response = await fetch('/api/modules/ai-runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to rerun item');
      }
      setSelectedRun(payload);
      setHistoryDetailSection('summary');
      setHistoryDetailOpen(true);
      setActiveTab('history');
      await loadAll();
      toast({
        title:
          run.status === 'failed' || run.status === 'timeout' ? 'Retry queued' : 'Rerun queued',
        description: 'A new durable run has been queued from this history item.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Run request failed',
        description: error instanceof Error ? error.message : 'Unable to start the run',
        variant: 'destructive',
      });
    }
  };

  const openRunPrompt = (run: AIRunnerRunDTO) => {
    if (!run.promptId) return;
    const prompt = promptMap[run.promptId];
    if (!prompt) return;
    selectPromptForEdit(prompt);
    setHistoryDetailOpen(false);
  };

  const openRunSchedule = (run: AIRunnerRunDTO) => {
    if (!run.scheduleId) return;
    const schedule = scheduleMap[run.scheduleId];
    if (!schedule) return;
    selectScheduleForEdit(schedule);
    setHistoryDetailOpen(false);
  };

  const submitProfile = async () => {
    try {
      const response = await fetch(
        editingProfileId
          ? `/api/modules/ai-runner/profiles/${editingProfileId}`
          : '/api/modules/ai-runner/profiles',
        {
          method: editingProfileId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save profile');
      }
      toast({
        title: editingProfileId ? 'Profile updated' : 'Profile created',
        description: 'Agent profile settings were saved.',
        variant: 'success',
      });
      setProfileModalOpen(false);
      resetProfileForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Profile save failed',
        description: error instanceof Error ? error.message : 'Unable to save profile',
        variant: 'destructive',
      });
    }
  };

  const validateProfile = async () => {
    const response = await fetch('/api/modules/ai-runner/profiles/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invocationTemplate: profileForm.invocationTemplate,
        shell: profileForm.shell,
      }),
    });
    const payload = await response.json();
    toast({
      title: payload.valid ? 'Template valid' : 'Template invalid',
      description: payload.valid
        ? payload.warnings?.join(', ') || 'Shell syntax and placeholders look good.'
        : payload.errors?.join(', ') || 'Validation failed.',
      variant: payload.valid ? 'success' : 'destructive',
    });
  };

  const testProfile = async (profileId: string) => {
    const response = await fetch(`/api/modules/ai-runner/profiles/${profileId}/test`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Profile test failed',
        description: payload.error || 'Unable to run the test profile',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Profile test started',
      description: 'A quick validation run is now executing.',
      variant: 'success',
    });
    setSelectedRun(payload);
    setHistoryDetailSection('summary');
    setHistoryDetailOpen(true);
    setActiveTab('history');
    await loadAll();
  };

  const executeLinkedDelete = async (target: LinkedDeleteTarget, force = false) => {
    const path =
      target.kind === 'prompt' ? 'prompts' : target.kind === 'profile' ? 'profiles' : 'workspaces';
    const response = await fetch(
      `/api/modules/ai-runner/${path}/${target.id}${force ? '?force=true' : ''}`,
      { method: 'DELETE' }
    );
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || `Unable to delete ${target.kind}`,
        variant: 'destructive',
      });
      return;
    }
    if (target.kind === 'profile' && editingProfileId === target.id) {
      closeProfileModal();
    }
    if (target.kind === 'prompt' && editingPromptId === target.id) {
      closePromptModal();
    }
    if (target.kind === 'workspace' && editingWorkspaceId === target.id) {
      closeWorkspaceModal();
    }
    if (force && target.scheduleCount > 0) {
      toast({
        title: 'Schedules paused',
        description: `${target.scheduleCount} linked schedule${target.scheduleCount === 1 ? '' : 's'} must be repaired before being enabled again.`,
        variant: 'warning',
      });
    }
    await loadAll();
  };

  const requestLinkedDelete = (target: Omit<LinkedDeleteTarget, 'scheduleCount'>) => {
    const scheduleCount = getLinkedScheduleCount(target.kind, target.id);
    if (scheduleCount > 0) {
      setLinkedDeleteTarget({ ...target, scheduleCount });
      return;
    }
    void executeLinkedDelete({ ...target, scheduleCount: 0 });
  };

  const confirmLinkedDelete = async () => {
    if (!linkedDeleteTarget) return;
    setLinkedDeletePending(true);
    try {
      await executeLinkedDelete(linkedDeleteTarget, true);
      setLinkedDeleteTarget(null);
    } finally {
      setLinkedDeletePending(false);
    }
  };

  const deleteProfile = async (id: string) => {
    const profile = profileMap[id];
    requestLinkedDelete({ kind: 'profile', id, name: profile?.name ?? 'this profile' });
  };

  const submitPrompt = async () => {
    try {
      const response = await fetch(
        editingPromptId
          ? `/api/modules/ai-runner/prompts/${editingPromptId}`
          : '/api/modules/ai-runner/prompts',
        {
          method: editingPromptId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save prompt');
      }
      toast({
        title: editingPromptId ? 'Prompt updated' : 'Prompt created',
        description: 'Saved prompt is ready to run or schedule.',
        variant: 'success',
      });
      setPromptModalOpen(false);
      resetPromptForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Prompt save failed',
        description: error instanceof Error ? error.message : 'Unable to save prompt',
        variant: 'destructive',
      });
    }
  };

  const deletePrompt = async (id: string) => {
    const prompt = promptMap[id];
    requestLinkedDelete({ kind: 'prompt', id, name: prompt?.name ?? 'this prompt' });
  };

  const addSavedPromptAttachments = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const validationError = validateAttachmentFiles(
      files,
      promptForm.attachments.reduce((sum, attachment) => sum + attachment.size, 0),
      promptForm.attachments.length
    );
    if (validationError) {
      toast({ title: 'Attachment rejected', description: validationError, variant: 'warning' });
      return;
    }

    try {
      const attachments: AIRunnerPromptAttachmentDTO[] = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          data: await fileToBase64(file),
        }))
      );
      setPromptForm((current) => ({
        ...current,
        attachments: [...current.attachments, ...attachments],
      }));
    } catch (error) {
      toast({
        title: 'Attachment read failed',
        description: error instanceof Error ? error.message : 'Unable to read attachment',
        variant: 'destructive',
      });
    }
  };

  const removeSavedPromptAttachment = (index: number) => {
    setPromptForm((current) => ({
      ...current,
      attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const uploadAutoflowAttachments = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const currentAttachments = autoflowDraft.attachments ?? [];
    const validationError = validateAttachmentFiles(
      files,
      currentAttachments.reduce((sum, attachment) => sum + attachment.size, 0),
      currentAttachments.length
    );
    if (validationError) {
      toast({ title: 'Attachment rejected', description: validationError, variant: 'warning' });
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    try {
      const response = await fetch('/api/modules/ai-runner/prompt-attachments/temp', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to upload attachments');
      const attachments = (payload.attachments ?? []) as AIRunnerPromptAttachmentRefDTO[];
      setAutoflowDraft((current) => ({
        ...current,
        attachments: [...(current.attachments ?? []), ...attachments],
      }));
    } catch (error) {
      toast({
        title: 'Attachment upload failed',
        description: error instanceof Error ? error.message : 'Unable to upload attachments',
        variant: 'destructive',
      });
    }
  };

  const removeAutoflowAttachment = (index: number) => {
    setAutoflowDraft((current) => ({
      ...current,
      attachments: (current.attachments ?? []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitPromptTemplate = async () => {
    try {
      const response = await fetch(
        editingPromptTemplateId
          ? `/api/modules/ai-runner/prompt-templates/${editingPromptTemplateId}`
          : '/api/modules/ai-runner/prompt-templates',
        {
          method: editingPromptTemplateId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptTemplateForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save prompt template');
      toast({
        title: editingPromptTemplateId ? 'Template updated' : 'Template created',
        description: 'The prompt template can now be loaded from editors.',
        variant: 'success',
      });
      closePromptTemplateModal();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Template save failed',
        description: error instanceof Error ? error.message : 'Unable to save prompt template',
        variant: 'destructive',
      });
    }
  };

  const deletePromptTemplate = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/prompt-templates/${id}`, {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete prompt template',
        variant: 'destructive',
      });
      return;
    }
    await loadAll();
  };

  const submitWorkspace = async () => {
    try {
      const response = await fetch(
        editingWorkspaceId
          ? `/api/modules/ai-runner/workspaces/${editingWorkspaceId}`
          : '/api/modules/ai-runner/workspaces',
        {
          method: editingWorkspaceId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workspaceForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save workspace');
      toast({
        title: editingWorkspaceId ? 'Workspace updated' : 'Workspace created',
        description: 'Workspace is ready for runs, schedules, and autoflows.',
        variant: 'success',
      });
      closeWorkspaceModal();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Workspace save failed',
        description: error instanceof Error ? error.message : 'Unable to save workspace',
        variant: 'destructive',
      });
    }
  };

  const deleteWorkspace = async (id: string) => {
    const workspace = workspaceMap[id];
    requestLinkedDelete({ kind: 'workspace', id, name: workspace?.name ?? 'this workspace' });
  };

  const submitSchedule = async () => {
    try {
      const response = await fetch(
        editingScheduleId
          ? `/api/modules/ai-runner/schedules/${editingScheduleId}`
          : '/api/modules/ai-runner/schedules',
        {
          method: editingScheduleId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleForm),
        }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save schedule');
      }
      toast({
        title: editingScheduleId ? 'Schedule updated' : 'Schedule created',
        description: 'The schedule is ready to run automatically.',
        variant: 'success',
      });
      setScheduleModalOpen(false);
      resetScheduleForm();
      await loadAll();
    } catch (error) {
      toast({
        title: 'Schedule save failed',
        description: error instanceof Error ? error.message : 'Unable to save schedule',
        variant: 'destructive',
      });
    }
  };

  const toggleSchedule = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/schedules/${id}/toggle`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Toggle failed',
        description: payload.error || 'Unable to toggle schedule',
        variant: 'destructive',
      });
      return;
    }
    await loadAll();
  };

  const deleteSchedule = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/schedules/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete schedule',
        variant: 'destructive',
      });
      return;
    }
    if (editingScheduleId === id) {
      closeScheduleModal();
    }
    await loadAll();
  };

  const duplicateSchedule = async (schedule: AIRunnerScheduleDTO) => {
    try {
      // Find a unique name
      const baseName = `${schedule.name} Copy`;
      let newName = baseName;
      let counter = 1;

      // Check for collisions and append counter if needed
      while (schedules.some((s) => s.name === newName)) {
        newName = `${baseName} ${counter}`;
        counter++;
      }

      const duplicateForm: ScheduleFormState = {
        name: newName,
        promptId: schedule.promptId,
        agentProfileId: schedule.agentProfileId,
        workspaceId: schedule.workspaceId,
        workingDirectory: schedule.workingDirectory,
        timeout: schedule.timeout,
        retries: schedule.retries,
        cronExpression: schedule.cronExpression,
        enabled: false, // keep it disabled by default
      };

      const response = await fetch('/api/modules/ai-runner/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateForm),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to duplicate schedule');
      }

      toast({
        title: 'Schedule duplicated',
        description: `"${newName}" created and paused by default.`,
        variant: 'success',
      });

      await loadAll();
    } catch (error) {
      toast({
        title: 'Duplication failed',
        description: error instanceof Error ? error.message : 'Unable to duplicate schedule',
        variant: 'destructive',
      });
    }
  };

  const openPromptInAutoflow = (promptId: string) => {
    const prompt = promptMap[promptId];
    if (!prompt) return;
    setSelectedPromptId(promptId);
    setAutoflowDraft((current) => ({
      ...current,
      name: prompt.name,
      promptId,
      promptContent: prompt.content,
      promptType: prompt.type,
      attachments: [],
    }));
    setActiveTab('autoflows');
  };

  const runScheduleNow = async (schedule: AIRunnerScheduleDTO) => {
    const response = await fetch('/api/modules/ai-runner/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptId: schedule.promptId,
        scheduleId: schedule._id,
        triggeredBy: 'manual',
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Run failed',
        description: payload.error || 'Unable to start scheduled prompt',
        variant: 'destructive',
      });
      return;
    }
    setSelectedRun(payload);
    setHistoryDetailSection('summary');
    setHistoryDetailOpen(true);
    setActiveTab('history');
    await loadAll();
  };

  const toggleGlobalScheduleQueue = async () => {
    try {
      setGlobalScheduleTogglePending(true);
      const nextValue = !schedulesGloballyEnabled;
      const response = await fetch('/api/modules/ai-runner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedulesGloballyEnabled: nextValue,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update global schedule setting');
      }

      setRunnerSettings(payload);
      toast({
        title: nextValue ? 'Global auto-queue enabled' : 'Global auto-queue disabled',
        description: nextValue
          ? 'Enabled schedules can be queued again.'
          : 'Enabled schedules will stay saved but stop queueing automatically.',
        variant: 'success',
      });
      await loadSchedules();
    } catch (error) {
      toast({
        title: 'Global schedule toggle failed',
        description:
          error instanceof Error ? error.message : 'Unable to update global schedule setting',
        variant: 'destructive',
      });
    } finally {
      setGlobalScheduleTogglePending(false);
    }
  };

  const updateDefaultAutoflowMode = async (mode: 'sequential' | 'parallel') => {
    try {
      const response = await fetch('/api/modules/ai-runner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoflowMode: mode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to update AutoFlow mode');
      setRunnerSettings(payload);
      setAutoflowMode(mode);
      toast({
        title: 'AutoFlow default updated',
        description: `New AutoFlows default to ${mode}.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Setting update failed',
        description: error instanceof Error ? error.message : 'Unable to update AutoFlow mode',
        variant: 'destructive',
      });
    }
  };

  const resetStorageSettingsToDefaults = () => {
    setStorageSettingsForm(defaultStorageSettingsFormFromSettings(runnerSettings));
  };

  const saveStorageSettings = async () => {
    const artifactBaseDir = storageSettingsForm.artifactBaseDir.trim();
    const mongoRetentionDays = parseRetentionDays(storageSettingsForm.mongoRetentionDays);
    const artifactRetentionDays = parseRetentionDays(storageSettingsForm.artifactRetentionDays);

    if (!artifactBaseDir) {
      toast({
        title: 'Artifact directory required',
        description: 'Choose a folder where AI Runner can keep per-run logs and metadata.',
        variant: 'destructive',
      });
      return;
    }

    if (mongoRetentionDays === null || artifactRetentionDays === null) {
      toast({
        title: 'Retention days are invalid',
        description: `Use whole numbers from ${MIN_RETENTION_DAYS} to ${MAX_RETENTION_DAYS}.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setStorageSettingsSaving(true);
      const response = await fetch('/api/modules/ai-runner/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactBaseDir,
          mongoRetentionDays,
          artifactRetentionDays,
        }),
      });
      const payload: AIRunnerSettingsDTO | { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Unable to update storage settings');
      }
      const settings = payload as AIRunnerSettingsDTO;

      setRunnerSettings(settings);
      setStorageSettingsForm(storageSettingsFormFromSettings(settings));
      toast({
        title: 'Storage settings saved',
        description: 'AI Runner will use these values for new runs and retention cleanup.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Storage settings failed',
        description: error instanceof Error ? error.message : 'Unable to update storage settings',
        variant: 'destructive',
      });
    } finally {
      setStorageSettingsSaving(false);
    }
  };

  const togglePortableResource = (
    resource: AIRunnerPortableResource,
    mode: 'export' | 'import'
  ) => {
    const setter = mode === 'export' ? setSelectedExportResources : setSelectedImportResources;
    setter((current) => {
      if (current.includes(resource)) {
        const next = current.filter((item) => item !== resource);
        return next.length > 0 ? next : current;
      }
      return [...current, resource];
    });
  };

  const generateExportBundle = async () => {
    try {
      setBundlePending(true);
      const response = await fetch(
        `/api/modules/ai-runner/bundle/export?resources=${encodeURIComponent(
          selectedExportResources.join(',')
        )}`,
        { cache: 'no-store' }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to export AI Runner bundle');
      }
      setExportJson(JSON.stringify(payload, null, 2));
      toast({
        title: 'Export ready',
        description: 'The selected AI Runner configuration is ready to copy or download.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unable to export AI Runner bundle',
        variant: 'destructive',
      });
    } finally {
      setBundlePending(false);
    }
  };

  const copyExportJson = async () => {
    if (!exportJson) return;
    await navigator.clipboard.writeText(exportJson);
    toast({
      title: 'Copied',
      description: 'AI Runner export JSON copied to clipboard.',
      variant: 'success',
    });
  };

  const downloadExportJson = () => {
    if (!exportJson) return;
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-runner-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const parseImportBundle = (): AIRunnerPortableBundle => {
    const parsed = JSON.parse(importJson) as unknown;
    return parsed as AIRunnerPortableBundle;
  };

  const previewImportBundle = async () => {
    try {
      setBundlePending(true);
      setImportResult(null);
      const bundle = parseImportBundle();
      const response = await fetch('/api/modules/ai-runner/bundle/import?mode=preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle,
          selectedResources: selectedImportResources,
          decisions: importDecisions,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to preview AI Runner import');
      }
      const preview = payload as AIRunnerImportPreviewDTO;
      setImportPreview(preview);
      setImportDecisions((current) => {
        const existing = new Set(current.map((decision) => `${decision.resource}:${decision.key}`));
        return [
          ...current,
          ...preview.conflicts
            .filter((conflict) => !existing.has(`${conflict.resource}:${conflict.key}`))
            .map((conflict) => ({
              resource: conflict.resource,
              key: conflict.key,
              overwrite: false,
            })),
        ];
      });
    } catch (error) {
      toast({
        title: 'Import preview failed',
        description:
          error instanceof Error ? error.message : 'Paste or upload a valid AI Runner export JSON',
        variant: 'destructive',
      });
    } finally {
      setBundlePending(false);
    }
  };

  const setImportConflictDecision = (conflict: AIRunnerImportConflictDTO, overwrite: boolean) => {
    setImportDecisions((current) => {
      const withoutConflict = current.filter(
        (decision) => !(decision.resource === conflict.resource && decision.key === conflict.key)
      );
      return [...withoutConflict, { resource: conflict.resource, key: conflict.key, overwrite }];
    });
  };

  const shouldOverwriteImportConflict = (conflict: AIRunnerImportConflictDTO): boolean => {
    return importDecisions.some(
      (decision) =>
        decision.resource === conflict.resource &&
        decision.key === conflict.key &&
        decision.overwrite
    );
  };

  const applyImportBundle = async () => {
    try {
      setBundlePending(true);
      const bundle = parseImportBundle();
      const response = await fetch('/api/modules/ai-runner/bundle/import?mode=apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundle,
          selectedResources: selectedImportResources,
          decisions: importDecisions,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to import AI Runner bundle');
      }
      const result = payload as AIRunnerImportResultDTO;
      setImportResult(result);
      setImportPreview(result);
      await loadAll();
      toast({
        title: result.valid ? 'Import complete' : 'Import blocked',
        description: result.valid
          ? 'AI Runner configuration was imported.'
          : 'Resolve missing references before applying this bundle.',
        variant: result.valid ? 'success' : 'warning',
      });
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unable to import AI Runner bundle',
        variant: 'destructive',
      });
    } finally {
      setBundlePending(false);
    }
  };

  const buildAutoflowDraftItem = (): AutoflowItemDraft | null => {
    const name =
      autoflowDraft.name.trim() ||
      autoflowDraft.promptContent?.split('\n')[0]?.trim().slice(0, 64) ||
      `Step ${autoflowItems.length + 1}`;
    if (!autoflowDraft.promptContent?.trim()) {
      toast({
        title: 'Prompt required',
        description: 'Add prompt content before adding this AutoFlow step.',
        variant: 'warning',
      });
      return null;
    }
    if (!autoflowDraft.agentProfileId) {
      toast({
        title: 'Profile required',
        description: 'Choose an agent profile before adding this AutoFlow step.',
        variant: 'warning',
      });
      return null;
    }
    if (!autoflowDraft.workingDirectory.trim()) {
      toast({
        title: 'Workspace required',
        description: 'Choose a workspace or enter a workspace path before adding this step.',
        variant: 'warning',
      });
      return null;
    }
    return { ...autoflowDraft, name };
  };

  const addAutoflowItem = () => {
    const item = buildAutoflowDraftItem();
    if (!item) return;
    setAutoflowItems((current) => [...current, item]);
    setAutoflowDraft((current) => ({
      ...current,
      promptId: undefined,
      name: '',
      promptContent: '',
      attachments: [],
    }));
  };

  const submitAutoflow = async () => {
    try {
      const draftItem = autoflowItems.length === 0 ? buildAutoflowDraftItem() : null;
      const items = autoflowItems.length > 0 ? autoflowItems : draftItem ? [draftItem] : [];
      if (items.length === 0) return;
      const response = await fetch('/api/modules/ai-runner/autoflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: autoflowName.trim() || 'Untitled AutoFlow',
          mode: autoflowMode,
          continueOnFailure: autoflowContinueOnFailure,
          items,
          startImmediately: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to start AutoFlow');
      setAutoflowName('');
      setAutoflowItems([]);
      setAutoflowDraft((current) => ({
        ...current,
        promptId: undefined,
        name: '',
        promptContent: '',
        attachments: [],
      }));
      setAutoflows((current) => [payload, ...current]);
      toast({
        title: 'AutoFlow started',
        description: 'Steps will queue according to the selected run mode and workspace locks.',
        variant: 'success',
      });
      await loadAll();
    } catch (error) {
      toast({
        title: 'AutoFlow failed',
        description: error instanceof Error ? error.message : 'Unable to start AutoFlow',
        variant: 'destructive',
      });
    }
  };

  const startAutoflow = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/autoflows/${id}/start`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Start failed',
        description: payload.error || 'Unable to start AutoFlow',
        variant: 'destructive',
      });
      return;
    }
    await loadAll();
  };

  const cancelAutoflow = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/autoflows/${id}/cancel`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Cancel failed',
        description: payload.error || 'Unable to cancel AutoFlow',
        variant: 'destructive',
      });
      return;
    }
    await loadAll();
  };

  const killSelectedRun = async () => {
    if (!selectedRun) return;
    const response = await fetch(`/api/modules/ai-runner/runs/${selectedRun._id}/kill`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Stop failed',
        description: payload.error || 'Unable to stop the run',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Stop signal sent',
      description: 'The run is being terminated.',
      variant: 'success',
    });
  };

  if (loading) {
    return <PageSkeleton statCards={4} />;
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-card/60">
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                AI Agent Runner
              </CardTitle>
              <CardDescription>
                Launch prompts, schedule recurring runs, and keep an audit trail of every execution.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 overflow-x-auto pb-1">
                <div
                  className="flex min-w-max gap-1 rounded-xl border border-border/70 bg-muted/30 p-1"
                  role="tablist"
                >
                  {TAB_META.map((tab) => (
                    <Button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      variant={activeTab === tab.id ? 'default' : 'ghost'}
                      size="default"
                      onClick={() => handleTabChange(tab.id)}
                      className="h-10 min-w-[7.75rem] justify-center whitespace-nowrap px-3"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`runner-tab-${tab.id}`}
                    >
                      {tab.icon}
                      <span className="truncate">{tab.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => void runExclusiveAction('refresh:all', () => loadAll())}
                loading={refreshing || isActionPending('refresh:all')}
                className="h-11 w-full shrink-0 justify-center px-5 sm:w-auto lg:min-w-32"
              >
                <RefreshCcw className="w-4 h-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {schedulerReliabilityWarning ? (
            <div className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                <div>
                  <p className="text-sm font-medium">{schedulerReliabilityWarning.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {schedulerReliabilityWarning.body}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'prompts' && (
            <div
              id="runner-tab-prompts"
              role="tabpanel"
              aria-labelledby="tab-prompts"
              className="space-y-5"
            >
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={openCreatePromptModal} className="shrink-0">
                  <Save className="w-4 h-4" />
                  Create Prompt
                </Button>
              </div>

              <div>
                <Card className="overflow-hidden border-border/60">
                  <CardHeader className="border-b border-border/60">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <CardTitle className="text-lg tracking-tight">Library</CardTitle>
                      </div>
                      <Badge variant="outline">{prompts.length} saved</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {filteredPrompts.map((prompt) => (
                      <div
                        key={prompt._id}
                        onClick={() => setSelectedPromptId(prompt._id)}
                        className={cn(
                          'border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/20',
                          selectedPromptId === prompt._id && 'bg-primary/5'
                        )}
                      >
                        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto] lg:items-center">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold tracking-tight">
                                {prompt.name}
                              </h3>
                              <Badge variant="secondary">{prompt.type}</Badge>
                              {prompt.attachments.length > 0 ? (
                                <Badge variant="outline">{prompt.attachments.length} files</Badge>
                              ) : null}
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-wrap">
                              {prompt.content}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {prompt.tags.length > 0 ? (
                              prompt.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px]">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {prompt.content.length} chars
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedPromptId(prompt._id);
                              }}
                            >
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPromptInAutoflow(prompt._id);
                              }}
                            >
                              <Play className="w-4 h-4" />
                              Run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectPromptForEdit(prompt);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                void runExclusiveAction(`prompt:delete:${prompt._id}`, () =>
                                  deletePrompt(prompt._id)
                                );
                              }}
                              loading={isActionPending(`prompt:delete:${prompt._id}`)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredPrompts.length === 0 && (
                      <div className="px-6 py-14 text-center">
                        <h3 className="text-lg font-semibold tracking-tight">
                          No prompts in the library yet
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Create a reusable prompt and it will show up here ready for runs and
                          schedules.
                        </p>
                        <div className="mt-5">
                          <Button onClick={openCreatePromptModal}>
                            <Save className="w-4 h-4" />
                            Create Prompt
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {promptModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closePromptModal}
                  />
                  <div className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-primary/20 bg-card/95 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">
                          Prompt Studio
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                          {editingPromptId ? 'Edit prompt' : 'Create prompt'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Write the prompt once, tag it clearly, and keep it portable across runs
                          and schedules.
                        </p>
                      </div>
                      <button
                        onClick={closePromptModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        aria-label="Close prompt modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="overflow-y-auto px-6 py-6">
                      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                        <div className="space-y-6">
                          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                            <div>
                              <p className="text-sm font-semibold">Identity</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Give this prompt a strong name so it reads clearly in libraries and
                                launch flows.
                              </p>
                            </div>
                            <Input
                              label="Name"
                              value={promptForm.name}
                              onChange={(event) =>
                                setPromptForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                            />
                            <Input
                              label="Tags (comma separated)"
                              value={promptForm.tags.join(', ')}
                              onChange={(event) =>
                                setPromptForm((current) => ({
                                  ...current,
                                  tags: event.target.value
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                }))
                              }
                            />
                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                              Execution settings live in AutoFlow and schedules, so this prompt
                              stays reusable across profiles and repos.
                            </div>
                          </div>

                          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                            <div>
                              <p className="text-sm font-semibold">Storage Mode</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Choose whether this prompt lives inline or points to a file on disk.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={promptForm.type === 'inline' ? 'default' : 'outline'}
                                onClick={() =>
                                  setPromptForm((current) => ({ ...current, type: 'inline' }))
                                }
                              >
                                Inline
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  promptForm.type === 'file-reference' ? 'default' : 'outline'
                                }
                                onClick={() =>
                                  setPromptForm((current) => ({
                                    ...current,
                                    type: 'file-reference',
                                  }))
                                }
                              >
                                File Reference
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold">
                                {promptForm.type === 'inline'
                                  ? 'Prompt Content'
                                  : 'Prompt File Path'}
                              </p>
                              {promptForm.type === 'inline' && promptTemplates.length > 0 ? (
                                <select
                                  aria-label="Load prompt template into saved prompt"
                                  onChange={(event) => {
                                    const template = promptTemplates.find(
                                      (item) => item._id === event.target.value
                                    );
                                    if (!template) return;
                                    setPromptForm((current) => ({
                                      ...current,
                                      content: applyPromptTemplate(
                                        template.content,
                                        current.content
                                      ),
                                    }));
                                    event.target.value = '';
                                  }}
                                  className="h-9 max-w-[260px] rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                  <option value="">Load template...</option>
                                  {promptTemplates.map((template) => (
                                    <option key={template._id} value={template._id}>
                                      {template.name}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {promptForm.type === 'inline'
                                ? 'Draft the actual reusable instruction here.'
                                : 'Reference a prompt file path that should be loaded at run time.'}
                            </p>
                          </div>
                          <textarea
                            value={promptForm.content}
                            onChange={(event) =>
                              setPromptForm((current) => ({
                                ...current,
                                content: event.target.value,
                              }))
                            }
                            className="min-h-[420px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                            placeholder={
                              promptForm.type === 'inline'
                                ? 'Ask the agent to review code, prepare a changelog, refactor a module, or anything else you want to save for reuse...'
                                : '/root/repos/project/prompts/release-review.md'
                            }
                          />
                          <div
                            role="region"
                            aria-label="Saved prompt attachments"
                            onDragEnter={acceptAttachmentDrag}
                            onDragOver={acceptAttachmentDrag}
                            onDrop={(event) => {
                              void addSavedPromptAttachments(getDroppedAttachmentFiles(event));
                            }}
                            className="space-y-3 rounded-xl border border-dashed border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/50"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">Files & images</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Stored with this saved prompt and exported with prompt bundles.
                                  Drop files here or use upload.
                                </p>
                              </div>
                              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/50">
                                <Upload className="h-4 w-4" />
                                Upload
                                <input
                                  type="file"
                                  multiple
                                  className="sr-only"
                                  onChange={(event) => {
                                    void addSavedPromptAttachments(event.target.files);
                                    event.target.value = '';
                                  }}
                                />
                              </label>
                            </div>
                            {promptForm.attachments.length > 0 ? (
                              <div className="space-y-2">
                                {promptForm.attachments.map((attachment, index) => (
                                  <div
                                    key={`${attachment.name}-${index}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs"
                                  >
                                    <span className="min-w-0 truncate">
                                      {attachment.name}
                                      <span className="ml-2 text-muted-foreground">
                                        {formatMemory(attachment.size)}
                                      </span>
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeSavedPromptAttachment(index)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col-reverse gap-3 border-t border-border/60 bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="outline" onClick={closePromptModal}>
                        Cancel
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={resetPromptForm}>
                          Reset
                        </Button>
                        <Button
                          onClick={() => void runExclusiveAction('prompt:save', submitPrompt)}
                          loading={isActionPending('prompt:save')}
                        >
                          <Save className="w-4 h-4" />
                          {editingPromptId ? 'Update prompt' : 'Create prompt'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'schedules' && (
            <div
              id="runner-tab-schedules"
              role="tabpanel"
              aria-labelledby="tab-schedules"
              className="space-y-5"
            >
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <CompactStat
                    label="Enabled"
                    value={enabledScheduleCount}
                    tone="primary"
                    detail="Schedules ready to run."
                  />
                  <CompactStat
                    label="Next Launch"
                    value={
                      !schedulesGloballyEnabled
                        ? 'Globally paused'
                        : nextSchedule?.nextRunTime
                          ? formatScheduleDate(nextSchedule.nextRunTime)
                          : 'No launch queued'
                    }
                    tone="warning"
                    detail={
                      !schedulesGloballyEnabled
                        ? 'Automatic queueing is paused for every schedule.'
                        : nextSchedule?.nextRunTime
                          ? nextScheduleStatusLabel
                            ? `${nextSchedule.name} ${nextScheduleStatusLabel}`
                            : `${nextSchedule.name} ${formatCountdown(nextSchedule.nextRunTime, liveNow)}`
                          : 'Enable a schedule to populate this.'
                    }
                  />
                  <CompactStat
                    label="Recently Active"
                    value={recentlyActiveScheduleCount}
                    tone="success"
                    detail="Ran within the last 24 hours."
                  />
                </div>

                <div className="flex flex-col gap-3 xl:sticky xl:top-4">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() =>
                      void runExclusiveAction('schedule:visualize:all', () =>
                        openScheduleVisualization()
                      )
                    }
                    loading={isActionPending('schedule:visualize:all')}
                    className="w-full justify-start"
                  >
                    <Eye className="w-4 h-4" />
                    Visualize Schedule
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    loading={
                      globalScheduleTogglePending || isActionPending('schedule:global-toggle')
                    }
                    onClick={() =>
                      void runExclusiveAction('schedule:global-toggle', toggleGlobalScheduleQueue)
                    }
                    className={cn(
                      'w-full justify-start border-2',
                      schedulesGloballyEnabled
                        ? 'border-success/25 bg-success/10 text-success hover:bg-success/15 hover:text-success'
                        : 'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive'
                    )}
                  >
                    {schedulesGloballyEnabled ? (
                      <Play className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {schedulesGloballyEnabled ? 'Global Auto-Queue ON' : 'Global Auto-Queue OFF'}
                  </Button>
                  <Button
                    size="lg"
                    onClick={openCreateScheduleModal}
                    className="w-full justify-start"
                  >
                    <CalendarClock className="w-4 h-4" />
                    Create Schedule
                  </Button>
                </div>
              </div>

              {!schedulesGloballyEnabled ? (
                <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">
                        Global schedule pause is active
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Individual schedules can stay enabled, but none of them will be queued
                        automatically until global auto-queue is turned back on.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <Card className="overflow-hidden border-border/60">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <CardTitle className="text-xl tracking-tight">Schedule List</CardTitle>
                      <CardDescription className="mt-2 leading-6">
                        Cleaner rows for cadence, runtime context, and execution health.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="success">{enabledScheduleCount} enabled</Badge>
                      <Badge variant="warning">{pausedScheduleCount} paused</Badge>
                      {!schedulesGloballyEnabled ? (
                        <Badge variant="destructive">global auto-queue off</Badge>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {sortedSchedules.map((schedule, index) => {
                    const missingReferences = getScheduleMissingReferences(schedule);
                    const hasMissingReferences = missingReferences.length > 0;
                    const canStartSchedule = !hasMissingReferences;
                    const canToggleSchedule = schedule.enabled || !hasMissingReferences;
                    const missingReferenceLabel = missingReferences.join(', ');

                    return (
                      <div
                        key={schedule._id}
                        className={cn(
                          'border-b border-border/60 px-5 py-4 last:border-b-0',
                          schedule.enabled ? 'bg-card/40' : 'bg-muted/10'
                        )}
                      >
                        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-x-6 xl:gap-y-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={schedule.enabled ? 'success' : 'warning'}>
                                {schedule.enabled ? 'Enabled' : 'Paused'}
                              </Badge>
                              {hasMissingReferences ? (
                                <Badge variant="destructive">Missing {missingReferenceLabel}</Badge>
                              ) : null}
                              <Badge variant="outline">
                                {getScheduleModeLabel(schedule.cronExpression)}
                              </Badge>
                              {schedule.lastRunStatus ? (
                                <Badge variant={getScheduleStatusVariant(schedule.lastRunStatus)}>
                                  {schedule.lastRunStatus}
                                </Badge>
                              ) : null}
                              <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            </div>
                            <div>
                              <h3 className="text-base font-semibold tracking-tight">
                                {schedule.name}
                              </h3>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {humanizeCron(schedule.cronExpression)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void runExclusiveAction(`schedule:duplicate:${schedule._id}`, () =>
                                  duplicateSchedule(schedule)
                                )
                              }
                              loading={isActionPending(`schedule:duplicate:${schedule._id}`)}
                              title="Duplicate Schedule"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                void runExclusiveAction(`schedule:run:${schedule._id}`, () =>
                                  runScheduleNow(schedule)
                                )
                              }
                              loading={isActionPending(`schedule:run:${schedule._id}`)}
                              disabled={!canStartSchedule}
                              title={
                                canStartSchedule
                                  ? 'Run schedule now'
                                  : `Repair missing ${missingReferenceLabel} before running`
                              }
                            >
                              <Play className="w-4 h-4" />
                              Run Now
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void runExclusiveAction(`schedule:toggle:${schedule._id}`, () =>
                                  toggleSchedule(schedule._id)
                                )
                              }
                              loading={isActionPending(`schedule:toggle:${schedule._id}`)}
                              disabled={!canToggleSchedule}
                              title={
                                canToggleSchedule
                                  ? schedule.enabled
                                    ? 'Pause schedule'
                                    : 'Enable schedule'
                                  : `Repair missing ${missingReferenceLabel} before enabling`
                              }
                            >
                              <Clock3 className="w-4 h-4" />
                              {schedule.enabled ? 'Pause' : 'Enable'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectScheduleForEdit(schedule)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                void runExclusiveAction(`schedule:delete:${schedule._id}`, () =>
                                  deleteSchedule(schedule._id)
                                )
                              }
                              loading={isActionPending(`schedule:delete:${schedule._id}`)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                          <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:col-span-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.15fr)_minmax(150px,0.9fr)_minmax(150px,0.9fr)_minmax(0,1.5fr)]">
                            <div className="min-w-0">
                              <span className="text-xs text-muted-foreground">Prompt</span>
                              <p className="mt-1 font-medium leading-6 whitespace-normal break-words">
                                {promptMap[schedule.promptId]?.name || 'Unknown prompt'}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs text-muted-foreground">Profile</span>
                              <p className="mt-1 font-medium leading-6 whitespace-normal break-words">
                                {profileMap[schedule.agentProfileId]?.name || 'Unknown profile'}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs text-muted-foreground">Next launch</span>
                              <p className="mt-1 font-medium">
                                {formatScheduleDate(schedule.nextRunTime)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getActiveScheduleRunLabel(activeScheduleRunMap[schedule._id]) ??
                                  formatCountdown(schedule.nextRunTime, liveNow)}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs text-muted-foreground">Last run</span>
                              <p className="mt-1 font-medium">
                                {schedule.lastRunAt
                                  ? formatScheduleDate(schedule.lastRunAt)
                                  : 'No runs yet'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {schedule.lastRunAt
                                  ? formatRelative(schedule.lastRunAt)
                                  : 'Fresh automation'}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs text-muted-foreground">Workspace</span>
                              <p className="mt-1 text-sm font-medium">
                                {schedule.workspaceId
                                  ? workspaceMap[schedule.workspaceId]?.name || 'Unknown workspace'
                                  : 'Custom path'}
                              </p>
                              <p className="mt-1 font-mono text-xs leading-5 whitespace-normal break-all">
                                {schedule.workingDirectory || 'No directory'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {schedule.timeout} min runtime
                                {' · '}
                                {schedule.retries === 0
                                  ? 'no retries'
                                  : `${schedule.retries} retr${schedule.retries === 1 ? 'y' : 'ies'}`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {sortedSchedules.length === 0 && (
                    <div className="rounded-[28px] border border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-warning/5 px-6 py-16 text-center">
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">
                        No schedules configured yet
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Use the create button above to open a wide schedule studio and build your
                        first automation.
                      </p>
                      <div className="mt-6">
                        <Button onClick={openCreateScheduleModal}>
                          <CalendarClock className="w-4 h-4" />
                          Create Schedule
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {scheduleModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeScheduleModal}
                  />
                  <div className="relative flex max-h-[92dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
                      <div>
                        <p className="text-xs font-semibold uppercase text-primary">Automation</p>
                        <h3 className="mt-2 text-2xl font-semibold">
                          {editingScheduleId ? 'Edit schedule' : 'Create schedule'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Set the prompt, runtime, and cron cadence in one pass.
                        </p>
                      </div>
                      <button
                        onClick={closeScheduleModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        aria-label="Close schedule modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="overflow-y-auto px-6 py-6">
                      <div className="space-y-6">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="min-w-0 rounded-lg border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-xs text-muted-foreground">Prompt</p>
                            <p className="mt-1 truncate text-sm font-semibold">
                              {scheduleFormPromptName}
                            </p>
                          </div>
                          <div className="min-w-0 rounded-lg border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-xs text-muted-foreground">Profile</p>
                            <p className="mt-1 truncate text-sm font-semibold">
                              {scheduleFormProfileName}
                            </p>
                          </div>
                          <div className="min-w-0 rounded-lg border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-xs text-muted-foreground">Cadence</p>
                            <p className="mt-1 truncate text-sm font-semibold">
                              {humanizeCron(scheduleForm.cronExpression)}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-6 2xl:grid-cols-[minmax(420px,0.9fr)_minmax(560px,1.1fr)]">
                          <div className="space-y-6">
                            <div className="rounded-lg border border-border/60 bg-background/80 p-5 space-y-4">
                              <div>
                                <p className="text-sm font-semibold">Identity</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Give this automation a clear name and pair it with the right
                                  prompt and execution profile.
                                </p>
                              </div>
                              <Input
                                label="Name"
                                value={scheduleForm.name}
                                onChange={(event) =>
                                  setScheduleForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                                placeholder="Weekday backlog triage"
                              />
                              <label className="space-y-1.5">
                                <span className="block text-sm font-medium">Saved Prompt</span>
                                <select
                                  value={scheduleForm.promptId}
                                  onChange={(event) =>
                                    setScheduleForm((current) => ({
                                      ...current,
                                      promptId: event.target.value,
                                    }))
                                  }
                                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                  <option value="">Select a prompt</option>
                                  {prompts.map((prompt) => (
                                    <option key={prompt._id} value={prompt._id}>
                                      {prompt.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="space-y-1.5">
                                <span className="block text-sm font-medium">Agent Profile</span>
                                <select
                                  value={scheduleForm.agentProfileId}
                                  onChange={(event) => {
                                    const profile = profileMap[event.target.value];
                                    setScheduleForm((current) => ({
                                      ...current,
                                      agentProfileId: event.target.value,
                                      timeout: profile?.defaultTimeout ?? current.timeout,
                                    }));
                                  }}
                                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                  <option value="">Select a profile</option>
                                  {profiles
                                    .filter((profile) => profile.enabled)
                                    .map((profile) => (
                                      <option key={profile._id} value={profile._id}>
                                        {profile.name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            </div>

                            <div className="rounded-lg border border-border/60 bg-background/80 p-5 space-y-4">
                              <div>
                                <p className="text-sm font-semibold">Runtime Scene</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Tell the schedule where to run, how long it is allowed to stay
                                  active, and how many retries it gets after a failure.
                                </p>
                              </div>
                              <div className="grid gap-4 md:grid-cols-[180px_1fr_140px_140px]">
                                <label className="space-y-1.5">
                                  <span className="block text-sm font-medium">Workspace</span>
                                  <select
                                    value={scheduleForm.workspaceId ?? ''}
                                    onChange={(event) => {
                                      const workspace = workspaceMap[event.target.value];
                                      setScheduleForm((current) => ({
                                        ...current,
                                        workspaceId: event.target.value || undefined,
                                        workingDirectory:
                                          workspace?.path ?? current.workingDirectory,
                                      }));
                                    }}
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                  >
                                    <option value="">Custom</option>
                                    {workspaces
                                      .filter((workspace) => workspace.enabled)
                                      .map((workspace) => (
                                        <option key={workspace._id} value={workspace._id}>
                                          {workspace.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <label
                                      htmlFor="schedule-directory"
                                      className="block text-sm font-medium"
                                    >
                                      Workspace Path
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openCreateWorkspaceModal(scheduleForm.workingDirectory)
                                      }
                                      className="text-xs font-medium text-primary hover:underline"
                                    >
                                      Save workspace
                                    </button>
                                  </div>
                                  <input
                                    id="schedule-directory"
                                    list="runner-directories"
                                    value={scheduleForm.workingDirectory}
                                    onChange={(event) =>
                                      setScheduleForm((current) => ({
                                        ...current,
                                        workspaceId:
                                          workspaces.find(
                                            (workspace) => workspace.path === event.target.value
                                          )?._id ?? undefined,
                                        workingDirectory: event.target.value,
                                      }))
                                    }
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                    placeholder="/srv/repos/project"
                                  />
                                </div>
                                <Input
                                  label="Timeout"
                                  type="number"
                                  value={scheduleForm.timeout}
                                  onChange={(event) =>
                                    setScheduleForm((current) => ({
                                      ...current,
                                      timeout: Number(event.target.value) || 1,
                                    }))
                                  }
                                  min={1}
                                />
                                <Input
                                  label="Retries"
                                  type="number"
                                  value={scheduleForm.retries}
                                  onChange={(event) =>
                                    setScheduleForm((current) => ({
                                      ...current,
                                      retries: Math.min(
                                        Math.max(Number(event.target.value) || 0, 0),
                                        9
                                      ),
                                    }))
                                  }
                                  min={0}
                                  max={9}
                                />
                              </div>

                              <div className="rounded-xl border border-border/60 bg-card/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <label className="flex items-center gap-3 text-sm font-medium">
                                      <input
                                        type="checkbox"
                                        checked={scheduleForm.enabled}
                                        onChange={(event) =>
                                          setScheduleForm((current) => ({
                                            ...current,
                                            enabled: event.target.checked,
                                          }))
                                        }
                                        className="h-4 w-4 rounded border-input"
                                      />
                                      Keep this schedule enabled after saving
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                      {scheduleForm.retries === 0
                                        ? 'No automatic retry after a failed scheduled run.'
                                        : `${scheduleForm.retries} retr${scheduleForm.retries === 1 ? 'y' : 'ies'} allowed after a failed scheduled run.`}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant={scheduleForm.enabled ? 'success' : 'warning'}>
                                      {scheduleForm.enabled ? 'Auto-run on' : 'Saved as paused'}
                                    </Badge>
                                    <Badge variant="outline">
                                      {scheduleForm.retries === 0
                                        ? 'No retries'
                                        : `${scheduleForm.retries} retr${scheduleForm.retries === 1 ? 'y' : 'ies'}`}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <ScheduleBuilder
                              cronExpression={scheduleForm.cronExpression}
                              onChange={(value) =>
                                setScheduleForm((current) => ({
                                  ...current,
                                  cronExpression: value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t border-border/60 bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="outline" onClick={closeScheduleModal}>
                        Cancel
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={resetScheduleForm}>
                          Reset
                        </Button>
                        <Button
                          onClick={() => void runExclusiveAction('schedule:save', submitSchedule)}
                          loading={isActionPending('schedule:save')}
                        >
                          <CalendarClock className="w-4 h-4" />
                          {editingScheduleId ? 'Update schedule' : 'Create schedule'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'autoflows' && (
            <div
              id="runner-tab-autoflows"
              role="tabpanel"
              aria-labelledby="tab-autoflows"
              className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]"
            >
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">AutoFlow Builder</CardTitle>
                  <CardDescription>
                    Queue a chain of prompts. Sequential mode waits for each step; parallel mode
                    still respects blocking workspaces.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                    <Input
                      label="AutoFlow Name"
                      value={autoflowName}
                      onChange={(event) => setAutoflowName(event.target.value)}
                      placeholder="ServerMon cleanup wave"
                    />
                    <label className="space-y-1.5">
                      <span className="block text-sm font-medium">Run Mode</span>
                      <select
                        value={autoflowMode}
                        onChange={(event) =>
                          setAutoflowMode(event.target.value as typeof autoflowMode)
                        }
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <option value="sequential">Sequential</option>
                        <option value="parallel">Parallel</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_200px_180px]">
                      <Input
                        label="Step Name"
                        value={autoflowDraft.name}
                        onChange={(event) =>
                          setAutoflowDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Patch tests"
                      />
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Profile</span>
                        <select
                          value={autoflowDraft.agentProfileId}
                          onChange={(event) => {
                            const profile = profileMap[event.target.value];
                            setAutoflowDraft((current) => ({
                              ...current,
                              agentProfileId: event.target.value,
                              timeout: profile?.defaultTimeout ?? current.timeout,
                            }));
                          }}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select profile</option>
                          {profiles
                            .filter((profile) => profile.enabled)
                            .map((profile) => (
                              <option key={profile._id} value={profile._id}>
                                {profile.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Input
                        label="Timeout"
                        type="number"
                        value={autoflowDraft.timeout}
                        onChange={(event) =>
                          setAutoflowDraft((current) => ({
                            ...current,
                            timeout: Number(event.target.value) || 1,
                          }))
                        }
                        min={1}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Workspace</span>
                        <select
                          value={autoflowDraft.workspaceId ?? ''}
                          onChange={(event) => {
                            const workspace = workspaceMap[event.target.value];
                            setAutoflowDraft((current) => ({
                              ...current,
                              workspaceId: event.target.value || undefined,
                              workingDirectory: workspace?.path ?? current.workingDirectory,
                            }));
                          }}
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Custom path</option>
                          {workspaces
                            .filter((workspace) => workspace.enabled)
                            .map((workspace) => (
                              <option key={workspace._id} value={workspace._id}>
                                {workspace.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <div className="space-y-1.5">
                        <span className="block text-sm font-medium">Workspace Path</span>
                        <input
                          list="runner-directories"
                          value={autoflowDraft.workingDirectory}
                          onChange={(event) =>
                            setAutoflowDraft((current) => ({
                              ...current,
                              workspaceId:
                                workspaces.find(
                                  (workspace) => workspace.path === event.target.value
                                )?._id ?? undefined,
                              workingDirectory: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      </div>
                    </div>

                    <label className="block space-y-1.5">
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        Prompt
                        {promptTemplates.length > 0 ? (
                          <select
                            aria-label="Load prompt template into AutoFlow step"
                            onChange={(event) => {
                              const template = promptTemplates.find(
                                (item) => item._id === event.target.value
                              );
                              if (!template) return;
                              setAutoflowDraft((current) => ({
                                ...current,
                                promptId: undefined,
                                promptContent: applyPromptTemplate(
                                  template.content,
                                  current.promptContent ?? ''
                                ),
                              }));
                              event.target.value = '';
                            }}
                            className="h-9 max-w-[260px] rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            <option value="">Load template...</option>
                            {promptTemplates.map((template) => (
                              <option key={template._id} value={template._id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </span>
                      <textarea
                        value={autoflowDraft.promptContent ?? ''}
                        onChange={(event) =>
                          setAutoflowDraft((current) => ({
                            ...current,
                            promptId: undefined,
                            promptContent: event.target.value,
                          }))
                        }
                        className="min-h-44 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </label>

                    <div
                      role="region"
                      aria-label="Ad-hoc prompt attachments"
                      onDragEnter={acceptAttachmentDrag}
                      onDragOver={acceptAttachmentDrag}
                      onDrop={(event) => {
                        void uploadAutoflowAttachments(getDroppedAttachmentFiles(event));
                      }}
                      className="space-y-3 rounded-xl border border-dashed border-border/70 bg-background/70 p-4 transition-colors hover:border-primary/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Step files & images</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Uploaded to temp storage and passed to this ad-hoc step by path. Drop
                            files here or use upload.
                          </p>
                        </div>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent/50">
                          <Upload className="h-4 w-4" />
                          Upload
                          <input
                            type="file"
                            multiple
                            className="sr-only"
                            onChange={(event) => {
                              void uploadAutoflowAttachments(event.target.files);
                              event.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {(autoflowDraft.attachments ?? []).length > 0 ? (
                        <div className="space-y-2">
                          {(autoflowDraft.attachments ?? []).map((attachment, index) => (
                            <div
                              key={`${attachment.path}-${index}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs"
                            >
                              <span className="min-w-0 truncate">
                                {attachment.name}
                                <span className="ml-2 text-muted-foreground">
                                  {formatMemory(attachment.size)}
                                </span>
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeAutoflowAttachment(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={autoflowContinueOnFailure}
                          onChange={(event) => setAutoflowContinueOnFailure(event.target.checked)}
                        />
                        Continue after failed step
                      </label>
                      <Button variant="outline" onClick={addAutoflowItem}>
                        <Plus className="w-4 h-4" />
                        Add Step
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {autoflowItems.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {index + 1}. {item.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profileMap[item.agentProfileId]?.name || 'Unknown profile'} ·{' '}
                            {item.workspaceId
                              ? workspaceMap[item.workspaceId]?.name || item.workingDirectory
                              : item.workingDirectory}
                          </p>
                          {(item.attachments ?? []).length > 0 ? (
                            <Badge variant="outline" className="mt-2 text-[10px]">
                              {(item.attachments ?? []).length} files
                            </Badge>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setAutoflowItems((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    {autoflowItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        Start the current draft as a one-step AutoFlow, or add steps to build a
                        larger queue.
                      </div>
                    ) : null}
                  </div>

                  <Button
                    size="lg"
                    disabled={autoflowItems.length === 0 && !hasAutoflowDraftPrompt}
                    onClick={() => void runExclusiveAction('autoflow:submit', submitAutoflow)}
                    loading={isActionPending('autoflow:submit')}
                  >
                    <Play className="w-4 h-4" />
                    Start AutoFlow
                  </Button>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/60">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="text-sm">AutoFlow Runs</CardTitle>
                  <CardDescription>
                    Status across multi-step prompt queues and their generated runs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {autoflows.map((autoflow) => (
                    <div
                      key={autoflow._id}
                      className="border-b border-border/60 px-5 py-4 last:border-b-0"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold">{autoflow.name}</h3>
                            <Badge
                              variant={
                                autoflow.status === 'completed'
                                  ? 'success'
                                  : autoflow.status === 'failed'
                                    ? 'destructive'
                                    : autoflow.status === 'running'
                                      ? 'default'
                                      : 'outline'
                              }
                            >
                              {autoflow.status}
                            </Badge>
                            <Badge variant="outline">{autoflow.mode}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {autoflow.items.filter((item) => item.status === 'completed').length}/
                            {autoflow.items.length} complete
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {autoflow.status !== 'running' ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                void runExclusiveAction(`autoflow:start:${autoflow._id}`, () =>
                                  startAutoflow(autoflow._id)
                                )
                              }
                              loading={isActionPending(`autoflow:start:${autoflow._id}`)}
                            >
                              <Play className="w-4 h-4" />
                              Restart
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                void runExclusiveAction(`autoflow:cancel:${autoflow._id}`, () =>
                                  cancelAutoflow(autoflow._id)
                                )
                              }
                              loading={isActionPending(`autoflow:cancel:${autoflow._id}`)}
                            >
                              <Square className="w-4 h-4" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {autoflow.items.map((item, index) => (
                          <button
                            type="button"
                            key={item._id ?? `${autoflow._id}-${index}`}
                            disabled={!item.runId}
                            onClick={() => {
                              if (item.runId) void revealHistoryRun(item.runId);
                            }}
                            className={cn(
                              'grid min-h-10 w-full gap-2 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-left text-xs transition-colors sm:grid-cols-[32px_1fr_100px]',
                              item.runId
                                ? 'cursor-pointer hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring/40'
                                : 'cursor-default'
                            )}
                            title={item.runId ? 'Open this step in history' : 'No history run yet'}
                          >
                            <span className="text-muted-foreground">#{index + 1}</span>
                            <span className="min-w-0 truncate">{item.name}</span>
                            <Badge variant="outline">{item.status}</Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {autoflows.length === 0 ? (
                    <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                      No AutoFlows yet.
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'history' && (
            <div
              id="runner-tab-history"
              role="tabpanel"
              aria-labelledby="tab-history"
              className="space-y-5"
            >
              <Card className="border-border/60">
                <CardContent className="p-0">
                  <div className="border-b border-border/60 px-5 py-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(0,1fr))]">
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Search</span>
                          <Input
                            value={runSearch}
                            onChange={(event) => setRunSearch(event.target.value)}
                            placeholder="Prompt, command, profile, workspace"
                            icon={<Search className="w-4 h-4" />}
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <ListFilter className="w-3.5 h-3.5" />
                            Status
                          </span>
                          <select
                            value={historyStatusFilter}
                            onChange={(event) =>
                              setHistoryStatusFilter(
                                event.target.value as typeof historyStatusFilter
                              )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            <option value="all">All statuses</option>
                            <option value="queued">Queued</option>
                            <option value="running">Running</option>
                            <option value="retrying">Retrying</option>
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                            <option value="timeout">Timed out</option>
                            <option value="killed">Killed</option>
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Trigger</span>
                          <select
                            value={historyTriggerFilter}
                            onChange={(event) =>
                              setHistoryTriggerFilter(
                                event.target.value as typeof historyTriggerFilter
                              )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            <option value="all">All triggers</option>
                            <option value="manual">Manual</option>
                            <option value="schedule">Schedule</option>
                            <option value="autoflow">AutoFlow</option>
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Profile</span>
                          <select
                            value={historyProfileFilter}
                            onChange={(event) => setHistoryProfileFilter(event.target.value)}
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            <option value="all">All profiles</option>
                            {profiles.map((profile) => (
                              <option key={profile._id} value={profile._id}>
                                {profile.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Schedule
                          </span>
                          <select
                            value={historyScheduleFilter}
                            onChange={(event) => setHistoryScheduleFilter(event.target.value)}
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            <option value="all">All schedules</option>
                            <option value="none">No schedule</option>
                            {schedules.map((schedule) => (
                              <option key={schedule._id} value={schedule._id}>
                                {schedule.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() =>
                          void runExclusiveAction('history:refresh', () => loadAll(runSearch))
                        }
                        loading={isActionPending('history:refresh')}
                        className="h-10 shrink-0 self-end"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-border/60 bg-secondary/20 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Run</th>
                          <th className="px-4 py-3 text-left font-medium">Prompt</th>
                          <th className="px-4 py-3 text-left font-medium">Profile</th>
                          <th className="px-4 py-3 text-left font-medium">Trigger</th>
                          <th className="px-4 py-3 text-left font-medium">Workspace</th>
                          <th className="px-4 py-3 text-left font-medium">Started</th>
                          <th className="px-4 py-3 text-left font-medium">Duration</th>
                          <th className="px-4 py-3 text-left font-medium">Exit</th>
                          <th className="px-4 py-3 text-left font-medium">Resources</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryRuns.map((run) => (
                          <tr
                            key={run._id}
                            ref={(node) => {
                              historyRowRefs.current[run._id] = node;
                            }}
                            tabIndex={-1}
                            onClick={() => openRunDetail(run)}
                            className={cn(
                              'cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-ring/40',
                              selectedRun?._id === run._id && 'bg-primary/5',
                              focusedHistoryRunId === run._id && 'bg-primary/10'
                            )}
                          >
                            <td className="px-4 py-3 align-top">
                              <Badge variant={getRunStatusVariant(run.status)}>{run.status}</Badge>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="max-w-[220px]">
                                <p className="truncate font-medium">{getRunDisplayName(run)}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {getRunContextLabel(run)}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="max-w-[280px]">
                                <p className="truncate">{run.promptContent.slice(0, 80)}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {run.promptId
                                    ? promptMap[run.promptId]?.name || 'Saved prompt'
                                    : 'Inline prompt'}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {profileMap[run.agentProfileId]?.name || 'Unknown profile'}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Badge variant="outline">{run.triggeredBy}</Badge>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                                {run.workingDirectory}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div>
                                <p>{formatDateTime(run.startedAt ?? run.queuedAt)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatRelative(run.startedAt ?? run.queuedAt)}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              {formatDuration(run.durationSeconds)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {run.exitCode === undefined ? '—' : run.exitCode}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-xs text-muted-foreground">
                                <p>CPU {run.resourceUsage?.peakCpuPercent?.toFixed(1) ?? '—'}%</p>
                                <p>Mem {formatMemory(run.resourceUsage?.peakMemoryBytes)}</p>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredHistoryRuns.length === 0 && (
                    <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                      No runs match the current history filters.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'settings' && (
            <div
              id="runner-tab-settings"
              role="tabpanel"
              aria-labelledby="tab-settings"
              className="space-y-5"
            >
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <CompactStat
                    label="Profiles"
                    value={profiles.length}
                    tone="primary"
                    detail="Reusable AI CLI configurations."
                  />
                  <CompactStat
                    label="Workspaces"
                    value={activeWorkspaceCount}
                    tone="success"
                    detail={`${blockingWorkspaceCount} blocking workspace${blockingWorkspaceCount === 1 ? '' : 's'}.`}
                  />
                  <CompactStat
                    label="Templates"
                    value={promptTemplates.length}
                    tone="warning"
                    detail="Reusable wrappers for prompt editors."
                  />
                  <CompactStat
                    label="Enabled Profiles"
                    value={enabledProfileCount}
                    tone="success"
                    detail="Available for runs and schedules."
                  />
                  <CompactStat
                    label="Scheduled Profiles"
                    value={scheduledProfileCount}
                    detail="Profiles currently attached to automations."
                  />
                </div>

                <div className="flex flex-col gap-3 xl:sticky xl:top-4">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() =>
                      void runExclusiveAction('schedule:visualize:settings-all', () =>
                        openScheduleVisualization()
                      )
                    }
                    loading={isActionPending('schedule:visualize:settings-all')}
                    className="w-full justify-start"
                  >
                    <Eye className="w-4 h-4" />
                    Visualize All Schedules
                  </Button>
                  <Button
                    size="lg"
                    onClick={openCreateProfileModal}
                    className="w-full justify-start"
                  >
                    <Bot className="w-4 h-4" />
                    Create Profile
                  </Button>
                </div>
              </div>

              <Card className="border-border/60">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold">Portable Configuration</p>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      Export or import AI Runner profiles, saved prompts, schedules, workspaces,
                      prompt templates, and settings from this Settings page.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
                    <Button
                      variant="outline"
                      onClick={() => openBundleModal('export')}
                      className="justify-start"
                    >
                      <Download className="w-4 h-4" />
                      Export AI Runner
                    </Button>
                    <Button onClick={() => openBundleModal('import')} className="justify-start">
                      <Upload className="w-4 h-4" />
                      Import AI Runner
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">AutoFlow default mode</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      New AutoFlows use this mode unless changed in the builder.
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-border bg-background p-1">
                    {(['sequential', 'parallel'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          void runExclusiveAction(`settings:autoflow-mode:${mode}`, () =>
                            updateDefaultAutoflowMode(mode)
                          )
                        }
                        disabled={
                          isActionPending('settings:autoflow-mode:sequential') ||
                          isActionPending('settings:autoflow-mode:parallel')
                        }
                        className={cn(
                          'h-9 rounded-md px-4 text-sm font-medium transition-colors',
                          (runnerSettings?.autoflowMode ?? 'sequential') === mode
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                          (isActionPending('settings:autoflow-mode:sequential') ||
                            isActionPending('settings:autoflow-mode:parallel')) &&
                            'cursor-wait opacity-60'
                        )}
                      >
                        {mode === 'sequential' ? 'Sequential' : 'Parallel'}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="border-b border-border/60">
                  <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
                    <HardDrive className="h-4 w-4 text-primary" />
                    Storage & Retention
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Configure where AI Runner keeps run folders and how long Mongo snapshots and
                    filesystem artifacts are retained.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <label className="block space-y-2">
                    <LabelWithHint
                      label="Artifact base directory"
                      hint="New runs create one folder under this path with logs, metadata, and exit markers."
                    />
                    <Input
                      aria-label="Artifact base directory"
                      value={storageSettingsForm.artifactBaseDir}
                      onChange={(event) =>
                        setStorageSettingsForm((current) => ({
                          ...current,
                          artifactBaseDir: event.target.value,
                        }))
                      }
                      placeholder={runnerSettings?.defaultArtifactBaseDir ?? ''}
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <LabelWithHint
                        label="Mongo retention days"
                        hint="Completed AI Runner jobs and run snapshots older than this are cleaned from Mongo."
                      />
                      <Input
                        aria-label="Mongo retention days"
                        type="number"
                        min={MIN_RETENTION_DAYS}
                        max={MAX_RETENTION_DAYS}
                        inputMode="numeric"
                        value={storageSettingsForm.mongoRetentionDays}
                        onChange={(event) =>
                          setStorageSettingsForm((current) => ({
                            ...current,
                            mongoRetentionDays: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label className="block space-y-2">
                      <LabelWithHint
                        label="Artifact retention days"
                        hint="Completed run folders older than this are removed from the artifact directory."
                      />
                      <Input
                        aria-label="Artifact retention days"
                        type="number"
                        min={MIN_RETENTION_DAYS}
                        max={MAX_RETENTION_DAYS}
                        inputMode="numeric"
                        value={storageSettingsForm.artifactRetentionDays}
                        onChange={(event) =>
                          setStorageSettingsForm((current) => ({
                            ...current,
                            artifactRetentionDays: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Reset fills the platform defaults; Save applies them.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetStorageSettingsToDefaults}
                        disabled={!runnerSettings || storageSettingsSaving}
                        className="justify-start"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Reset
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void saveStorageSettings()}
                        loading={storageSettingsSaving}
                        disabled={!runnerSettings}
                        className="justify-start"
                      >
                        <Save className="w-4 h-4" />
                        Save Storage
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-5 xl:grid-cols-2">
                <Card className="overflow-hidden border-border/60">
                  <CardHeader className="border-b border-border/60">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg tracking-tight">Workspaces</CardTitle>
                        <CardDescription className="mt-1">
                          Named repo folders shared by runs, schedules, and autoflows.
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={() => openCreateWorkspaceModal()}>
                        <Plus className="w-4 h-4" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {workspaces.map((workspace) => (
                      <div
                        key={workspace._id}
                        className="border-b border-border/60 px-5 py-4 last:border-b-0"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">{workspace.name}</h3>
                              <Badge variant={workspace.enabled ? 'success' : 'warning'}>
                                {workspace.enabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                              <Badge variant={workspace.blocking ? 'warning' : 'outline'}>
                                {workspace.blocking ? 'Blocking' : 'Parallel allowed'}
                              </Badge>
                            </div>
                            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                              {workspace.path}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectWorkspaceForEdit(workspace)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                void runExclusiveAction(`workspace:delete:${workspace._id}`, () =>
                                  deleteWorkspace(workspace._id)
                                )
                              }
                              loading={isActionPending(`workspace:delete:${workspace._id}`)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {workspaces.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                        No workspaces yet. Add repo folders once and reuse them everywhere.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border/60">
                  <CardHeader className="border-b border-border/60">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg tracking-tight">Prompt Templates</CardTitle>
                        <CardDescription className="mt-1">
                          Wrappers loaded into prompt editors with {PROMPT_TEMPLATE_PLACEHOLDER}.
                        </CardDescription>
                      </div>
                      <Button size="sm" onClick={openCreatePromptTemplateModal}>
                        <Plus className="w-4 h-4" />
                        Add
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {promptTemplates.map((template) => (
                      <div
                        key={template._id}
                        className="border-b border-border/60 px-5 py-4 last:border-b-0"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold">{template.name}</h3>
                            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                              {template.content}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectPromptTemplateForEdit(template)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                void runExclusiveAction(
                                  `prompt-template:delete:${template._id}`,
                                  () => deletePromptTemplate(template._id)
                                )
                              }
                              loading={isActionPending(`prompt-template:delete:${template._id}`)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {promptTemplates.length === 0 ? (
                      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                        No templates yet. Create wrappers for checkout, PR, and cleanup flows.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card className="overflow-hidden border-border/60">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <CardTitle className="text-xl tracking-tight">Profile List</CardTitle>
                      <CardDescription className="mt-2 leading-6">
                        Compact profile rows with runtime details and schedule load in the same
                        place.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{enabledProfileCount} enabled</Badge>
                      <Badge variant="outline">{scheduledProfileCount} scheduled</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {profiles.map((profile) => {
                    const scheduleSummary = profileScheduleSummaryMap[profile._id] ?? {
                      totalSchedules: 0,
                      enabledSchedules: 0,
                      workspaceCount: 0,
                      highRiskWorkspaceCount: 0,
                      nextLaunch: undefined,
                    };

                    return (
                      <div
                        key={profile._id}
                        className="border-b border-border/60 px-5 py-4 last:border-b-0"
                      >
                        <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] xl:items-start">
                          <div className="flex min-w-0 items-start gap-4">
                            <ProfileIconPreview
                              icon={profile.icon}
                              name={profile.name}
                              className="h-12 w-12"
                            />
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-semibold tracking-tight">
                                  {profile.name}
                                </h3>
                                <Badge variant={profile.enabled ? 'success' : 'warning'}>
                                  {profile.enabled ? 'Enabled' : 'Disabled'}
                                </Badge>
                                <Badge variant="outline">{profile.agentType}</Badge>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {profile.slug}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {profile.defaultTimeout} min default
                                </Badge>
                                <Badge variant="outline">{profile.maxTimeout} min max</Badge>
                                <Badge variant="outline">{profile.shell}</Badge>
                                {profile.requiresTTY && (
                                  <Badge variant="outline">TTY required</Badge>
                                )}
                                <Badge variant="outline">
                                  {scheduleSummary.totalSchedules} schedule
                                  {scheduleSummary.totalSchedules === 1 ? '' : 's'}
                                </Badge>
                                {scheduleSummary.enabledSchedules > 0 ? (
                                  <Badge variant="success">
                                    {scheduleSummary.enabledSchedules} enabled schedule
                                    {scheduleSummary.enabledSchedules === 1 ? '' : 's'}
                                  </Badge>
                                ) : null}
                                {scheduleSummary.workspaceCount > 0 ? (
                                  <Badge variant="outline">
                                    {scheduleSummary.workspaceCount} workspace
                                    {scheduleSummary.workspaceCount === 1 ? '' : 's'}
                                  </Badge>
                                ) : null}
                                {scheduleSummary.highRiskWorkspaceCount > 0 ? (
                                  <Badge variant="warning">
                                    {scheduleSummary.highRiskWorkspaceCount} overlap risk
                                    {scheduleSummary.highRiskWorkspaceCount === 1 ? '' : 's'}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {scheduleSummary.nextLaunch
                                  ? `Next scheduled launch ${formatScheduleDate(scheduleSummary.nextLaunch)}`
                                  : scheduleSummary.totalSchedules > 0
                                    ? 'No upcoming launch is queued for this profile right now.'
                                    : 'No schedules are attached to this profile yet.'}
                              </p>
                            </div>
                          </div>
                          <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                            <p className="text-xs text-muted-foreground">Invocation template</p>
                            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                              {profile.invocationTemplate}
                            </pre>
                          </div>
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void runExclusiveAction(
                                  `schedule:visualize:profile:${profile._id}`,
                                  () => openScheduleVisualization(profile._id)
                                )
                              }
                              loading={isActionPending(`schedule:visualize:profile:${profile._id}`)}
                              disabled={scheduleSummary.totalSchedules === 0}
                            >
                              <Eye className="w-4 h-4" />
                              Visualize Schedules
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                void runExclusiveAction(`profile:test:${profile._id}`, () =>
                                  testProfile(profile._id)
                                )
                              }
                              loading={isActionPending(`profile:test:${profile._id}`)}
                            >
                              <Play className="w-4 h-4" />
                              Test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => selectProfileForEdit(profile)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                void runExclusiveAction(`profile:delete:${profile._id}`, () =>
                                  deleteProfile(profile._id)
                                )
                              }
                              loading={isActionPending(`profile:delete:${profile._id}`)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {profiles.length === 0 && (
                    <div className="rounded-[28px] border border-dashed border-primary/25 bg-gradient-to-br from-primary/5 via-background to-warning/5 px-6 py-16 text-center">
                      <h3 className="mt-3 text-xl font-semibold tracking-tight">
                        No profiles configured yet
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Open the profile studio and define your first reusable AI CLI config.
                      </p>
                      <div className="mt-6">
                        <Button onClick={openCreateProfileModal}>
                          <Bot className="w-4 h-4" />
                          Create Profile
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {profileModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={closeProfileModal}
                  />
                  <div className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-primary/20 bg-card/95 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">
                          Profile Studio
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                          {editingProfileId ? 'Edit agent profile' : 'Create agent profile'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Define a reusable AI CLI profile once, then use it across runs, prompts,
                          and schedules.
                        </p>
                      </div>
                      <button
                        onClick={closeProfileModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        aria-label="Close profile modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="overflow-y-auto px-6 py-6">
                      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                        <div className="space-y-6">
                          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                            <label className="block space-y-1.5">
                              <LabelWithHint
                                label="Name"
                                hint="A human-friendly label shown in dropdowns, cards, and history."
                              />
                              <Input
                                value={profileForm.name}
                                onChange={(event) => {
                                  const nextName = event.target.value;
                                  setProfileForm((current) => ({
                                    ...current,
                                    name: nextName,
                                    slug:
                                      editingProfileId || current.slug.trim().length > 0
                                        ? current.slug
                                        : slugifyValue(nextName),
                                  }));
                                }}
                              />
                            </label>
                            <label className="block space-y-1.5">
                              <LabelWithHint
                                label="Slug"
                                hint="A stable machine-friendly identifier. Keep it short, unique, and URL-safe, like codex-dangerous."
                              />
                              <Input
                                value={profileForm.slug}
                                onChange={(event) =>
                                  setProfileForm((current) => ({
                                    ...current,
                                    slug: slugifyValue(event.target.value),
                                  }))
                                }
                                placeholder="codex-dangerous"
                              />
                              <p className="text-xs text-muted-foreground">
                                Used as the durable ID behind the scenes.
                              </p>
                            </label>
                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="space-y-1.5">
                                <LabelWithHint
                                  label="Agent Type"
                                  hint="The AI CLI family this profile belongs to."
                                />
                                <select
                                  value={profileForm.agentType}
                                  onChange={(event) =>
                                    setProfileForm((current) => ({
                                      ...current,
                                      agentType: event.target
                                        .value as ProfileFormState['agentType'],
                                    }))
                                  }
                                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                >
                                  {[
                                    'codex',
                                    'claude-code',
                                    'opencode',
                                    'aider',
                                    'gemini-cli',
                                    'custom',
                                  ].map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block space-y-1.5">
                                <LabelWithHint
                                  label="Shell"
                                  hint="The shell used to execute the invocation template, usually /bin/bash."
                                />
                                <Input
                                  value={profileForm.shell}
                                  onChange={(event) =>
                                    setProfileForm((current) => ({
                                      ...current,
                                      shell: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="block space-y-1.5">
                                <LabelWithHint
                                  label="Default Timeout"
                                  hint="How long runs should get by default before the runner stops them."
                                />
                                <Input
                                  type="number"
                                  value={profileForm.defaultTimeout}
                                  onChange={(event) =>
                                    setProfileForm((current) => ({
                                      ...current,
                                      defaultTimeout: Number(event.target.value) || 1,
                                    }))
                                  }
                                />
                              </label>
                              <label className="block space-y-1.5">
                                <LabelWithHint
                                  label="Max Timeout"
                                  hint="The hard safety cap for this profile even if a prompt asks for more."
                                />
                                <Input
                                  type="number"
                                  value={profileForm.maxTimeout}
                                  onChange={(event) =>
                                    setProfileForm((current) => ({
                                      ...current,
                                      maxTimeout: Number(event.target.value) || 1,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/10 p-4 text-sm">
                              <input
                                type="checkbox"
                                checked={profileForm.requiresTTY}
                                onChange={(event) =>
                                  setProfileForm((current) => ({
                                    ...current,
                                    requiresTTY: event.target.checked,
                                  }))
                                }
                                className="mt-1"
                              />
                              <div className="space-y-1">
                                <span className="font-medium text-foreground">Requires TTY</span>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Turn this on for CLIs that need a real terminal and fail with
                                  &quot;stdin is not a terminal&quot;.
                                </p>
                              </div>
                            </label>
                          </div>

                          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                            <div className="space-y-3 rounded-xl border border-border/60 bg-secondary/15 p-4">
                              <div className="flex items-center gap-3">
                                <ProfileIconPreview
                                  icon={profileForm.icon}
                                  name={profileForm.name || 'Profile'}
                                />
                                <div>
                                  <LabelWithHint
                                    label="Icon"
                                    hint="Pick a preset icon or upload a small square image for this profile."
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Presets are quick. Upload works well for team-specific branding.
                                  </p>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                {ICON_PRESETS.map((preset) => {
                                  const Icon = preset.icon;
                                  const selected = profileForm.icon === preset.key;
                                  return (
                                    <button
                                      key={preset.key}
                                      type="button"
                                      onClick={() =>
                                        setProfileForm((current) => ({
                                          ...current,
                                          icon: preset.key,
                                        }))
                                      }
                                      className={cn(
                                        'flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs transition-colors',
                                        selected
                                          ? 'border-primary bg-primary/10 text-foreground'
                                          : 'border-border bg-background hover:bg-accent/40'
                                      )}
                                    >
                                      <Icon className="h-4 w-4" />
                                      <span>{preset.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex cursor-pointer items-center">
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      if (file.size > 200 * 1024) {
                                        toast({
                                          title: 'Image too large',
                                          description:
                                            'Please upload an icon under 200 KB so profile cards stay light.',
                                          variant: 'warning',
                                        });
                                        return;
                                      }
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const result =
                                          typeof reader.result === 'string'
                                            ? reader.result
                                            : undefined;
                                        if (!result) return;
                                        setProfileForm((current) => ({
                                          ...current,
                                          icon: result,
                                        }));
                                      };
                                      reader.readAsDataURL(file);
                                      event.target.value = '';
                                    }}
                                  />
                                  <span className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-accent/40">
                                    Upload Icon
                                  </span>
                                </label>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setProfileForm((current) => ({ ...current, icon: '' }))
                                  }
                                >
                                  Clear Icon
                                </Button>
                              </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={profileForm.enabled}
                                onChange={(event) =>
                                  setProfileForm((current) => ({
                                    ...current,
                                    enabled: event.target.checked,
                                  }))
                                }
                              />
                              Enabled
                            </label>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                            <label className="block space-y-1.5">
                              <LabelWithHint
                                label="Invocation Template"
                                hint="The shell command template used to launch the agent. It must include $PROMPT and can include $WORKING_DIR."
                              />
                              <textarea
                                value={profileForm.invocationTemplate}
                                onChange={(event) =>
                                  setProfileForm((current) => ({
                                    ...current,
                                    invocationTemplate: event.target.value,
                                  }))
                                }
                                className="min-h-[420px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring/40"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col-reverse gap-3 border-t border-border/60 bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="outline" onClick={closeProfileModal}>
                        Cancel
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            void runExclusiveAction('profile:validate', validateProfile)
                          }
                          loading={isActionPending('profile:validate')}
                        >
                          <TerminalSquare className="w-4 h-4" />
                          Validate
                        </Button>
                        <Button variant="outline" onClick={resetProfileForm}>
                          Reset
                        </Button>
                        <Button
                          onClick={() => void runExclusiveAction('profile:save', submitProfile)}
                          loading={isActionPending('profile:save')}
                        >
                          <Save className="w-4 h-4" />
                          {editingProfileId ? 'Update profile' : 'Create profile'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {workspaceModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                    onClick={closeWorkspaceModal}
                  />
                  <div className="relative w-full max-w-2xl rounded-[28px] border border-border bg-card p-6 shadow-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight">
                          {editingWorkspaceId ? 'Edit workspace' : 'Add workspace'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Workspaces bind a friendly name to a folder path and define whether only
                          one agent should run there at a time.
                        </p>
                      </div>
                      <button
                        onClick={closeWorkspaceModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50"
                        aria-label="Close workspace modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="mt-6 space-y-4">
                      <Input
                        label="Workspace Name"
                        value={workspaceForm.name}
                        onChange={(event) =>
                          setWorkspaceForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="ServerMon Repo"
                      />
                      <div className="space-y-1.5">
                        <span className="block text-sm font-medium">Workspace Path</span>
                        <input
                          list="runner-directories"
                          value={workspaceForm.path}
                          onChange={(event) =>
                            setWorkspaceForm((current) => ({
                              ...current,
                              path: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          placeholder="/root/repos/ServerMon"
                        />
                      </div>
                      <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/10 p-4 text-sm">
                        <input
                          type="checkbox"
                          checked={workspaceForm.blocking}
                          onChange={(event) =>
                            setWorkspaceForm((current) => ({
                              ...current,
                              blocking: event.target.checked,
                            }))
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium">Blocking workspace</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            When enabled, only one active AI Runner job can dispatch in this
                            workspace at a time.
                          </span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={workspaceForm.enabled}
                          onChange={(event) =>
                            setWorkspaceForm((current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                      <Button variant="outline" onClick={closeWorkspaceModal}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void runExclusiveAction('workspace:save', submitWorkspace)}
                        loading={isActionPending('workspace:save')}
                      >
                        <Save className="w-4 h-4" />
                        Save Workspace
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {promptTemplateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                    onClick={closePromptTemplateModal}
                  />
                  <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight">
                          {editingPromptTemplateId ? 'Edit template' : 'Create template'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Use {PROMPT_TEMPLATE_PLACEHOLDER} where the current editor content should
                          be inserted.
                        </p>
                      </div>
                      <button
                        onClick={closePromptTemplateModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50"
                        aria-label="Close template modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="overflow-y-auto px-6 py-5 space-y-4">
                      <Input
                        label="Template Name"
                        value={promptTemplateForm.name}
                        onChange={(event) =>
                          setPromptTemplateForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                      <Input
                        label="Tags (comma separated)"
                        value={promptTemplateForm.tags.join(', ')}
                        onChange={(event) =>
                          setPromptTemplateForm((current) => ({
                            ...current,
                            tags: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          }))
                        }
                      />
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Template Content</span>
                        <textarea
                          value={promptTemplateForm.content}
                          onChange={(event) =>
                            setPromptTemplateForm((current) => ({
                              ...current,
                              content: event.target.value,
                            }))
                          }
                          className="min-h-[360px] w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4">
                      <Button variant="outline" onClick={closePromptTemplateModal}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          void runExclusiveAction('prompt-template:save', submitPromptTemplate)
                        }
                        loading={isActionPending('prompt-template:save')}
                      >
                        <Save className="w-4 h-4" />
                        Save Template
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {bundleModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                    onClick={closeBundleModal}
                  />
                  <div className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.22em] text-primary/80">
                          Portable Configuration
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                          {bundleMode === 'export' ? 'Export AI Runner' : 'Import AI Runner'}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Move profiles, workspaces, prompts, templates, schedules, and settings
                          without exporting run history or AutoFlow executions.
                        </p>
                      </div>
                      <button
                        onClick={closeBundleModal}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50"
                        aria-label="Close import export modal"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="overflow-y-auto px-6 py-5">
                      <div className="mb-5 flex rounded-lg border border-border bg-background p-1">
                        {(['export', 'import'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setBundleMode(mode)}
                            className={cn(
                              'h-10 flex-1 rounded-md px-4 text-sm font-medium capitalize transition-colors',
                              bundleMode === mode
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                            )}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
                        <Card className="border-border/60">
                          <CardHeader>
                            <CardTitle className="text-sm">Bundle Contents</CardTitle>
                            <CardDescription>
                              Select the configuration families included in this operation.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {PORTABLE_RESOURCE_OPTIONS.map((resource) => {
                              const selected =
                                bundleMode === 'export'
                                  ? selectedExportResources.includes(resource.id)
                                  : selectedImportResources.includes(resource.id);
                              return (
                                <label
                                  key={resource.id}
                                  className={cn(
                                    'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                                    selected
                                      ? 'border-primary/30 bg-primary/5'
                                      : 'border-border/60 bg-background/70 hover:bg-accent/30'
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => togglePortableResource(resource.id, bundleMode)}
                                    className="mt-1"
                                  />
                                  <span>
                                    <span className="block text-sm font-semibold">
                                      {resource.label}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                      {resource.description}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </CardContent>
                        </Card>

                        {bundleMode === 'export' ? (
                          <Card className="border-border/60">
                            <CardHeader>
                              <CardTitle className="text-sm">Export JSON</CardTitle>
                              <CardDescription>
                                Generate once, then copy to clipboard or download as a JSON file.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() =>
                                    void runExclusiveAction('bundle:export', generateExportBundle)
                                  }
                                  loading={bundlePending || isActionPending('bundle:export')}
                                >
                                  <FileJson className="w-4 h-4" />
                                  Generate JSON
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={!exportJson}
                                  onClick={() =>
                                    void runExclusiveAction('bundle:copy', copyExportJson)
                                  }
                                  loading={isActionPending('bundle:copy')}
                                >
                                  <Copy className="w-4 h-4" />
                                  Copy JSON
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={!exportJson}
                                  onClick={downloadExportJson}
                                >
                                  <Download className="w-4 h-4" />
                                  Download
                                </Button>
                              </div>
                              <textarea
                                value={exportJson}
                                readOnly
                                className="min-h-[420px] w-full rounded-xl border border-input bg-background px-3 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/40"
                                placeholder="Generated export JSON will appear here."
                              />
                            </CardContent>
                          </Card>
                        ) : (
                          <Card className="border-border/60">
                            <CardHeader>
                              <CardTitle className="text-sm">Import Review</CardTitle>
                              <CardDescription>
                                Paste JSON or upload a bundle, preview conflicts, then choose
                                overwrite or skip.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="flex flex-wrap gap-2">
                                <label className="inline-flex cursor-pointer items-center">
                                  <input
                                    type="file"
                                    accept="application/json,.json"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const text =
                                          typeof reader.result === 'string' ? reader.result : '';
                                        setImportJson(text);
                                        setImportPreview(null);
                                        setImportResult(null);
                                      };
                                      reader.readAsText(file);
                                      event.target.value = '';
                                    }}
                                  />
                                  <span className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-accent/40">
                                    <Upload className="h-4 w-4" />
                                    Upload JSON
                                  </span>
                                </label>
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    void runExclusiveAction(
                                      'bundle:import-preview',
                                      previewImportBundle
                                    )
                                  }
                                  loading={
                                    bundlePending || isActionPending('bundle:import-preview')
                                  }
                                  disabled={!importJson.trim()}
                                >
                                  <Eye className="w-4 h-4" />
                                  Preview Import
                                </Button>
                                <Button
                                  onClick={() =>
                                    void runExclusiveAction(
                                      'bundle:import-apply',
                                      applyImportBundle
                                    )
                                  }
                                  loading={bundlePending || isActionPending('bundle:import-apply')}
                                  disabled={!importPreview || !importPreview.valid}
                                >
                                  <Upload className="w-4 h-4" />
                                  Apply Import
                                </Button>
                              </div>

                              <textarea
                                value={importJson}
                                onChange={(event) => {
                                  setImportJson(event.target.value);
                                  setImportPreview(null);
                                  setImportResult(null);
                                }}
                                className="min-h-[220px] w-full rounded-xl border border-input bg-background px-3 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring/40"
                                placeholder="Paste AI Runner export JSON here."
                              />

                              {importPreview ? (
                                <div className="space-y-4">
                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {PORTABLE_RESOURCE_OPTIONS.filter((resource) =>
                                      selectedImportResources.includes(resource.id)
                                    ).map((resource) => {
                                      const summary = importPreview.resources[resource.id];
                                      return (
                                        <div
                                          key={resource.id}
                                          className="rounded-xl border border-border/60 bg-background/70 px-4 py-3"
                                        >
                                          <p className="text-xs text-muted-foreground">
                                            {resource.label}
                                          </p>
                                          <p className="mt-1 text-sm font-semibold">
                                            {summary.incoming} incoming
                                          </p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {summary.conflicts} conflict
                                            {summary.conflicts === 1 ? '' : 's'}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {importPreview.missingReferences.length > 0 ? (
                                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                                      <p className="text-sm font-semibold text-destructive">
                                        Missing references
                                      </p>
                                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                        {importPreview.missingReferences.map((message) => (
                                          <p key={message}>{message}</p>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}

                                  {importPreview.conflicts.length > 0 ? (
                                    <div className="space-y-2">
                                      <p className="text-sm font-semibold">Conflict decisions</p>
                                      {importPreview.conflicts.map((conflict) => {
                                        const overwrite = shouldOverwriteImportConflict(conflict);
                                        return (
                                          <div
                                            key={`${conflict.resource}-${conflict.key}`}
                                            className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                          >
                                            <div>
                                              <p className="text-sm font-medium">
                                                {conflict.label}
                                              </p>
                                              <p className="mt-1 text-xs text-muted-foreground">
                                                {getResourceLabel(conflict.resource)} ·{' '}
                                                {conflict.incomingSummary}
                                              </p>
                                            </div>
                                            <div className="flex rounded-lg border border-border bg-card p-1">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setImportConflictDecision(conflict, false)
                                                }
                                                className={cn(
                                                  'h-8 rounded-md px-3 text-xs font-medium',
                                                  !overwrite
                                                    ? 'bg-warning/15 text-warning'
                                                    : 'text-muted-foreground'
                                                )}
                                              >
                                                Skip
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setImportConflictDecision(conflict, true)
                                                }
                                                className={cn(
                                                  'h-8 rounded-md px-3 text-xs font-medium',
                                                  overwrite
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'text-muted-foreground'
                                                )}
                                              >
                                                Overwrite
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-muted-foreground">
                                      No conflicts found for the selected resources.
                                    </div>
                                  )}

                                  {importResult ? (
                                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                                      <p className="text-sm font-semibold">Import result</p>
                                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                                        {PORTABLE_RESOURCE_OPTIONS.map((resource) => {
                                          const result = importResult.imported[resource.id];
                                          return (
                                            <p key={resource.id}>
                                              {resource.label}: {result.created} created,{' '}
                                              {result.updated} updated, {result.skipped} skipped
                                            </p>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div
              id="runner-tab-logs"
              role="tabpanel"
              aria-labelledby="tab-logs"
              className="space-y-5"
            >
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="text-sm">AI Runner Debug Stream</CardTitle>
                    <CardDescription>
                      Restart-scoped structured logs from the queue, supervisor, and worker
                      lifecycle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    <CompactStat
                      label="Entries"
                      value={logEntries.length}
                      tone="primary"
                      detail="Current in-browser tail for this session."
                    />
                    <CompactStat
                      label="Stream"
                      value={logStreamConnected ? 'Live' : 'Retrying'}
                      tone={logStreamConnected ? 'success' : 'warning'}
                      detail="SSE connection state for new log events."
                    />
                    <CompactStat
                      label="Session"
                      value={logSessionId ? logSessionId.slice(0, 8) : '—'}
                      detail="Fresh log file created on each app restart."
                    />
                  </CardContent>
                </Card>

                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="text-sm">Tail Controls</CardTitle>
                    <CardDescription>
                      Filter noise, inspect the current `/tmp` file, and refresh the recent tail.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Level</span>
                      <select
                        value={logLevelFilter}
                        onChange={(event) =>
                          setLogLevelFilter(event.target.value as typeof logLevelFilter)
                        }
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                      >
                        <option value="all">All levels</option>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                      </select>
                    </label>
                    <div className="rounded-xl border border-border/60 bg-secondary/20 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Current log file</p>
                      <p className="mt-1 break-all font-mono text-xs">{logFilePath || '—'}</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void runExclusiveAction('logs:refresh', loadLogs)}
                      loading={isActionPending('logs:refresh')}
                      className="w-full"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Refresh Tail
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {logsError ? (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
                  {logsError}
                </div>
              ) : null}

              <Card className="border-border/60">
                <CardContent className="p-0">
                  <div className="grid grid-cols-[170px_170px_minmax(180px,220px)_minmax(180px,220px)_minmax(320px,1fr)] border-b border-border/60 bg-secondary/20 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Time</span>
                    <span>Level</span>
                    <span>Component</span>
                    <span>Event</span>
                    <span>Message & Data</span>
                  </div>
                  <div
                    ref={logViewportRef}
                    className="max-h-[620px] overflow-auto bg-background/80 font-mono text-xs"
                  >
                    {filteredLogEntries.length === 0 ? (
                      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                        No AI Runner log entries match the current filter.
                      </div>
                    ) : (
                      filteredLogEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="grid grid-cols-[170px_170px_minmax(180px,220px)_minmax(180px,220px)_minmax(320px,1fr)] gap-3 border-b border-border/40 px-4 py-3 align-top"
                        >
                          <div>
                            <p>{formatDateTime(entry.timestamp)}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              pid {entry.pid}
                            </p>
                          </div>
                          <div>
                            <Badge
                              variant={
                                entry.level === 'error'
                                  ? 'destructive'
                                  : entry.level === 'warn'
                                    ? 'secondary'
                                    : entry.level === 'info'
                                      ? 'outline'
                                      : 'default'
                              }
                            >
                              {entry.level}
                            </Badge>
                          </div>
                          <div className="break-all text-muted-foreground">{entry.component}</div>
                          <div className="break-all">{entry.event}</div>
                          <div className="space-y-2">
                            <p className="font-sans text-sm leading-6">{entry.message}</p>
                            {entry.data ? (
                              <pre className="overflow-x-auto rounded-lg border border-border/60 bg-secondary/20 p-3 text-[11px] leading-5 whitespace-pre-wrap break-words">
                                {JSON.stringify(entry.data, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <ScheduleVisualizationModal
        key={`${scheduleVisualizationProfileId ?? 'all'}-${scheduleVisualizationOpen ? 'open' : 'closed'}`}
        isOpen={scheduleVisualizationOpen}
        onClose={closeScheduleVisualization}
        schedules={visualizationSchedules}
        promptMap={promptMap}
        profileMap={profileMap}
        scopeLabel={scheduleVisualizationProfile?.name}
      />

      <ConfirmationModal
        isOpen={Boolean(linkedDeleteTarget)}
        onConfirm={() => void confirmLinkedDelete()}
        onCancel={() => setLinkedDeleteTarget(null)}
        title="Delete linked item?"
        message={
          linkedDeleteTarget
            ? `${linkedDeleteTarget.name} is used by ${linkedDeleteTarget.scheduleCount} schedule${linkedDeleteTarget.scheduleCount === 1 ? '' : 's'}.`
            : ''
        }
        description="Deleting it will pause the linked schedules. They cannot be enabled again until their missing prompt, profile, or workspace is replaced."
        confirmLabel="Pause and Delete"
        cancelLabel="Keep"
        variant="warning"
        isLoading={linkedDeletePending}
      />

      {historyDetailOpen && selectedRun && (
        <RunDetailDrawer
          run={selectedRun}
          historyDetailSection={historyDetailSection}
          onSectionChange={setHistoryDetailSection}
          onClose={() => setHistoryDetailOpen(false)}
          onRerun={() =>
            void runExclusiveAction(`run:rerun:${selectedRun._id}`, () =>
              rerunHistoryItem(selectedRun)
            )
          }
          onKill={() => void runExclusiveAction(`run:kill:${selectedRun._id}`, killSelectedRun)}
          rerunPending={isActionPending(`run:rerun:${selectedRun._id}`)}
          killPending={isActionPending(`run:kill:${selectedRun._id}`)}
          onOpenPrompt={() => openRunPrompt(selectedRun)}
          onOpenSchedule={() => openRunSchedule(selectedRun)}
          getRunDisplayName={getRunDisplayName}
          profileName={profileMap[selectedRun.agentProfileId]?.name || 'Unknown profile'}
          promptSourceName={selectedRunPromptDoc?.name || 'Inline prompt'}
          scheduleName={selectedRunSchedule?.name || 'Not scheduled'}
        />
      )}
    </div>
  );
}
