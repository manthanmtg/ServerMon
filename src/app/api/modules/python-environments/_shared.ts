import { z } from 'zod';
import { interpreterIdPattern } from '@/lib/python-environments/host';
import { RequestError } from '../script-runner/_shared';
export { authorized, body, data, type ById } from '../script-runner/_shared';

export const environmentId = z.uuid().transform((id) => id.toLowerCase());
const requirements = z.string().max(32_768);
export const createInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[^\u0000-\u001f\u007f]+$/),
  interpreterId: z.string().regex(interpreterIdPattern),
  requirements: requirements.default(''),
});
export const buildInput = z.strictObject({ requirements });
export const interpreterInstallInput = z.strictObject({
  version: z
    .string()
    .trim()
    .regex(
      /^3\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/,
      'Enter an exact CPython version, such as 3.12.16.'
    ),
});
export const restoreInput = z.strictObject({ revisionId: environmentId });

export function validateId(id: string) {
  const parsed = environmentId.safeParse(id);
  if (!parsed.success) throw new RequestError('Invalid Python environment ID.');
  return parsed.data;
}
