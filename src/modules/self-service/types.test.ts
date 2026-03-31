import { describe, it, expect } from 'vitest';
import {
  FULL_SERVICE_PIPELINE,
  CLI_TOOL_PIPELINE,
  PROVISION_STEP_LABELS,
} from './types';
import type {
  InstallTemplate,
  InstallMethod,
  DetectionCheck,
  ConfigField,
  StepStatus,
  InstallJob,
  TemplateListItem,
  InstallRequest,
} from './types';

describe('Self Service Types', () => {
  describe('FULL_SERVICE_PIPELINE', () => {
    it('should contain all 9 provisioning steps in order', () => {
      expect(FULL_SERVICE_PIPELINE).toEqual([
        'preflight',
        'install',
        'port-bind',
        'firewall',
        'nginx-vhost',
        'ssl-cert',
        'nginx-reload',
        'systemd-unit',
        'health-check',
      ]);
    });

    it('should have labels for every step', () => {
      for (const step of FULL_SERVICE_PIPELINE) {
        expect(PROVISION_STEP_LABELS[step]).toBeDefined();
        expect(typeof PROVISION_STEP_LABELS[step]).toBe('string');
      }
    });
  });

  describe('CLI_TOOL_PIPELINE', () => {
    it('should contain only preflight and install', () => {
      expect(CLI_TOOL_PIPELINE).toEqual(['preflight', 'install']);
    });
  });

  describe('type contracts', () => {
    it('should allow creating a valid ConfigField', () => {
      const field: ConfigField = {
        key: 'port',
        label: 'Port',
        type: 'number',
        default: 8080,
        required: true,
        description: 'The port',
        validation: { min: 1024, max: 65535 },
      };
      expect(field.key).toBe('port');
      expect(field.default).toBe(8080);
    });

    it('should allow creating a valid InstallMethod', () => {
      const method: InstallMethod = {
        id: 'docker-compose',
        label: 'Docker Compose',
        executionMethod: 'docker-compose',
        recommended: true,
        composeTemplate: 'version: "3.8"\nservices:\n  app:\n    image: test',
      };
      expect(method.executionMethod).toBe('docker-compose');
      expect(method.recommended).toBe(true);
    });

    it('should allow script execution method', () => {
      const method: InstallMethod = {
        id: 'script',
        label: 'Install Script',
        executionMethod: 'script',
        installScript: '#!/bin/bash\necho hello',
      };
      expect(method.executionMethod).toBe('script');
      expect(method.installScript).toContain('#!/bin/bash');
    });

    it('should allow creating a valid DetectionCheck', () => {
      const checks: DetectionCheck[] = [
        { method: 'command', value: 'n8n --version', versionCommand: 'n8n --version' },
        { method: 'docker-container', value: 'n8n' },
        { method: 'systemd-service', value: 'n8n.service' },
        { method: 'file', value: '/usr/bin/n8n' },
        { method: 'port', value: '5678' },
      ];
      expect(checks).toHaveLength(5);
      expect(checks[0].method).toBe('command');
    });

    it('should allow creating a valid InstallTemplate with multiple methods', () => {
      const template: InstallTemplate = {
        id: 'test-app',
        name: 'Test App',
        description: 'A test application',
        category: 'service',
        tags: ['test'],
        installMethods: [
          { id: 'docker', label: 'Docker', executionMethod: 'docker-compose', recommended: true },
          { id: 'native', label: 'Native', executionMethod: 'shell' },
          { id: 'script', label: 'Script', executionMethod: 'script', installScript: '#!/bin/bash\necho test' },
        ],
        defaultPipeline: FULL_SERVICE_PIPELINE,
        configSchema: [],
        detection: [{ method: 'command', value: 'test-app --version' }],
        version: '1.0.0',
      };
      expect(template.installMethods).toHaveLength(3);
      expect(template.installMethods[0].recommended).toBe(true);
    });

    it('should allow creating a valid StepStatus', () => {
      const step: StepStatus = {
        step: 'install',
        label: 'Install Service',
        status: 'running',
        logs: ['Starting installation...'],
        startedAt: new Date().toISOString(),
      };
      expect(step.status).toBe('running');
    });

    it('should allow creating a valid InstallJob with methodId', () => {
      const job: InstallJob = {
        id: 'job-123',
        templateId: 'n8n',
        templateName: 'n8n',
        methodId: 'docker-compose',
        config: { port: 5678, domain: 'n8n.example.com' },
        status: 'running',
        steps: [],
        startedAt: new Date().toISOString(),
      };
      expect(job.methodId).toBe('docker-compose');
      expect(job.status).toBe('running');
    });

    it('should allow creating a valid TemplateListItem', () => {
      const item: TemplateListItem = {
        id: 'n8n',
        name: 'n8n',
        description: 'Workflow automation',
        category: 'service',
        tags: ['automation'],
        installMethods: [
          { id: 'docker', label: 'Docker', executionMethod: 'docker-compose', recommended: true },
        ],
        version: '1.0.0',
      };
      expect(item.installMethods[0].recommended).toBe(true);
    });

    it('should allow creating a valid InstallRequest', () => {
      const req: InstallRequest = {
        templateId: 'n8n',
        methodId: 'docker-compose',
        config: { port: 5678, domain: 'n8n.example.com' },
      };
      expect(req.methodId).toBe('docker-compose');
    });
  });
});
