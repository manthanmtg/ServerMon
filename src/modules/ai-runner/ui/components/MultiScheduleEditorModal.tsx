'use client';

import { useMemo, useState } from 'react';
import { FileJson, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { AIRunnerScheduleDTO } from '../../types';
import { formatScheduleDate } from '../utils';

type EditableField = 'cronExpression' | 'timeout' | 'retries';

interface ScheduleDraftRow {
  id: string;
  cronExpression: string;
  timeout: string;
  retries: string;
}

interface RowError {
  id: string;
  field?: EditableField | 'id';
  message: string;
}

interface MultiScheduleEditorModalProps {
  schedules: AIRunnerScheduleDTO[];
  promptNames: Record<string, string>;
  profileNames: Record<string, string>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const ALLOWED_CSV_COLUMNS = new Set(['id', 'name', 'cronExpression', 'timeout', 'retries']);

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function getDraftRows(schedules: AIRunnerScheduleDTO[]): ScheduleDraftRow[] {
  return schedules.map((schedule) => ({
    id: schedule._id,
    cronExpression: schedule.cronExpression,
    timeout: String(schedule.timeout),
    retries: String(schedule.retries),
  }));
}

function getInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  return Number(value);
}

function validateRows(rows: ScheduleDraftRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    const timeout = getInteger(row.timeout);
    const retries = getInteger(row.retries);
    if (!row.cronExpression.trim()) {
      errors[row.id] = 'Cron expression is required.';
    } else if (timeout === null || timeout < 1 || timeout > 24 * 60) {
      errors[row.id] = 'Timeout must be between 1 and 1440 minutes.';
    } else if (retries === null || retries < 0 || retries > 9) {
      errors[row.id] = 'Retries must be between 0 and 9.';
    }
  }
  return errors;
}

export function MultiScheduleEditorModal({
  schedules,
  promptNames,
  profileNames,
  onClose,
  onSaved,
}: MultiScheduleEditorModalProps) {
  const { toast } = useToast();
  const [draftRows, setDraftRows] = useState(() => getDraftRows(schedules));
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [saving, setSaving] = useState(false);

  const scheduleMap = useMemo(
    () => Object.fromEntries(schedules.map((schedule) => [schedule._id, schedule])),
    [schedules]
  );
  const nameMatches = useMemo(() => {
    const matches = new Map<string, AIRunnerScheduleDTO[]>();
    for (const schedule of schedules) {
      matches.set(schedule.name, [...(matches.get(schedule.name) ?? []), schedule]);
    }
    return matches;
  }, [schedules]);
  const draftMap = useMemo(
    () => Object.fromEntries(draftRows.map((row) => [row.id, row])),
    [draftRows]
  );
  const localErrors = validateRows(draftRows);
  const serverErrorMap = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const error of serverErrors) {
      errors[error.id] = error.message;
    }
    return errors;
  }, [serverErrors]);
  const dirtyRows = draftRows.filter((row) => {
    const schedule = scheduleMap[row.id];
    if (!schedule) return false;
    return (
      row.cronExpression !== schedule.cronExpression ||
      row.timeout !== String(schedule.timeout) ||
      row.retries !== String(schedule.retries)
    );
  });
  const canSave = dirtyRows.length > 0 && Object.keys(localErrors).length === 0 && !saving;

  const updateDraft = (id: string, field: EditableField, value: string) => {
    setServerErrors([]);
    setDraftRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const applyCsv = () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setCsvErrors(['CSV must include a header row and at least one update row.']);
      return;
    }

    const headers = parseCsvLine(lines[0] ?? '');
    const errors: string[] = [];
    const unsupported = headers.filter((header) => !ALLOWED_CSV_COLUMNS.has(header));
    if (unsupported.length > 0) {
      errors.push(`Unsupported columns: ${unsupported.join(', ')}`);
    }
    if (new Set(headers).size !== headers.length) {
      errors.push('CSV header contains duplicate columns.');
    }

    const changes = new Map<string, Partial<Pick<ScheduleDraftRow, EditableField>>>();
    const seenTargets = new Set<string>();

    lines.slice(1).forEach((line, index) => {
      const values = parseCsvLine(line);
      const rowNumber = index + 2;
      const record = Object.fromEntries(
        headers.map((header, valueIndex) => [header, values[valueIndex] ?? ''])
      );
      let schedule: AIRunnerScheduleDTO | undefined;
      if (record.id) {
        schedule = scheduleMap[record.id];
        if (!schedule) errors.push(`Row ${rowNumber}: unknown schedule id "${record.id}".`);
      } else if (record.name) {
        const matches = nameMatches.get(record.name) ?? [];
        if (matches.length === 1) {
          schedule = matches[0];
        } else if (matches.length > 1) {
          errors.push(`Row ${rowNumber}: schedule name "${record.name}" is ambiguous.`);
        } else {
          errors.push(`Row ${rowNumber}: unknown schedule name "${record.name}".`);
        }
      } else {
        errors.push(`Row ${rowNumber}: provide id or name.`);
      }

      if (!schedule) return;
      if (seenTargets.has(schedule._id)) {
        errors.push(`Row ${rowNumber}: duplicate target "${schedule.name}".`);
        return;
      }
      seenTargets.add(schedule._id);

      const change: Partial<Pick<ScheduleDraftRow, EditableField>> = {};
      if ('cronExpression' in record) change.cronExpression = record.cronExpression;
      if ('timeout' in record) change.timeout = record.timeout;
      if ('retries' in record) change.retries = record.retries;
      changes.set(schedule._id, change);
    });

    if (errors.length > 0) {
      setCsvErrors(errors);
      return;
    }

    setCsvErrors([]);
    setServerErrors([]);
    setDraftRows((current) =>
      current.map((row) => {
        const change = changes.get(row.id);
        return change ? { ...row, ...change } : row;
      })
    );
  };

  const saveChanges = async () => {
    if (!canSave) return;
    setSaving(true);
    setServerErrors([]);
    try {
      const response = await fetch('/api/modules/ai-runner/schedules/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: dirtyRows.map((row) => ({
            id: row.id,
            cronExpression: row.cronExpression,
            timeout: Number(row.timeout),
            retries: Number(row.retries),
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (Array.isArray(payload.rowErrors)) {
          setServerErrors(payload.rowErrors);
        }
        throw new Error(payload.error || 'Unable to save schedule updates');
      }

      toast({
        title: 'Schedules updated',
        description: `${dirtyRows.length} schedule${dirtyRows.length === 1 ? '' : 's'} updated.`,
        variant: 'success',
      });
      await onSaved();
      onClose();
    } catch (error) {
      toast({
        title: 'Bulk schedule save failed',
        description: error instanceof Error ? error.message : 'Unable to save schedule updates',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="multi-schedule-editor-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div>
            <h2 id="multi-schedule-editor-title" className="text-xl font-semibold tracking-tight">
              Multi Schedule Editor
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit cron cadence, timeout, and retries across existing schedules.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close multi schedule editor"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{schedules.length} schedules</Badge>
              <Badge variant={dirtyRows.length > 0 ? 'warning' : 'outline'}>
                {dirtyRows.length} changed
              </Badge>
            </div>
            <Button variant="outline" onClick={() => setCsvOpen((current) => !current)}>
              <FileJson className="h-4 w-4" />
              Import CSV
            </Button>
          </div>

          {csvOpen ? (
            <div className="rounded-[16px] border border-border/70 bg-muted/20 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <label className="text-sm font-medium" htmlFor="multi-schedule-csv">
                    CSV schedule updates
                  </label>
                  <textarea
                    id="multi-schedule-csv"
                    aria-label="CSV schedule updates"
                    className="mt-2 min-h-40 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    placeholder={
                      'name,cronExpression,timeout,retries\nNightly cleanup,0 2 * * *,45,1'
                    }
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Accepted formats</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 text-xs">
                    {'name,cronExpression,timeout,retries\nNightly cleanup,0 2 * * *,45,1'}
                  </pre>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 text-xs">
                    {'id,cronExpression,timeout,retries\n665...,*/30 * * * *,30,0'}
                  </pre>
                  <Button className="mt-3 w-full" onClick={applyCsv}>
                    <Upload className="h-4 w-4" />
                    Apply CSV
                  </Button>
                </div>
              </div>
              {csvErrors.length > 0 ? (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {csvErrors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-[16px] border border-border/70">
            <table className="min-w-full divide-y divide-border/70 text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Schedule</th>
                  <th className="px-4 py-3 font-medium">Prompt</th>
                  <th className="px-4 py-3 font-medium">Profile</th>
                  <th className="px-4 py-3 font-medium">Next launch</th>
                  <th className="px-4 py-3 font-medium">Cron</th>
                  <th className="px-4 py-3 font-medium">Timeout</th>
                  <th className="px-4 py-3 font-medium">Retries</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {schedules.map((schedule) => {
                  const row = draftMap[schedule._id];
                  if (!row) return null;
                  const rowDirty = dirtyRows.some((dirtyRow) => dirtyRow.id === schedule._id);
                  const rowError = localErrors[schedule._id] ?? serverErrorMap[schedule._id];
                  return (
                    <tr key={schedule._id} className={cn(rowDirty && 'bg-warning/5')}>
                      <td className="min-w-48 px-4 py-3 align-top">
                        <p className="font-medium">{schedule.name}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {schedule._id}
                        </p>
                      </td>
                      <td className="min-w-40 px-4 py-3 align-top">
                        {promptNames[schedule.promptId] ?? 'Unknown prompt'}
                      </td>
                      <td className="min-w-40 px-4 py-3 align-top">
                        {profileNames[schedule.agentProfileId] ?? 'Unknown profile'}
                      </td>
                      <td className="min-w-40 px-4 py-3 align-top">
                        {formatScheduleDate(schedule.nextRunTime)}
                      </td>
                      <td className="min-w-56 px-4 py-3 align-top">
                        <Input
                          aria-label={`${schedule.name} cron expression`}
                          value={row.cronExpression}
                          onChange={(event) =>
                            updateDraft(schedule._id, 'cronExpression', event.target.value)
                          }
                        />
                      </td>
                      <td className="min-w-28 px-4 py-3 align-top">
                        <Input
                          type="number"
                          min={1}
                          max={24 * 60}
                          aria-label={`${schedule.name} timeout`}
                          value={row.timeout}
                          onChange={(event) =>
                            updateDraft(schedule._id, 'timeout', event.target.value)
                          }
                        />
                      </td>
                      <td className="min-w-28 px-4 py-3 align-top">
                        <Input
                          type="number"
                          min={0}
                          max={9}
                          aria-label={`${schedule.name} retries`}
                          value={row.retries}
                          onChange={(event) =>
                            updateDraft(schedule._id, 'retries', event.target.value)
                          }
                        />
                      </td>
                      <td className="min-w-40 px-4 py-3 align-top">
                        {rowError ? (
                          <span className="text-xs font-medium text-destructive">{rowError}</span>
                        ) : rowDirty ? (
                          <Badge variant="warning">Changed</Badge>
                        ) : (
                          <Badge variant="outline">Current</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Save validates every changed row before applying updates.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void saveChanges()} disabled={!canSave} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
