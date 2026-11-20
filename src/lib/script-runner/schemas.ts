import { z } from 'zod';
import { DEFAULT_TIMEOUT_SECONDS } from '@/modules/script-runner/types';

export const runIdInput = z.uuid().transform((id) => id.toLowerCase());
export const directoryInput = z
  .string()
  .min(1)
  .max(4096)
  .startsWith('/', 'Choose an absolute directory on this server')
  .regex(/^[^\0]+$/, 'Invalid directory');
export const scriptInput = z.object({
  title: z.string().trim().min(1, 'Give your script a name').max(80),
  source: z
    .string()
    .max(65_536)
    .refine((value) => value.trim() !== '' && !value.includes('\0'), 'Enter a Bash script')
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
export const launchInput = scriptInput.extend({
  id: runIdInput.optional(),
  scriptId: runIdInput.optional(),
});
export const retentionInput = z.object({ logRetentionDays: z.number().int().min(1).max(365) });
