import { z } from 'zod';

const agentTypeSchema = z.enum([
  'claude-code',
  'codex',
  'opencode',
  'aider',
  'gemini-cli',
  'custom',
]);

const promptTypeSchema = z.enum(['inline', 'file-reference']);

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

export const promptCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  content: z.string().min(1).max(100_000),
  type: promptTypeSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const promptUpdateSchema = promptCreateSchema.partial();

export const scheduleCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  promptId: z.string().trim().min(1),
  agentProfileId: z.string().trim().min(1),
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

export const runExecuteSchema = z
  .object({
    promptId: z.string().trim().min(1).optional(),
    name: z.string().trim().max(160).optional(),
    content: z.string().max(100_000).optional(),
    type: promptTypeSchema.optional(),
    agentProfileId: z.string().trim().min(1).optional(),
    workingDirectory: z.string().trim().max(2000).optional(),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .optional(),
    scheduleId: z.string().trim().min(1).optional(),
    triggeredBy: z.enum(['manual', 'schedule']).optional(),
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
  });
