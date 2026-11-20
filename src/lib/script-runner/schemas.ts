import { z } from 'zod';
import {
  DEFAULT_TIMEOUT_SECONDS,
  ENV_NAME_PATTERN,
  MAX_ENV_NAME_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  MAX_ENV_VARS,
  MAX_SCRIPT_FOLDER_LENGTH,
  SCRIPT_LANGUAGES,
} from '@/modules/script-runner/types';

export const runIdInput = z.uuid().transform((id) => id.toLowerCase());
export const directoryInput = z
  .string()
  .min(1)
  .max(4096)
  .startsWith('/', 'Choose an absolute directory on this server')
  .regex(/^[^\0]+$/, 'Invalid directory');
const variableKeyInput = z
  .string()
  .max(MAX_ENV_NAME_LENGTH)
  .regex(ENV_NAME_PATTERN, 'Use a valid environment variable name, such as APP_MODE');
export const variableValueInput = z
  .string()
  .max(MAX_ENV_VALUE_LENGTH)
  .regex(/^[^\0]*$/, 'Environment values cannot contain NUL characters');
const variableFields = { key: variableKeyInput, value: variableValueInput, secret: z.boolean() };
export const variableInput = z.object(variableFields);
export const variablePatchInput = z.object({
  ...variableFields,
  value: variableValueInput.optional(),
});

export const environmentInput = z
  .array(z.object({ key: variableKeyInput, value: variableValueInput }))
  .max(MAX_ENV_VARS)
  .refine(
    (entries) => new Set(entries.map(({ key }) => key)).size === entries.length,
    'Environment variable names must be unique'
  )
  .refine(
    (entries) =>
      Buffer.byteLength(entries.map(({ key, value }) => `${key}=${value}\0`).join('')) <=
      128 * 1024,
    'The combined environment exceeds 128 KiB'
  );

const folderInput = z.string().trim().max(MAX_SCRIPT_FOLDER_LENGTH);
const timeoutInput = z.number().int().min(1).max(86_400);
const envVarIdsInput = z
  .array(runIdInput)
  .max(MAX_ENV_VARS)
  .refine((ids) => new Set(ids).size === ids.length, 'Link each variable only once');

export const scriptFolderPatchInput = z.object({ folder: folderInput }).strict();
export const scriptInput = z.object({
  language: z.enum(SCRIPT_LANGUAGES).default('bash'),
  folder: folderInput.optional(),
  envVarIds: envVarIdsInput.optional(),
  env: environmentInput.default([]),
  title: z.string().trim().min(1, 'Give your script a name').max(80),
  source: z
    .string()
    .max(65_536)
    .refine((value) => value.trim() !== '' && !value.includes('\0'), 'Enter a script')
    .transform((value) => value.replace(/\r\n/g, '\n')),
  cwd: directoryInput,
  args: z
    .array(
      z
        .string()
        .max(2048)
        .regex(/^[^\0]*$/, 'Invalid argument')
    )
    .max(20)
    .default([]),
  timeoutSeconds: timeoutInput.default(DEFAULT_TIMEOUT_SECONDS),
});
export const scriptPatchInput = scriptInput.extend({
  language: z.enum(SCRIPT_LANGUAGES).optional(),
  env: environmentInput.optional(),
});
export const launchInput = scriptPatchInput.extend({
  id: runIdInput.optional(),
  scriptId: runIdInput.optional(),
  rerunOf: runIdInput.optional(),
  cwd: directoryInput.optional(),
  timeoutSeconds: timeoutInput.optional(),
});
export const retentionInput = z.object({ logRetentionDays: z.number().int().min(1).max(365) });
export const defaultsPatchInput = retentionInput
  .extend({
    defaultWorkingDirectory: directoryInput,
    defaultTimeoutSeconds: timeoutInput,
    maxConcurrentRuns: z.number().int().min(1).max(8),
  })
  .partial()
  .refine((settings) => Object.keys(settings).length > 0, 'Enter a setting to update');
