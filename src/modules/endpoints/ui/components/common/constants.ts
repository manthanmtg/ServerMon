'use client';

import { Terminal, Braces, Globe } from 'lucide-react';
import type { EndpointType, HttpMethod } from '../../../types';

export const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  POST: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' },
  PUT: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
  PATCH: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
  DELETE: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
};

export const TYPE_ICONS: Record<EndpointType, typeof Terminal> = {
  script: Terminal,
  logic: Braces,
  webhook: Globe,
};

export const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const TYPES: EndpointType[] = ['script', 'logic', 'webhook'];
export const LANGUAGES: string[] = ['python', 'bash', 'node'];
