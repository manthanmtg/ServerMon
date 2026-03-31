import { createLogger } from '@/lib/logger';
import type { ExecutionMethod } from '../types';

const log = createLogger('self-service:executor');

export interface ExecutorResult {
  success: boolean;
  logs: string[];
  error?: string;
}

export interface Executor {
  execute(
    payload: ExecutorPayload,
    onLog: (line: string) => void,
  ): Promise<ExecutorResult>;
}

export interface ExecutorPayload {
  method: ExecutionMethod;
  commands?: string[];
  composeContent?: string;
  composeDir?: string;
  script?: string;
  binaryUrl?: string;
  binaryDest?: string;
  packageNames?: string[];
}

export function renderTemplate(
  template: string,
  config: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{\{config\.(\w+)\}\}/g, (_match, key: string) => {
    const value = config[key];
    if (value === undefined) {
      log.warn(`Template variable "config.${key}" not found in config`);
      return `{{config.${key}}}`;
    }
    return String(value);
  });
}

export function renderTemplateArray(
  templates: string[],
  config: Record<string, string | number | boolean>,
): string[] {
  return templates.map((t) => renderTemplate(t, config));
}
