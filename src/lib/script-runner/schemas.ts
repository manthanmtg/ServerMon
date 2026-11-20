import { z } from 'zod';
import {
  DEFAULT_TIMEOUT_SECONDS,
  ENV_NAME_PATTERN,
  MAX_ENV_NAME_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  MAX_ENV_VARS,
  SCRIPT_LANGUAGES,
} from '@/modules/script-runner/types';

export const runIdInput = z.uuid().transform((id) => id.toLowerCase());
export const directoryInput = z
  .string()
  .min(1)
  .max(4096)
  .startsWith('/', 'Choose an absolute directory on this server')
  .regex(/^[^\0]+$/, 'Invalid directory');
export const environmentInput = z
  .array(
    z.object({
      key: z
        .string()
        .max(MAX_ENV_NAME_LENGTH)
        .regex(ENV_NAME_PATTERN, 'Use a valid environment variable name, such as APP_MODE'),
      value: z
        .string()
        .max(MAX_ENV_VALUE_LENGTH)
        .regex(/^[^\0]*$/, 'Environment values cannot contain NUL characters'),
    })
  )
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

export const scriptInput = z.object({
  language: z.enum(SCRIPT_LANGUAGES).default('bash'),
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
  timeoutSeconds: z.number().int().min(1).max(86_400).default(DEFAULT_TIMEOUT_SECONDS),
});
export const scriptPatchInput = scriptInput.extend({
  language: z.enum(SCRIPT_LANGUAGES).optional(),
  env: environmentInput.optional(),
});
export const launchInput = scriptPatchInput.extend({
  id: runIdInput.optional(),
  scriptId: runIdInput.optional(),
});
export const retentionInput = z.object({ logRetentionDays: z.number().int().min(1).max(365) });
