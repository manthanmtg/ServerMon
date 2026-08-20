import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Loader2,
  MinusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeVariant } from '@/components/ui/badge';

export type OperationStatus =
  | 'submitting'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancel-requested'
  | 'canceled'
  | 'unchanged';

export interface OperationStatusPresentation {
  label: string;
  live: boolean;
  variant: BadgeVariant;
  icon: LucideIcon;
}

const PRESENTATIONS: Record<OperationStatus, OperationStatusPresentation> = {
  submitting: {
    label: 'Submitting',
    live: false,
    variant: 'secondary',
    icon: CircleDashed,
  },
  queued: {
    label: 'Queued',
    live: false,
    variant: 'secondary',
    icon: Clock3,
  },
  running: {
    label: 'Running',
    live: true,
    variant: 'warning',
    icon: Loader2,
  },
  succeeded: {
    label: 'Succeeded',
    live: false,
    variant: 'success',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    live: false,
    variant: 'destructive',
    icon: XCircle,
  },
  'cancel-requested': {
    label: 'Canceling',
    live: true,
    variant: 'warning',
    icon: Loader2,
  },
  canceled: {
    label: 'Canceled',
    live: false,
    variant: 'secondary',
    icon: Ban,
  },
  unchanged: {
    label: 'No changes',
    live: false,
    variant: 'outline',
    icon: MinusCircle,
  },
};

export function getOperationStatusPresentation(status: OperationStatus) {
  return PRESENTATIONS[status];
}

export function isLiveOperationStatus(status: OperationStatus) {
  return PRESENTATIONS[status].live;
}
