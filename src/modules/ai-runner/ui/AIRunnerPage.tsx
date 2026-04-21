'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CalendarClock,
  Clock3,
  Copy,
  Eye,
  FolderOpen,
  History,
  ListFilter,
  Play,
  RefreshCcw,
  Save,
  Search,
  Square,
  TerminalSquare,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type {
  AIRunnerProfileDTO,
  AIRunnerPromptDTO,
  AIRunnerRunDTO,
  AIRunnerRunsResponse,
  AIRunnerScheduleDTO,
} from '../types';
import { TAB_META, DEFAULT_PROFILE_FORM, ICON_PRESETS } from './constants';
import { RunDetailDrawer } from './components/RunDetailDrawer';
import { ScheduleBuilder } from './components/ScheduleBuilder';
import { ScheduleVisualizationModal } from './components/ScheduleVisualizationModal';
import {
  CompactStat,
  LabelWithHint,
  ProfileIconPreview,
  StatCard,
} from './components/AIRunnerShared';
import type {
  HistoryDetailSection,
  ProfileFormState,
  PromptFormState,
  RunFormState,
  ScheduleFormState,
  ViewTab,
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

export default function AIRunnerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ViewTab>('run');
  const liveNow = useRealtimeNow(activeTab === 'schedules');
  const [loading, setLoading] = useState(true);
  const [metadataLoaded, setMetadataLoaded] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [profiles, setProfiles] = useState<AIRunnerProfileDTO[]>([]);
  const [prompts, setPrompts] = useState<AIRunnerPromptDTO[]>([]);
  const [schedules, setSchedules] = useState<AIRunnerScheduleDTO[]>([]);
  const [runs, setRuns] = useState<AIRunnerRunDTO[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [directories, setDirectories] = useState<string[]>([]);
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
  const [promptSearch, setPromptSearch] = useState('');
  const [promptTypeFilter, setPromptTypeFilter] = useState<'all' | AIRunnerPromptDTO['type']>(
    'all'
  );
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleVisualizationOpen, setScheduleVisualizationOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(DEFAULT_PROFILE_FORM);
  const [promptForm, setPromptForm] = useState<PromptFormState>(emptyPromptForm());
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(emptyScheduleForm());
  const [runForm, setRunForm] = useState<RunFormState>({
    name: '',
    content: '',
    type: 'inline',
    agentProfileId: '',
    workingDirectory: '',
    timeout: 30,
  });

  const selectedRunPrompt = prompts.find((prompt) => prompt._id === runForm.promptId) ?? null;
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
        setRunTotal(payload.total);
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
      const [profilesRes, promptsRes, directoriesRes] = await Promise.all([
        fetch('/api/modules/ai-runner/profiles', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/modules/ai-runner/prompts', { cache: 'no-store', signal: controller.signal }),
        fetch('/api/modules/ai-runner/directories', {
          cache: 'no-store',
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) return;

      if (profilesRes.ok) {
        const profilePayload: AIRunnerProfileDTO[] = await profilesRes.json();
        setProfiles(profilePayload);
        if (profilePayload[0]) {
          // Initialise the run/schedule forms only when they haven't been
          // touched yet — functional setters read the current value so this
          // stays idempotent across reloads.
          setRunForm((current) =>
            current.agentProfileId
              ? current
              : {
                  ...current,
                  agentProfileId: profilePayload[0]._id,
                  timeout: profilePayload[0].defaultTimeout,
                }
          );
          setScheduleForm((current) =>
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

      if (directoriesRes.ok) {
        const payload = await directoriesRes.json();
        if (controller.signal.aborted) return;
        setDirectories(payload.directories ?? []);
        setRunForm((current) => ({
          ...current,
          workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
        }));
        setScheduleForm((current) => ({
          ...current,
          workingDirectory: current.workingDirectory || payload.directories?.[0] || '',
        }));
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

  const loadAll = useCallback(
    async (searchOverride?: string) => {
      setRefreshing(true);
      try {
        const tasks: Promise<unknown>[] = [loadMetadata()];
        if (activeTab === 'history') {
          tasks.push(loadRuns(searchOverride), loadSchedules());
        } else if (activeTab === 'schedules') {
          tasks.push(loadSchedules());
        }
        await Promise.all(tasks);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, loadMetadata, loadRuns, loadSchedules]
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
  const scheduleMap = useMemo(
    () => Object.fromEntries(schedules.map((schedule) => [schedule._id, schedule])),
    [schedules]
  );
  const filteredPrompts = useMemo(() => {
    return prompts.filter((prompt) => {
      const matchesType = promptTypeFilter === 'all' || prompt.type === promptTypeFilter;
      const query = promptSearch.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        prompt.name.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [promptSearch, promptTypeFilter, prompts]);
  const selectedPrompt =
    filteredPrompts.find((prompt) => prompt._id === selectedPromptId) ?? filteredPrompts[0] ?? null;

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
      const profileName = profileMap[run.agentProfileId]?.name ?? '';
      const matchesSearch =
        query.length === 0 ||
        run.promptContent.toLowerCase().includes(query) ||
        run.command.toLowerCase().includes(query) ||
        run.workingDirectory.toLowerCase().includes(query) ||
        promptName.toLowerCase().includes(query) ||
        scheduleName.toLowerCase().includes(query) ||
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
  ]);

  const activeRunCount = runs.filter((run) => run.status === 'running').length;
  const enabledScheduleCount = schedules.filter((schedule) => schedule.enabled).length;
  const successfulRuns = runs.filter((run) => run.status === 'completed').length;
  const enabledProfileCount = profiles.filter((profile) => profile.enabled).length;
  const customProfileCount = profiles.filter((profile) => profile.agentType === 'custom').length;
  const fileBackedPromptCount = prompts.filter((prompt) => prompt.type === 'file-reference').length;
  const pausedScheduleCount = schedules.length - enabledScheduleCount;
  const recentlyActiveScheduleCount = schedules.filter((schedule) => {
    if (!schedule.lastRunAt) return false;
    return Date.now() - new Date(schedule.lastRunAt).getTime() < 24 * 60 * 60 * 1000;
  }).length;
  const scheduleModeCount = new Set(
    schedules.map((schedule) => getScheduleModeLabel(schedule.cronExpression))
  ).size;
  const nextSchedule = schedules
    .filter((schedule) => schedule.enabled && schedule.nextRunTime)
    .sort((a, b) => new Date(a.nextRunTime!).getTime() - new Date(b.nextRunTime!).getTime())[0];
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

  const profileAgentType = profileMap[runForm.agentProfileId]?.agentType;

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
    });
    setPromptModalOpen(true);
    setActiveTab('prompts');
  };

  const selectScheduleForEdit = (schedule: AIRunnerScheduleDTO) => {
    setEditingScheduleId(schedule._id);
    setScheduleForm({
      name: schedule.name,
      promptId: schedule.promptId,
      agentProfileId: schedule.agentProfileId,
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
    setEditingScheduleId(null);
    setScheduleForm(emptyScheduleForm(profiles[0]?._id, directories[0]));
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

  const openCreateScheduleModal = () => {
    resetScheduleForm();
    setScheduleModalOpen(true);
    setActiveTab('schedules');
  };

  const openScheduleVisualization = () => {
    setScheduleVisualizationOpen(true);
    setActiveTab('schedules');
  };

  const closeScheduleVisualization = () => {
    setScheduleVisualizationOpen(false);
  };

  const getRunDisplayName = useCallback(
    (run: AIRunnerRunDTO) => {
      if (run.scheduleId) {
        return scheduleMap[run.scheduleId]?.name || 'Scheduled run';
      }
      if (run.promptId) {
        return promptMap[run.promptId]?.name || 'Saved prompt run';
      }
      return run.promptContent.split('\n')[0]?.trim().slice(0, 72) || 'Manual run';
    },
    [promptMap, scheduleMap]
  );

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

  const handleTabChange = useCallback(
    (tab: ViewTab) => {
      setActiveTab(tab);
      if (tab === 'history') {
        if (!runsLoaded) {
          void loadRuns();
        }
        if (!schedulesLoaded) {
          void loadSchedules();
        }
        return;
      }
      if (tab === 'schedules' && !schedulesLoaded) {
        void loadSchedules();
      }
    },
    [loadRuns, loadSchedules, runsLoaded, schedulesLoaded]
  );

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
      setHistoryDetailOpen(false);
      setActiveTab('run');
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

  const submitRun = async () => {
    setRunPending(true);
    try {
      const requestBody =
        runForm.type === 'saved-prompt'
          ? {
              promptId: runForm.promptId,
              agentProfileId: runForm.agentProfileId,
              workingDirectory: runForm.workingDirectory,
              timeout: runForm.timeout,
            }
          : {
              name: runForm.name,
              content: runForm.content,
              type: runForm.type,
              agentProfileId: runForm.agentProfileId,
              workingDirectory: runForm.workingDirectory,
              timeout: runForm.timeout,
            };
      const response = await fetch('/api/modules/ai-runner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Run failed to start');
      }

      setSelectedRun(payload);
      setRuns((current) => [payload as AIRunnerRunDTO, ...current]);
      toast({
        title: 'Run started',
        description: 'The AI agent run has started successfully.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Run failed',
        description: error instanceof Error ? error.message : 'Unable to execute run',
        variant: 'destructive',
      });
    } finally {
      setRunPending(false);
    }
  };

  const saveRunAsPrompt = async () => {
    try {
      if (runForm.type === 'saved-prompt') {
        toast({
          title: 'Already saved',
          description: 'This mode already uses a saved prompt from your library.',
          variant: 'warning',
        });
        return;
      }
      const name = runForm.name.trim() || 'Saved prompt';
      const response = await fetch('/api/modules/ai-runner/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          content: runForm.content,
          type: runForm.type,
          tags: [],
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to save prompt');
      }
      toast({
        title: 'Prompt saved',
        description: 'The prompt is ready for reuse.',
        variant: 'success',
      });
      await loadAll();
      setActiveTab('prompts');
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save prompt',
        variant: 'destructive',
      });
    }
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
    setActiveTab('run');
    await loadAll();
  };

  const deleteProfile = async (id: string) => {
    const response = await fetch(`/api/modules/ai-runner/profiles/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete profile',
        variant: 'destructive',
      });
      return;
    }
    if (editingProfileId === id) {
      closeProfileModal();
    }
    await loadAll();
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
    const response = await fetch(`/api/modules/ai-runner/prompts/${id}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      toast({
        title: 'Delete failed',
        description: payload.error || 'Unable to delete prompt',
        variant: 'destructive',
      });
      return;
    }
    if (editingPromptId === id) {
      closePromptModal();
    }
    await loadAll();
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
      let baseName = `${schedule.name} Copy`;
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

  const openPromptInRun = (promptId: string) => {
    setSelectedPromptId(promptId);
    setRunForm((current) => ({
      ...current,
      type: 'saved-prompt',
      promptId,
    }));
    setActiveTab('run');
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
    setActiveTab('run');
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Runs"
          value={activeRunCount}
          icon={<Play className="w-4 h-4 text-primary" />}
        />
        <StatCard
          label="Enabled Schedules"
          value={enabledScheduleCount}
          icon={<CalendarClock className="w-4 h-4 text-warning" />}
        />
        <StatCard
          label="Profiles"
          value={profiles.length}
          icon={<Bot className="w-4 h-4 text-success" />}
        />
        <StatCard
          label="Successful Runs"
          value={successfulRuns}
          icon={<History className="w-4 h-4 text-info" />}
        />
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-card/60">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                AI Agent Runner
              </CardTitle>
              <CardDescription>
                Launch prompts, schedule recurring runs, and keep an audit trail of every execution.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {TAB_META.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTabChange(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadAll()}
                loading={refreshing}
              >
                <RefreshCcw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {activeTab === 'run' && (
            <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-sm">Prompt Composer</CardTitle>
                  <CardDescription>
                    Run ad-hoc input or execute a saved prompt from your library.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={runForm.type === 'inline' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRunForm((current) => ({ ...current, type: 'inline' }))}
                    >
                      Inline Prompt
                    </Button>
                    <Button
                      variant={runForm.type === 'file-reference' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setRunForm((current) => ({ ...current, type: 'file-reference' }))
                      }
                    >
                      File Reference
                    </Button>
                    <Button
                      variant={runForm.type === 'saved-prompt' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setRunForm((current) => ({
                          ...current,
                          type: 'saved-prompt',
                          promptId: current.promptId || prompts[0]?._id,
                        }))
                      }
                    >
                      Saved Prompt
                    </Button>
                    {profileAgentType && (
                      <Badge variant="secondary" className="ml-auto">
                        {profileAgentType}
                      </Badge>
                    )}
                  </div>

                  {runForm.type === 'saved-prompt' ? (
                    <>
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Saved Prompt</span>
                        <select
                          value={runForm.promptId ?? ''}
                          onChange={(event) =>
                            setRunForm((current) => ({
                              ...current,
                              promptId: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        >
                          <option value="">Select a saved prompt</option>
                          {prompts.map((prompt) => (
                            <option key={prompt._id} value={prompt._id}>
                              {prompt.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedRunPrompt ? (
                        <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold">{selectedRunPrompt.name}</h3>
                              <Badge variant="secondary">{selectedRunPrompt.type}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Reusable prompt definition. Choose how to run it below.
                            </p>
                          </div>
                          <p className="line-clamp-6 text-sm text-muted-foreground whitespace-pre-wrap">
                            {selectedRunPrompt.content}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 text-xs">
                            <div className="rounded-lg bg-background px-3 py-2">
                              <span className="text-muted-foreground">Tags</span>
                              <p className="mt-1 font-medium">
                                {selectedRunPrompt.tags.length > 0
                                  ? selectedRunPrompt.tags.join(', ')
                                  : 'No tags'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                          No saved prompts available yet
                        </div>
                      )}
                    </>
                  ) : runForm.type === 'inline' ? (
                    <label className="block space-y-1.5">
                      <span className="block text-sm font-medium">Prompt</span>
                      <textarea
                        value={runForm.content}
                        onChange={(event) =>
                          setRunForm((current) => ({ ...current, content: event.target.value }))
                        }
                        className="min-h-56 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        placeholder="Ask the AI agent to update tests, review code, or generate a feature..."
                      />
                    </label>
                  ) : (
                    <Input
                      label="Prompt File Path"
                      value={runForm.content}
                      onChange={(event) =>
                        setRunForm((current) => ({ ...current, content: event.target.value }))
                      }
                      placeholder="/root/repos/project/prompts/runner.md"
                      icon={<FolderOpen className="w-4 h-4" />}
                    />
                  )}

                  <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">Execution Settings</h3>
                      <p className="text-xs text-muted-foreground">
                        Pick the runtime context separately from the prompt content.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Run Label"
                        value={runForm.name}
                        onChange={(event) =>
                          setRunForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Nightly module cleanup"
                      />
                      <label className="space-y-1.5">
                        <span className="block text-sm font-medium">Agent Profile</span>
                        <select
                          value={runForm.agentProfileId}
                          onChange={(event) => {
                            const profile = profileMap[event.target.value];
                            setRunForm((current) => ({
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

                    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                      <div className="space-y-1.5">
                        <label htmlFor="run-directory" className="block text-sm font-medium">
                          Working Directory
                        </label>
                        <input
                          id="run-directory"
                          list="runner-directories"
                          value={runForm.workingDirectory}
                          onChange={(event) =>
                            setRunForm((current) => ({
                              ...current,
                              workingDirectory: event.target.value,
                            }))
                          }
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                          placeholder="/srv/repos/project"
                        />
                        <datalist id="runner-directories">
                          {directories.map((directory) => (
                            <option key={directory} value={directory} />
                          ))}
                        </datalist>
                      </div>
                      <Input
                        label="Timeout (minutes)"
                        type="number"
                        value={runForm.timeout}
                        onChange={(event) =>
                          setRunForm((current) => ({
                            ...current,
                            timeout: Number(event.target.value) || 1,
                          }))
                        }
                        min={1}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void submitRun()} loading={runPending}>
                      <Play className="w-4 h-4" />
                      Run Now
                    </Button>
                    {runForm.type !== 'saved-prompt' && (
                      <Button variant="outline" onClick={() => void saveRunAsPrompt()}>
                        <Save className="w-4 h-4" />
                        Save Prompt
                      </Button>
                    )}
                    <div className="ml-auto rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                      {runForm.type === 'saved-prompt'
                        ? 'Saved prompts reuse content; the execution settings come from the form above.'
                        : 'Best for one-off execution and live output.'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 min-h-[540px]">
                <CardHeader className="border-b border-border/60">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm">Live Output</CardTitle>
                      <CardDescription>
                        {selectedRun
                          ? `${selectedRun.status} • ${selectedRun.workingDirectory}`
                          : 'Run a prompt to see output here.'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedRun && (
                        <Badge
                          variant={
                            selectedRun.status === 'completed'
                              ? 'success'
                              : selectedRun.status === 'running'
                                ? 'default'
                                : 'warning'
                          }
                        >
                          {selectedRun.status}
                        </Badge>
                      )}
                      {selectedRun?.status === 'running' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void killSelectedRun()}
                        >
                          <Square className="w-4 h-4" />
                          Stop
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  {selectedRun ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3 text-xs">
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Started</span>
                          <p className="mt-1 font-medium">
                            {new Date(selectedRun.startedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Duration</span>
                          <p className="mt-1 font-medium">
                            {formatDuration(selectedRun.durationSeconds)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 px-3 py-2">
                          <span className="text-muted-foreground">Exit Code</span>
                          <p className="mt-1 font-medium">
                            {selectedRun.exitCode === undefined ? '—' : selectedRun.exitCode}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background overflow-hidden">
                        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
                          Clean Output
                        </div>
                        <pre className="max-h-[420px] overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                          {selectedRun.stdout || selectedRun.stderr || 'No output captured yet'}
                        </pre>
                      </div>
                      {selectedRun.stderr && (
                        <div className="rounded-xl border border-warning/30 bg-warning/5 overflow-hidden">
                          <div className="border-b border-warning/20 px-4 py-2 text-xs text-warning">
                            Stderr
                          </div>
                          <pre className="max-h-48 overflow-auto px-4 py-4 text-xs leading-6 whitespace-pre-wrap font-mono">
                            {selectedRun.stderr}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-[440px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                      Run a prompt to see output here
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'prompts' && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">
                    Saved Prompts
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Prompt authoring deserves a dedicated studio too
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    The library stays focused on browsing, selection, and quick launch. Creation and
                    editing now happen in a wide modal so prompt structure, tags, and content get
                    proper room.
                  </p>
                </div>
                <Button size="lg" onClick={openCreatePromptModal} className="shrink-0">
                  <Save className="w-4 h-4" />
                  Create Prompt
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <Card className="border-border/60">
                  <CardHeader className="border-b border-border/60">
                    <CardTitle className="text-sm">Search & Filter</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      label="Search"
                      value={promptSearch}
                      onChange={(event) => setPromptSearch(event.target.value)}
                      placeholder="Search by name, tag, or content"
                      icon={<Search className="w-4 h-4" />}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={promptTypeFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setPromptTypeFilter('all')}
                      >
                        All
                      </Button>
                      <Button
                        size="sm"
                        variant={promptTypeFilter === 'inline' ? 'default' : 'outline'}
                        onClick={() => setPromptTypeFilter('inline')}
                      >
                        Inline
                      </Button>
                      <Button
                        size="sm"
                        variant={promptTypeFilter === 'file-reference' ? 'default' : 'outline'}
                        onClick={() => setPromptTypeFilter('file-reference')}
                      >
                        File-backed
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{prompts.length} saved</Badge>
                      <Badge variant="outline">{fileBackedPromptCount} file-backed</Badge>
                      <Badge variant="outline">{filteredPrompts.length} visible</Badge>
                    </div>
                    {selectedPrompt ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">
                              Selected
                            </p>
                            <h3 className="text-sm font-semibold">{selectedPrompt.name}</h3>
                          </div>
                          <Badge variant="secondary">{selectedPrompt.type}</Badge>
                        </div>
                        <p className="line-clamp-4 text-xs text-muted-foreground whitespace-pre-wrap">
                          {selectedPrompt.content}
                        </p>
                        {selectedPrompt.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPrompt.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => openPromptInRun(selectedPrompt._id)}>
                            <Play className="w-4 h-4" />
                            Open in Run
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectPromptForEdit(selectedPrompt)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void deletePrompt(selectedPrompt._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        {prompts.length === 0
                          ? 'No prompts in the library yet'
                          : 'Select a prompt to preview it here'}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border/60">
                  <CardHeader className="border-b border-border/60">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <CardTitle className="text-lg tracking-tight">Library</CardTitle>
                        <CardDescription className="mt-1">
                          Compact rows for scanning, selection, and quick launch.
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{filteredPrompts.length} visible</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    {filteredPrompts.map((prompt) => (
                      <div
                        key={prompt._id}
                        onClick={() => setSelectedPromptId(prompt._id)}
                        className={cn(
                          'border-b border-border/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/20',
                          selectedPrompt?._id === prompt._id && 'bg-primary/5'
                        )}
                      >
                        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_auto] lg:items-center">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold tracking-tight">
                                {prompt.name}
                              </h3>
                              <Badge variant="secondary">{prompt.type}</Badge>
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
                                openPromptInRun(prompt._id);
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
                                void deletePrompt(prompt._id);
                              }}
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
                          {prompts.length === 0
                            ? 'No prompts in the library yet'
                            : 'No prompts match this filter'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {prompts.length === 0
                            ? 'Create a reusable prompt and it will show up here ready for runs and schedules.'
                            : 'Adjust the search or type filter to bring prompts back into view.'}
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
                              Execution settings now live in the Run tab and on schedules, so this
                              prompt stays reusable across profiles and repos.
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
                            <p className="text-sm font-semibold">
                              {promptForm.type === 'inline' ? 'Prompt Content' : 'Prompt File Path'}
                            </p>
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
                        <Button onClick={() => void submitPrompt()}>
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
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">
                    Automation Control
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Schedules should read like a control room, not a cramped form
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    The board stays focused on what exists and what launches next. Creation and
                    editing now open a much wider studio so the cadence builder has room to breathe.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={openScheduleVisualization}
                    className="shrink-0"
                  >
                    <Eye className="w-4 h-4" />
                    Visualize Schedule
                  </Button>
                  <Button size="lg" onClick={openCreateScheduleModal} className="shrink-0">
                    <CalendarClock className="w-4 h-4" />
                    Create Schedule
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <CompactStat
                  label="Enabled"
                  value={enabledScheduleCount}
                  tone="primary"
                  detail="Schedules ready to run."
                />
                <CompactStat
                  label="Next Launch"
                  value={
                    nextSchedule?.nextRunTime
                      ? formatScheduleDate(nextSchedule.nextRunTime)
                      : 'No launch queued'
                  }
                  tone="warning"
                  detail={
                    nextSchedule?.nextRunTime
                      ? `${nextSchedule.name} ${formatCountdown(nextSchedule.nextRunTime, liveNow)}`
                      : 'Enable a schedule to populate this.'
                  }
                />
                <CompactStat
                  label="Recently Active"
                  value={recentlyActiveScheduleCount}
                  tone="success"
                  detail="Ran within the last 24 hours."
                />
                <CompactStat
                  label="Modes"
                  value={scheduleModeCount}
                  detail={`${pausedScheduleCount} paused`}
                />
              </div>

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
                      <Badge variant="outline">{scheduleModeCount} modes in play</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {sortedSchedules.map((schedule, index) => (
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
                            onClick={() => void duplicateSchedule(schedule)}
                            title="Duplicate Schedule"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button size="sm" onClick={() => void runScheduleNow(schedule)}>
                            <Play className="w-4 h-4" />
                            Run Now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void toggleSchedule(schedule._id)}
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
                            onClick={() => void deleteSchedule(schedule._id)}
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
                              {formatCountdown(schedule.nextRunTime, liveNow)}
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
                  ))}

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
                  <div className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-primary/20 bg-card/95 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-6 py-5 backdrop-blur">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.26em] text-primary/80">
                          Automation Studio
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                          {editingScheduleId ? 'Edit schedule' : 'Create schedule'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          A full-width studio for prompt selection, runtime scene, and cadence
                          design.
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
                          <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              Prompt
                            </p>
                            <p className="mt-1 text-sm font-semibold">{scheduleFormPromptName}</p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              Profile
                            </p>
                            <p className="mt-1 text-sm font-semibold">{scheduleFormProfileName}</p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background/85 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              Cadence
                            </p>
                            <p className="mt-1 text-sm font-semibold">
                              {humanizeCron(scheduleForm.cronExpression)}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                          <div className="space-y-6">
                            <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
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

                            <div className="rounded-[24px] border border-border/60 bg-background/80 p-5 space-y-4">
                              <div>
                                <p className="text-sm font-semibold">Runtime Scene</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Tell the schedule where to run, how long it is allowed to stay
                                  active, and how many retries it gets after a failure.
                                </p>
                              </div>
                              <div className="grid gap-4 md:grid-cols-[1fr_140px_140px]">
                                <div className="space-y-1.5">
                                  <label
                                    htmlFor="schedule-directory"
                                    className="block text-sm font-medium"
                                  >
                                    Working Directory
                                  </label>
                                  <input
                                    id="schedule-directory"
                                    list="runner-directories"
                                    value={scheduleForm.workingDirectory}
                                    onChange={(event) =>
                                      setScheduleForm((current) => ({
                                        ...current,
                                        workingDirectory: event.target.value,
                                      }))
                                    }
                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                                    placeholder="/srv/repos/project"
                                  />
                                  <datalist id="runner-directories">
                                    {directories.map((directory) => (
                                      <option key={directory} value={directory} />
                                    ))}
                                  </datalist>
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
                        <Button onClick={() => void submitSchedule()}>
                          <CalendarClock className="w-4 h-4" />
                          {editingScheduleId ? 'Update schedule' : 'Create schedule'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <ScheduleVisualizationModal
                isOpen={scheduleVisualizationOpen}
                onClose={closeScheduleVisualization}
                schedules={sortedSchedules}
                promptMap={promptMap}
                profileMap={profileMap}
              />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-5">
              <Card className="border-border/60">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm">Run Audit Console</CardTitle>
                        <CardDescription>
                          {filteredHistoryRuns.length} of {runTotal} run(s) match the current
                          filters
                        </CardDescription>
                      </div>
                      <Button variant="outline" onClick={() => void loadAll(runSearch)}>
                        <RefreshCcw className="w-4 h-4" />
                        Refresh History
                      </Button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.6fr)_repeat(4,minmax(0,1fr))]">
                      <Input
                        value={runSearch}
                        onChange={(event) => setRunSearch(event.target.value)}
                        placeholder="Search prompt, command, profile, workspace"
                        icon={<Search className="w-4 h-4" />}
                      />

                      <label className="space-y-1">
                        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <ListFilter className="w-3.5 h-3.5" />
                          Status
                        </span>
                        <select
                          value={historyStatusFilter}
                          onChange={(event) =>
                            setHistoryStatusFilter(event.target.value as typeof historyStatusFilter)
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
                        <span className="text-xs font-medium text-muted-foreground">Schedule</span>
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
                  </div>
                </CardHeader>

                <CardContent className="p-0">
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
                            onClick={() => openRunDetail(run)}
                            className={cn(
                              'cursor-pointer border-b border-border/40 transition-colors hover:bg-accent/30',
                              selectedRun?._id === run._id && 'bg-primary/5'
                            )}
                          >
                            <td className="px-4 py-3 align-top">
                              <Badge variant={getRunStatusVariant(run.status)}>{run.status}</Badge>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="max-w-[220px]">
                                <p className="truncate font-medium">{getRunDisplayName(run)}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {run.scheduleId
                                    ? scheduleMap[run.scheduleId]?.name || 'Schedule'
                                    : 'Ad hoc'}
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
                                <p>{formatDateTime(run.startedAt)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatRelative(run.startedAt)}
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
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-primary/80">
                    Agent Profiles
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Profiles should be managed in a studio, not squeezed beside the list
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    The page stays focused on browsing and testing profiles. Creation and editing
                    now happen in a wide modal so templates, limits, and branding have enough room.
                  </p>
                </div>
                <Button size="lg" onClick={openCreateProfileModal} className="shrink-0">
                  <Bot className="w-4 h-4" />
                  Create Profile
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <CompactStat
                  label="Profiles"
                  value={profiles.length}
                  tone="primary"
                  detail="Reusable AI CLI configurations."
                />
                <CompactStat
                  label="Enabled"
                  value={enabledProfileCount}
                  tone="success"
                  detail="Available for runs and schedules."
                />
                <CompactStat
                  label="Custom"
                  value={customProfileCount}
                  tone="warning"
                  detail="Non-preset agent families."
                />
                <CompactStat
                  label="First in List"
                  value={profiles[0]?.name || 'No profiles yet'}
                  detail="Open a profile to test or edit it."
                />
              </div>

              <Card className="overflow-hidden border-border/60">
                <CardHeader className="border-b border-border/60">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <CardTitle className="text-xl tracking-tight">Profile List</CardTitle>
                      <CardDescription className="mt-2 leading-6">
                        Compact profile rows with the runtime template still visible when needed.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{enabledProfileCount} enabled</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {profiles.map((profile) => (
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
                            <p className="truncate text-xs text-muted-foreground">{profile.slug}</p>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{profile.defaultTimeout} min default</Badge>
                              <Badge variant="outline">{profile.maxTimeout} min max</Badge>
                              <Badge variant="outline">{profile.shell}</Badge>
                              {profile.requiresTTY && <Badge variant="outline">TTY required</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-3">
                          <p className="text-xs text-muted-foreground">Invocation template</p>
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                            {profile.invocationTemplate}
                          </pre>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <Button size="sm" onClick={() => void testProfile(profile._id)}>
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
                            onClick={() => void deleteProfile(profile._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                        <Button variant="outline" onClick={() => void validateProfile()}>
                          <TerminalSquare className="w-4 h-4" />
                          Validate
                        </Button>
                        <Button variant="outline" onClick={resetProfileForm}>
                          Reset
                        </Button>
                        <Button onClick={() => void submitProfile()}>
                          <Save className="w-4 h-4" />
                          {editingProfileId ? 'Update profile' : 'Create profile'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {historyDetailOpen && selectedRun && (
        <RunDetailDrawer
          run={selectedRun}
          historyDetailSection={historyDetailSection}
          onSectionChange={setHistoryDetailSection}
          onClose={() => setHistoryDetailOpen(false)}
          onRerun={() => void rerunHistoryItem(selectedRun)}
          onKill={() => void killSelectedRun()}
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
