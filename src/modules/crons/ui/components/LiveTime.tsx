'use client';

import React from 'react';
import { useRealtimeNow, formatCountdown, formatPastTime } from '../time';

export function LiveCountdown({ targetIso }: { targetIso: string }) {
  const now = useRealtimeNow();
  return <React.Fragment>{formatCountdown(targetIso, now)}</React.Fragment>;
}

export function LivePastTime({ iso }: { iso: string }) {
  const now = useRealtimeNow();
  return <React.Fragment>{formatPastTime(iso, now)}</React.Fragment>;
}
