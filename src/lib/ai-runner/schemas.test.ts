/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  exportBundleQuerySchema,
  importBundleSchema,
  profileCreateSchema,
  profileUpdateSchema,
  profileValidateSchema,
  promptCreateSchema,
  scheduleCreateSchema,
  runExecuteSchema,
} from './schemas';

describe('ai-runner schemas', () => {
  describe('profileCreateSchema', () => {
    const validProfile = {
      name: 'Test Profile',
      slug: 'test-profile',
      agentType: 'claude-code',
      invocationTemplate: 'node index.js $PROMPT',
      defaultTimeout: 10,
      maxTimeout: 20,
    };

    it('validates a correct profile', () => {
      const result = profileCreateSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.shell).toBe('/bin/bash');
        expect(result.data.requiresTTY).toBe(false);
        expect(result.data.env).toEqual({});
        expect(result.data.enabled).toBe(true);
      }
    });

    it('requires mandatory fields', () => {
      const result = profileCreateSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('name');
        expect(paths).toContain('slug');
        expect(paths).toContain('agentType');
        expect(paths).toContain('invocationTemplate');
        expect(paths).toContain('defaultTimeout');
        expect(paths).toContain('maxTimeout');
      }
    });

    it('validates agentType enum', () => {
      const result = profileCreateSchema.safeParse({
        ...validProfile,
        agentType: 'invalid-agent',
      });
      expect(result.success).toBe(false);
    });

    it('validates timeout ranges', () => {
      const result = profileCreateSchema.safeParse({
        ...validProfile,
        defaultTimeout: 0,
        maxTimeout: 1441,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some((i) => i.path[0] === 'defaultTimeout')).toBe(true);
        expect(issues.some((i) => i.path[0] === 'maxTimeout')).toBe(true);
      }
    });
  });

  describe('profileUpdateSchema', () => {
    it('allows partial updates', () => {
      const result = profileUpdateSchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
        expect(result.data.agentType).toBeUndefined();
      }
    });
  });

  describe('profileValidateSchema', () => {
    it('validates correctly', () => {
      const result = profileValidateSchema.safeParse({
        invocationTemplate: 'echo $PROMPT',
        shell: '/bin/zsh',
      });
      expect(result.success).toBe(true);
    });

    it('requires invocationTemplate', () => {
      const result = profileValidateSchema.safeParse({ shell: '/bin/bash' });
      expect(result.success).toBe(false);
    });
  });

  describe('promptCreateSchema', () => {
    it('validates a correct prompt', () => {
      const result = promptCreateSchema.safeParse({
        name: 'My Prompt',
        content: 'Translate this to French: $PROMPT',
        type: 'inline',
        tags: ['translate', 'french'],
      });
      expect(result.success).toBe(true);
    });

    it('enforces tag limits', () => {
      const manyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const result = promptCreateSchema.safeParse({
        name: 'Too many tags',
        content: 'content',
        type: 'inline',
        tags: manyTags,
      });
      expect(result.success).toBe(false);
    });

    it('validates saved prompt attachments with base64 data', () => {
      const result = promptCreateSchema.safeParse({
        name: 'Prompt with evidence',
        content: 'Review the attached screenshot',
        type: 'inline',
        tags: [],
        attachments: [
          {
            name: 'screenshot.png',
            contentType: 'image/png',
            size: 4,
            data: Buffer.from('test').toString('base64'),
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attachments).toHaveLength(1);
        expect(result.data.attachments?.[0].name).toBe('screenshot.png');
      }
    });
  });

  describe('scheduleCreateSchema', () => {
    it('validates a correct schedule', () => {
      const result = scheduleCreateSchema.safeParse({
        name: 'Daily Test',
        promptId: 'prompt-1',
        agentProfileId: 'profile-1',
        workingDirectory: '/tmp',
        timeout: 60,
        cronExpression: '0 0 * * *',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('runExecuteSchema', () => {
    const validBase = {
      promptId: 'p1',
      agentProfileId: 'a1',
      workingDirectory: '/app',
      triggeredBy: 'manual',
    };

    it('validates a correct manual run with promptId', () => {
      const result = runExecuteSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('validates a run with inline content', () => {
      const result = runExecuteSchema.safeParse({
        agentProfileId: 'a1',
        workingDirectory: '/app',
        content: 'Some prompt',
        type: 'inline',
      });
      expect(result.success).toBe(true);
    });

    it('validates ad-hoc run attachment paths', () => {
      const result = runExecuteSchema.safeParse({
        agentProfileId: 'a1',
        workingDirectory: '/app',
        content: 'Some prompt',
        type: 'inline',
        attachments: [
          {
            name: 'notes.txt',
            path: '/tmp/servermon-ai-runner-attachments/notes.txt',
            contentType: 'text/plain',
            size: 12,
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attachments?.[0].path).toContain('/tmp/');
      }
    });

    it('requires content and type if promptId is missing', () => {
      const result = runExecuteSchema.safeParse({
        agentProfileId: 'a1',
        workingDirectory: '/app',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('content');
        expect(paths).toContain('type');
      }
    });

    it('requires agentProfileId and workingDirectory if scheduleId is missing', () => {
      const result = runExecuteSchema.safeParse({
        promptId: 'p1',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('agentProfileId');
        expect(paths).toContain('workingDirectory');
      }
    });

    it('allows missing profile/dir if scheduleId is provided', () => {
      const result = runExecuteSchema.safeParse({
        promptId: 'p1',
        scheduleId: 's1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('bundle schemas', () => {
    it('parses export resource query strings', () => {
      const result = exportBundleQuerySchema.safeParse({
        resources: 'profiles,workspaces,prompts',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resources).toEqual(['profiles', 'workspaces', 'prompts']);
      }
    });

    it('validates import bundles with selected resources and decisions', () => {
      const result = importBundleSchema.safeParse({
        bundle: {
          kind: 'servermon.ai-runner.bundle',
          version: 1,
          exportedAt: '2026-04-26T00:00:00.000Z',
          resources: {
            profiles: [
              {
                name: 'Codex',
                slug: 'codex',
                agentType: 'codex',
                invocationTemplate: 'codex "$PROMPT"',
                defaultTimeout: 30,
                maxTimeout: 120,
                shell: '/bin/bash',
                requiresTTY: false,
                env: {},
                enabled: true,
              },
            ],
          },
        },
        selectedResources: ['profiles'],
        decisions: [{ resource: 'profiles', key: 'codex', overwrite: true }],
      });
      expect(result.success).toBe(true);
    });

    it('validates exported prompt attachments', () => {
      const result = importBundleSchema.safeParse({
        bundle: {
          kind: 'servermon.ai-runner.bundle',
          version: 1,
          exportedAt: '2026-04-26T00:00:00.000Z',
          resources: {
            prompts: [
              {
                name: 'Screenshot review',
                content: 'Review attached screenshot',
                type: 'inline',
                tags: ['review'],
                attachments: [
                  {
                    name: 'screen.png',
                    contentType: 'image/png',
                    size: 4,
                    data: Buffer.from('test').toString('base64'),
                  },
                ],
              },
            ],
          },
        },
        selectedResources: ['prompts'],
        decisions: [],
      });

      expect(result.success).toBe(true);
    });
  });
});
