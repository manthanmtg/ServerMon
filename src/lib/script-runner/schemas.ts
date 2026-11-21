import { z } from 'zod';
import { calendarTimePattern, isNamedTimeZone } from './calendar';
import {
  DEFAULT_TIMEOUT_SECONDS,
  ENV_NAME_PATTERN,
  MAX_ENV_NAME_LENGTH,
  MAX_ENV_GROUP_NAME_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  MAX_ENV_VARS,
  MAX_SCRIPT_FOLDER_LENGTH,
  MAX_HISTORY_RETENTION_DAYS,
  MAX_HISTORY_RUNS,
  SCHEDULE_MAX_MINUTES,
  SCHEDULE_MINUTES_STEP,
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
const envGroupIdsInput = z
  .array(runIdInput)
  .max(MAX_ENV_VARS)
  .refine((ids) => new Set(ids).size === ids.length, 'Link each variable group only once');

export const envGroupInput = z.strictObject({
  name: z.string().trim().min(1, 'Give your variable group a name').max(MAX_ENV_GROUP_NAME_LENGTH),
  variableIds: envVarIdsInput.refine((ids) => ids.length > 0, 'Choose at least one saved variable'),
});

export const scriptFolderPatchInput = z.object({ folder: folderInput }).strict();
export const scriptInput = z.object({
  language: z.enum(SCRIPT_LANGUAGES).default('bash'),
  folder: folderInput.optional(),
  envVarIds: envVarIdsInput.optional(),
  envGroupIds: envGroupIdsInput.optional(),
  pythonEnvironmentId: runIdInput.nullable().optional(),
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
export const runRequestInput = z.union([
  launchInput,
  z.strictObject({ id: runIdInput.optional(), scriptId: runIdInput }),
]);
export const retentionInput = z.object({ logRetentionDays: z.number().int().min(1).max(365) });
const historyLimits = {
  historyRetentionDays: z.number().int().min(1).max(MAX_HISTORY_RETENTION_DAYS),
  maxHistoryRuns: z.number().int().min(1).max(MAX_HISTORY_RUNS),
};
export const scriptRetentionInput = z
  .strictObject({ ...retentionInput.shape, ...historyLimits })
  .partial();
const intervalScheduleInput = z.strictObject({
  intervalMinutes: z
    .number()
    .int()
    .min(SCHEDULE_MINUTES_STEP)
    .max(SCHEDULE_MAX_MINUTES)
    .multipleOf(SCHEDULE_MINUTES_STEP, 'Enter an interval in five-minute increments.'),
  enabled: z.boolean(),
});
export const scheduleInput = z.union([
  intervalScheduleInput,
  z.strictObject({
    enabled: z.boolean(),
    calendar: z.strictObject({
      frequency: z.enum(['daily', 'weekdays']),
      time: z.string().regex(calendarTimePattern, 'Enter a time in HH:MM format.'),
      timeZone: z.string().trim().max(100).refine(isNamedTimeZone, 'Choose a named timezone.'),
    }),
  }),
]);
export const defaultsPatchInput = retentionInput
  .extend({
    ...historyLimits,
    defaultWorkingDirectory: directoryInput,
    defaultTimeoutSeconds: timeoutInput,
    maxConcurrentRuns: z.number().int().min(1).max(8),
  })
  .partial()
  .refine((settings) => Object.keys(settings).length > 0, 'Enter a setting to update');
