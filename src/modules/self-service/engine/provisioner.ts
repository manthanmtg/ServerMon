import { createLogger } from '@/lib/logger';
import type {
  InstallTemplate,
  InstallMethod,
  InstallJob,
  ProvisionStep,
  StepStatus,
  DetectionCheck,
  DetectionResult,
} from '../types';
import { PROVISION_STEP_LABELS } from '../types';
import { renderTemplate, renderTemplateArray } from './executor';
import {
  ShellExecutor,
  detectCommand,
  detectFile,
  detectPort,
  detectDockerContainer,
  detectSystemdService,
} from './shell-executor';
import { ComposeExecutor } from './compose-executor';
import { PackageExecutor } from './package-executor';
import { ScriptExecutor } from './script-executor';
import { runPreflight } from './steps/preflight';
import { runPortCheck } from './steps/port-check';
import { runFirewallSetup } from './steps/firewall';
import { runNginxVhostSetup, rollbackNginxVhost } from './steps/nginx-vhost';
import { runSslCertSetup, rollbackSslCert } from './steps/ssl-cert';
import { runSystemdUnitSetup, rollbackSystemdUnit } from './steps/systemd-unit';
import { runHealthCheck } from './steps/health-check';

const log = createLogger('self-service:provisioner');

export async function runDetection(checks: DetectionCheck[]): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];

  for (const check of checks) {
    switch (check.method) {
      case 'command': {
        const result = await detectCommand(check.value);
        let version: string | undefined;
        if (result.found && check.versionCommand) {
          const vResult = await detectCommand(check.versionCommand);
          version = vResult.output || undefined;
        }
        results.push({
          installed: result.found,
          method: 'command',
          version,
          details: result.output || undefined,
        });
        break;
      }
      case 'file': {
        const found = await detectFile(check.value);
        results.push({ installed: found, method: 'file', details: check.value });
        break;
      }
      case 'port': {
        const found = await detectPort(check.value);
        results.push({ installed: found, method: 'port', details: `port ${check.value}` });
        break;
      }
      case 'docker-container': {
        const found = await detectDockerContainer(check.value);
        results.push({ installed: found, method: 'docker-container', details: check.value });
        break;
      }
      case 'systemd-service': {
        const found = await detectSystemdService(check.value);
        results.push({ installed: found, method: 'systemd-service', details: check.value });
        break;
      }
    }
  }

  return results;
}

function createStepStatuses(pipeline: ProvisionStep[]): StepStatus[] {
  return pipeline.map((step) => ({
    step,
    label: PROVISION_STEP_LABELS[step],
    status: 'pending',
    logs: [],
  }));
}

function getStepStatus(job: InstallJob, step: ProvisionStep): StepStatus | undefined {
  return job.steps.find((s) => s.step === step);
}

function updateStep(job: InstallJob, step: ProvisionStep, updates: Partial<StepStatus>): void {
  const s = getStepStatus(job, step);
  if (s) {
    Object.assign(s, updates);
  }
}

export async function runProvisionPipeline(
  template: InstallTemplate,
  method: InstallMethod,
  config: Record<string, string | number | boolean>,
  job: InstallJob,
  onUpdate: (job: InstallJob) => void
): Promise<void> {
  const pipeline = method.pipeline ?? template.defaultPipeline;
  job.steps = createStepStatuses(pipeline);
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  onUpdate(job);

  const completedSteps: ProvisionStep[] = [];

  for (const step of pipeline) {
    updateStep(job, step, { status: 'running', startedAt: new Date().toISOString() });
    onUpdate(job);

    const onLog = (line: string) => {
      const s = getStepStatus(job, step);
      if (s) {
        s.logs.push(line);
        onUpdate(job);
      }
    };

    try {
      const result = await executeStep(step, template, method, config, onLog);

      if (result.success) {
        updateStep(job, step, {
          status: result.skipped ? 'skipped' : 'success',
          completedAt: new Date().toISOString(),
        });
        if (!result.skipped) {
          completedSteps.push(step);
        }
        onUpdate(job);
      } else {
        updateStep(job, step, {
          status: 'failed',
          error: result.error,
          completedAt: new Date().toISOString(),
        });
        job.status = 'failed';
        job.error = result.error;
        job.completedAt = new Date().toISOString();
        onUpdate(job);

        log.error(`Pipeline failed at step "${step}": ${result.error}`);
        return;
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      const msg = error.message || `Unexpected error in step ${step}`;
      updateStep(job, step, {
        status: 'failed',
        error: msg,
        completedAt: new Date().toISOString(),
      });
      job.status = 'failed';
      job.error = msg;
      job.completedAt = new Date().toISOString();
      onUpdate(job);
      log.error(`Pipeline exception at step "${step}"`, err);
      return;
    }
  }

  job.status = 'success';
  job.completedAt = new Date().toISOString();
  onUpdate(job);
  log.info(`Pipeline completed successfully for ${template.name} (method: ${method.id})`);
}

interface StepResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

async function executeStep(
  step: ProvisionStep,
  template: InstallTemplate,
  method: InstallMethod,
  config: Record<string, string | number | boolean>,
  onLog: (line: string) => void
): Promise<StepResult> {
  switch (step) {
    case 'preflight': {
      const r = await runPreflight(
        method.executionMethod,
        (method.pipeline ?? template.defaultPipeline) as string[],
        onLog
      );
      return r;
    }

    case 'install':
      return runInstallStep(method, config, onLog);

    case 'port-bind': {
      const port = config.port ?? config.httpPort;
      if (!port || typeof port === 'boolean') {
        onLog('No port configured — skipping port check.');
        return { success: true, skipped: true };
      }
      const r = await runPortCheck(port, onLog);
      return r;
    }

    case 'firewall': {
      const port = config.port ?? config.httpPort;
      const r = await runFirewallSetup(typeof port === 'boolean' ? 0 : (port ?? 0), onLog);
      return { success: r.success, skipped: r.skipped, error: r.error };
    }

    case 'nginx-vhost': {
      const domain = config.domain as string | undefined;
      if (!domain || !template.nginxTemplate) {
        onLog('No domain or Nginx template — skipping vhost setup.');
        return { success: true, skipped: true };
      }
      const renderedVhost = renderTemplate(template.nginxTemplate, config);
      const r = await runNginxVhostSetup(domain, renderedVhost, onLog);
      return r;
    }

    case 'ssl-cert': {
      const domain = config.domain as string | undefined;
      if (!domain) {
        onLog('No domain configured — skipping SSL.');
        return { success: true, skipped: true };
      }
      const sslMode = (config.sslMode as string) || 'letsencrypt';
      const r = await runSslCertSetup(
        domain,
        sslMode as 'letsencrypt' | 'self-signed' | 'none',
        onLog
      );
      return { success: r.success, skipped: r.skipped, error: r.error };
    }

    case 'nginx-reload': {
      const shell = new ShellExecutor();
      onLog('Reloading Nginx...');
      const r = await shell.execute({ method: 'shell', commands: ['nginx -s reload'] }, onLog);
      return r;
    }

    case 'systemd-unit': {
      const unitContent = method.systemdTemplate
        ? renderTemplate(method.systemdTemplate, config)
        : undefined;
      const r = await runSystemdUnitSetup(template.id, unitContent, onLog);
      return { success: r.success, skipped: r.skipped, error: r.error };
    }

    case 'health-check': {
      const url = template.healthCheckUrl
        ? renderTemplate(template.healthCheckUrl, config)
        : undefined;
      const command = template.healthCheckCommand
        ? renderTemplate(template.healthCheckCommand, config)
        : undefined;
      const r = await runHealthCheck({ url, command }, onLog);
      return r;
    }

    default: {
      onLog(`Unknown step: ${step} — skipping.`);
      return { success: true, skipped: true };
    }
  }
}

async function runInstallStep(
  method: InstallMethod,
  config: Record<string, string | number | boolean>,
  onLog: (line: string) => void
): Promise<StepResult> {
  switch (method.executionMethod) {
    case 'shell': {
      if (!method.installCommands?.length) {
        return { success: false, error: 'No install commands provided' };
      }
      const commands = renderTemplateArray(method.installCommands, config);
      const executor = new ShellExecutor();
      return executor.execute({ method: 'shell', commands }, onLog);
    }

    case 'docker-compose': {
      if (!method.composeTemplate) {
        return { success: false, error: 'No compose template provided' };
      }
      const composeContent = renderTemplate(method.composeTemplate, config);
      const composeDir = `/opt/${config.domain || 'services'}/${method.id}`;
      const executor = new ComposeExecutor();
      return executor.execute({ method: 'docker-compose', composeContent, composeDir }, onLog);
    }

    case 'package-manager': {
      if (!method.installCommands?.length) {
        return { success: false, error: 'No package names provided' };
      }
      const executor = new PackageExecutor();
      return executor.execute(
        { method: 'package-manager', packageNames: method.installCommands },
        onLog
      );
    }

    case 'script': {
      if (!method.installScript) {
        return { success: false, error: 'No install script provided' };
      }
      const script = renderTemplate(method.installScript, config);
      const executor = new ScriptExecutor();
      return executor.execute({ method: 'script', script }, onLog);
    }

    case 'binary-download': {
      if (!method.binaryUrl) {
        return { success: false, error: 'No binary URL provided' };
      }
      const url = renderTemplate(method.binaryUrl, config);
      const commands = [
        `curl -fsSL -o /tmp/download-binary "${url}"`,
        'chmod +x /tmp/download-binary',
        'mv /tmp/download-binary /usr/local/bin/',
      ];
      if (method.installCommands?.length) {
        commands.push(...renderTemplateArray(method.installCommands, config));
      }
      const executor = new ShellExecutor();
      return executor.execute({ method: 'shell', commands }, onLog);
    }

    default:
      return { success: false, error: `Unknown execution method: ${method.executionMethod}` };
  }
}

export async function rollbackPipeline(
  template: InstallTemplate,
  config: Record<string, string | number | boolean>,
  completedSteps: ProvisionStep[],
  onLog: (line: string) => void
): Promise<void> {
  const domain = config.domain as string | undefined;

  for (const step of [...completedSteps].reverse()) {
    try {
      switch (step) {
        case 'nginx-vhost':
          if (domain) await rollbackNginxVhost(domain, onLog);
          break;
        case 'ssl-cert':
          if (domain) await rollbackSslCert(domain, onLog);
          break;
        case 'systemd-unit':
          await rollbackSystemdUnit(template.id, onLog);
          break;
        case 'nginx-reload': {
          const shell = new ShellExecutor();
          await shell.execute({ method: 'shell', commands: ['nginx -s reload || true'] }, onLog);
          break;
        }
        default:
          onLog(`No rollback action for step: ${step}`);
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      log.error(`Rollback error for step ${step}`, err);
      onLog(`Rollback error for ${step}: ${error.message || 'unknown'}`);
    }
  }
}
