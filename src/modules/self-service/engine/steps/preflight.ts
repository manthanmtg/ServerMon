import { createLogger } from '@/lib/logger';
import { detectCommand } from '../shell-executor';
import type { ExecutionMethod } from '../../types';

const log = createLogger('self-service:preflight');

interface PreflightResult {
  success: boolean;
  logs: string[];
  error?: string;
}

const TOOL_CHECKS: Record<string, string> = {
  docker: 'docker --version',
  'docker-compose': 'docker compose version',
  nginx: 'nginx -v',
  certbot: 'certbot --version',
  systemctl: 'systemctl --version',
  ufw: 'ufw --status',
  node: 'node --version',
  npm: 'npm --version',
  git: 'git --version',
};

export async function runPreflight(
  executionMethod: ExecutionMethod,
  pipeline: string[],
  onLog: (line: string) => void,
): Promise<PreflightResult> {
  const logs: string[] = [];
  const required: string[] = [];
  const warnings: string[] = [];

  if (executionMethod === 'docker-compose') {
    required.push('docker', 'docker-compose');
  }

  if (pipeline.includes('nginx-vhost') || pipeline.includes('nginx-reload')) {
    required.push('nginx');
  }

  if (pipeline.includes('ssl-cert')) {
    required.push('certbot');
  }

  if (pipeline.includes('systemd-unit')) {
    required.push('systemctl');
  }

  if (pipeline.includes('firewall')) {
    warnings.push('ufw');
  }

  onLog('Running pre-flight checks...');
  logs.push('Running pre-flight checks...');

  const missing: string[] = [];

  for (const tool of required) {
    const checkCmd = TOOL_CHECKS[tool] || `which ${tool}`;
    const result = await detectCommand(checkCmd);
    if (result.found) {
      const msg = `✓ ${tool}: ${result.output || 'available'}`;
      onLog(msg);
      logs.push(msg);
    } else {
      const msg = `✗ ${tool}: NOT FOUND (required)`;
      onLog(msg);
      logs.push(msg);
      missing.push(tool);
    }
  }

  for (const tool of warnings) {
    const checkCmd = TOOL_CHECKS[tool] || `which ${tool}`;
    const result = await detectCommand(checkCmd);
    if (result.found) {
      const msg = `✓ ${tool}: available`;
      onLog(msg);
      logs.push(msg);
    } else {
      const msg = `⚠ ${tool}: not found (optional, step will be skipped)`;
      onLog(msg);
      logs.push(msg);
    }
  }

  if (missing.length > 0) {
    const msg = `Pre-flight failed: missing required tools: ${missing.join(', ')}`;
    onLog(msg);
    logs.push(msg);
    log.error(msg);
    return { success: false, logs, error: msg };
  }

  const msg = 'Pre-flight checks passed.';
  onLog(msg);
  logs.push(msg);
  return { success: true, logs };
}
