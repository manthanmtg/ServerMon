export type ExecutionMethod =
  | 'shell'
  | 'docker-compose'
  | 'package-manager'
  | 'binary-download'
  | 'script';

export type TemplateCategory = 'service' | 'cli-tool' | 'development' | 'monitoring' | 'database';

export type ProvisionStep =
  | 'preflight'
  | 'install'
  | 'port-bind'
  | 'firewall'
  | 'nginx-vhost'
  | 'ssl-cert'
  | 'nginx-reload'
  | 'systemd-unit'
  | 'health-check';

export const PROVISION_STEP_LABELS: Record<ProvisionStep, string> = {
  preflight: 'Pre-flight Checks',
  install: 'Install Service',
  'port-bind': 'Port Binding',
  firewall: 'Firewall Rules',
  'nginx-vhost': 'Nginx Virtual Host',
  'ssl-cert': 'SSL Certificate',
  'nginx-reload': 'Nginx Reload',
  'systemd-unit': 'Systemd Service',
  'health-check': 'Health Check',
};

export const FULL_SERVICE_PIPELINE: ProvisionStep[] = [
  'preflight',
  'install',
  'port-bind',
  'firewall',
  'nginx-vhost',
  'ssl-cert',
  'nginx-reload',
  'systemd-unit',
  'health-check',
];

export const CLI_TOOL_PIPELINE: ProvisionStep[] = ['preflight', 'install'];

export interface ConfigFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
}

export interface ConfigFieldOption {
  label: string;
  value: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: string | number | boolean;
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: ConfigFieldOption[];
  validation?: ConfigFieldValidation;
}

export interface InstallMethod {
  id: string;
  label: string;
  executionMethod: ExecutionMethod;
  recommended?: boolean;
  installCommands?: string[];
  composeTemplate?: string;
  binaryUrl?: string;
  installScript?: string;
  pipeline?: ProvisionStep[];
  configOverrides?: ConfigField[];
  systemdTemplate?: string;
}

export type DetectionMethod = 'command' | 'file' | 'port' | 'docker-container' | 'systemd-service';

export interface DetectionCheck {
  method: DetectionMethod;
  value: string;
  versionCommand?: string;
}

export interface DetectionResult {
  installed: boolean;
  method: DetectionMethod;
  version?: string;
  details?: string;
}

export interface InstallTemplate {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: TemplateCategory;
  icon?: string;
  tags: string[];
  installMethods: InstallMethod[];
  defaultPipeline: ProvisionStep[];
  configSchema: ConfigField[];
  detection: DetectionCheck[];
  nginxTemplate?: string;
  healthCheckUrl?: string;
  healthCheckCommand?: string;
  version: string;
  homepage?: string;
  documentationUrl?: string;
}

export type StepStatusValue = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface StepStatus {
  step: ProvisionStep;
  label: string;
  status: StepStatusValue;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'rolling-back';

export interface InstallJob {
  id: string;
  templateId: string;
  templateName: string;
  methodId: string;
  config: Record<string, string | number | boolean>;
  status: JobStatus;
  steps: StepStatus[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon?: string;
  tags: string[];
  installMethods: Array<{
    id: string;
    label: string;
    executionMethod: ExecutionMethod;
    recommended?: boolean;
  }>;
  version: string;
}

export interface InstallRequest {
  templateId: string;
  methodId: string;
  config: Record<string, string | number | boolean>;
}
