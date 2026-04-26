import { z } from 'zod';
import {
  MAX_PROMPT_ATTACHMENT_BYTES,
  MAX_PROMPT_ATTACHMENTS,
  MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES,
} from './attachments';
import { MAX_CONCURRENT_RUNS_CAP } from './shared';

const agentTypeSchema = z.enum([
  'claude-code',
  'codex',
  'opencode',
  'aider',
  'gemini-cli',
  'custom',
]);

const promptTypeSchema = z.enum(['inline', 'file-reference']);
const autoflowModeSchema = z.enum(['sequential', 'parallel']);
const portableResourceSchema = z.enum([
  'settings',
  'profiles',
  'workspaces',
  'prompts',
  'promptTemplates',
  'schedules',
]);

const base64DataSchema = z
  .string()
  .min(1)
  .refine((value) => Buffer.from(value, 'base64').toString('base64') === value, {
    message: 'Attachment data must be base64 encoded',
  });

const promptAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  size: z.number().int().min(0).max(MAX_PROMPT_ATTACHMENT_BYTES),
  data: base64DataSchema,
});

const promptAttachmentRefSchema = z.object({
  name: z.string().trim().min(1).max(255),
  path: z.string().trim().min(1).max(2000),
  contentType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  size: z.number().int().min(0).max(MAX_PROMPT_ATTACHMENT_BYTES),
});

function validateAttachmentTotal(
  attachments: Array<{ size: number }> | undefined,
  ctx: z.RefinementCtx
) {
  const total = attachments?.reduce((sum, attachment) => sum + attachment.size, 0) ?? 0;
  if (total > MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['attachments'],
      message: 'Prompt attachments cannot exceed 10 MB total',
    });
  }
}

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1).max(2000),
  blocking: z.boolean().default(true),
  enabled: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
});

export const workspaceUpdateSchema = workspaceCreateSchema.partial();

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  agentType: agentTypeSchema,
  invocationTemplate: z.string().trim().min(1).max(10_000),
  defaultTimeout: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  maxTimeout: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  shell: z.string().trim().min(1).max(260).default('/bin/bash'),
  requiresTTY: z.boolean().default(false),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  icon: z.string().trim().max(300_000).optional(),
});

export const profileUpdateSchema = profileCreateSchema.partial();

export const profileValidateSchema = z.object({
  invocationTemplate: z.string().trim().min(1).max(10_000),
  shell: z.string().trim().min(1).max(260).default('/bin/bash'),
});

const promptBaseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  content: z.string().min(1).max(100_000),
  type: promptTypeSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  attachments: z.array(promptAttachmentSchema).max(MAX_PROMPT_ATTACHMENTS).default([]),
});

export const promptCreateSchema = promptBaseSchema.superRefine((value, ctx) =>
  validateAttachmentTotal(value.attachments, ctx)
);

export const promptUpdateSchema = promptBaseSchema
  .partial()
  .superRefine((value, ctx) => validateAttachmentTotal(value.attachments, ctx));

export const promptTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  content: z.string().min(1).max(100_000),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const promptTemplateUpdateSchema = promptTemplateCreateSchema.partial();

export const scheduleCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  promptId: z.string().trim().min(1),
  agentProfileId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1).optional(),
  workingDirectory: z.string().trim().min(1).max(2000),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  retries: z.number().int().min(0).max(9).default(1),
  cronExpression: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
});

export const scheduleUpdateSchema = scheduleCreateSchema.partial();

export const settingsUpdateSchema = z.object({
  schedulesGloballyEnabled: z.boolean().optional(),
  autoflowMode: autoflowModeSchema.optional(),
  artifactBaseDir: z.string().trim().min(1).max(2000).optional(),
  maxConcurrentRuns: z.number().int().min(1).max(MAX_CONCURRENT_RUNS_CAP).optional(),
  mongoRetentionDays: z.number().int().min(1).max(3650).optional(),
  artifactRetentionDays: z.number().int().min(1).max(3650).optional(),
});

const autoflowItemCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    promptId: z.string().trim().min(1).optional(),
    promptContent: z.string().max(100_000).optional(),
    promptType: promptTypeSchema.default('inline'),
    attachments: z.array(promptAttachmentRefSchema).max(MAX_PROMPT_ATTACHMENTS).default([]),
    agentProfileId: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1).optional(),
    workingDirectory: z.string().trim().min(1).max(2000),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  })
  .superRefine((value, ctx) => {
    if (!value.promptId && !value.promptContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['promptContent'],
        message: 'Prompt content is required when promptId is not provided',
      });
    }
    validateAttachmentTotal(value.attachments, ctx);
  });

export const autoflowCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  mode: autoflowModeSchema.optional(),
  continueOnFailure: z.boolean().default(false),
  items: z.array(autoflowItemCreateSchema).min(1).max(100),
  startImmediately: z.boolean().default(true),
});

export const autoflowUpdateSchema = autoflowCreateSchema.omit({ startImmediately: true }).partial();

export const runExecuteSchema = z
  .object({
    promptId: z.string().trim().min(1).optional(),
    name: z.string().trim().max(160).optional(),
    content: z.string().max(100_000).optional(),
    type: promptTypeSchema.optional(),
    attachments: z.array(promptAttachmentRefSchema).max(MAX_PROMPT_ATTACHMENTS).default([]),
    agentProfileId: z.string().trim().min(1).optional(),
    workspaceId: z.string().trim().min(1).optional(),
    workingDirectory: z.string().trim().max(2000).optional(),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .optional(),
    scheduleId: z.string().trim().min(1).optional(),
    autoflowId: z.string().trim().min(1).optional(),
    autoflowItemId: z.string().trim().min(1).optional(),
    triggeredBy: z.enum(['manual', 'schedule', 'autoflow']).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.promptId) {
      if (!value.content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['content'],
          message: 'Content is required when promptId is not provided',
        });
      }
      if (!value.type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['type'],
          message: 'Type is required when promptId is not provided',
        });
      }
    }
    if (!value.scheduleId && !value.agentProfileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agentProfileId'],
        message: 'Agent profile is required when scheduleId is not provided',
      });
    }
    if (!value.scheduleId && !value.workingDirectory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workingDirectory'],
        message: 'Working directory is required when scheduleId is not provided',
      });
    }
    validateAttachmentTotal(value.attachments, ctx);
  });

export const exportBundleQuerySchema = z.object({
  resources: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return portableResourceSchema.options;
      }
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    })
    .pipe(z.array(portableResourceSchema).min(1)),
});

const portableProfileSchema = profileCreateSchema.omit({ slug: true }).extend({
  slug: z.string().trim().min(1).max(120),
});

const portableWorkspaceSchema = workspaceCreateSchema;
const portablePromptSchema = promptCreateSchema;
const portablePromptTemplateSchema = promptTemplateCreateSchema;
const portableScheduleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  promptName: z.string().trim().min(1).max(160),
  agentProfileSlug: z.string().trim().min(1).max(120),
  workspacePath: z.string().trim().min(1).max(2000).optional(),
  workingDirectory: z.string().trim().min(1).max(2000),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  retries: z.number().int().min(0).max(9).default(1),
  cronExpression: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
});

export const importBundleSchema = z.object({
  bundle: z.object({
    kind: z.literal('servermon.ai-runner.bundle'),
    version: z.literal(1),
    exportedAt: z.string().trim().min(1),
    resources: z.object({
      settings: z
        .object({
          schedulesGloballyEnabled: z.boolean(),
          autoflowMode: autoflowModeSchema,
          maxConcurrentRuns: z.number().int().min(1).max(MAX_CONCURRENT_RUNS_CAP).optional(),
        })
        .optional(),
      profiles: z.array(portableProfileSchema).optional(),
      workspaces: z.array(portableWorkspaceSchema).optional(),
      prompts: z.array(portablePromptSchema).optional(),
      promptTemplates: z.array(portablePromptTemplateSchema).optional(),
      schedules: z.array(portableScheduleSchema).optional(),
    }),
  }),
  selectedResources: z.array(portableResourceSchema).min(1),
  decisions: z
    .array(
      z.object({
        resource: portableResourceSchema,
        key: z.string().trim().min(1),
        overwrite: z.boolean(),
      })
    )
    .default([]),
});
