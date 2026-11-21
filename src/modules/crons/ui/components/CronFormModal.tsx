import { useState } from 'react';
import { LoaderCircle, Terminal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CronJob } from '../../types';
import { ScheduleBuilder } from './ScheduleBuilder';

export interface CronFormModalProps {
  mode: 'create' | 'edit';
  initial?: CronJob;
  onClose: () => void;
  onSubmit: (data: {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
    command: string;
    comment?: string;
  }) => Promise<void>;
}

export function CronFormModal({ mode, initial, onClose, onSubmit }: CronFormModalProps) {
  const [minute, setMinute] = useState(initial?.minute || '*');
  const [hour, setHour] = useState(initial?.hour || '*');
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth || '*');
  const [month, setMonth] = useState(initial?.month || '*');
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek || '*');
  const [command, setCommand] = useState(initial?.command || '');
  const [comment, setComment] = useState(initial?.comment || '');
  const [submitting, setSubmitting] = useState(false);

  function handleFieldChange(field: string, value: string) {
    switch (field) {
      case 'minute':
        setMinute(value);
        break;
      case 'hour':
        setHour(value);
        break;
      case 'dayOfMonth':
        setDayOfMonth(value);
        break;
      case 'month':
        setMonth(value);
        break;
      case 'dayOfWeek':
        setDayOfWeek(value);
        break;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        minute,
        hour,
        dayOfMonth,
        month,
        dayOfWeek,
        command,
        comment: comment || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cron-form-modal-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl mx-4"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 id="cron-form-modal-title" className="text-lg font-semibold">
            {mode === 'create' ? 'Create Cron Job' : 'Edit Cron Job'}
          </h2>
          <button
            type="button"
            aria-label={`Close ${mode === 'create' ? 'create job' : 'edit job'} dialog`}
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <ScheduleBuilder
            minute={minute}
            hour={hour}
            dayOfMonth={dayOfMonth}
            month={month}
            dayOfWeek={dayOfWeek}
            onChange={handleFieldChange}
          />

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Command
            </span>
            <div className="relative">
              <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="/path/to/script.sh --flag"
                required
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Comment (optional)
            </span>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Description of this cron job"
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !command.trim()}>
              {submitting && <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'create' ? 'Create Job' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
