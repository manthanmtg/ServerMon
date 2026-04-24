import type { Model } from 'mongoose';
import type { LimitKey, Enforcement, EffectivePolicy } from './resourceGuards';
import { checkLimit, getEffectivePolicy } from './resourceGuards';

export interface ResourceGuardCheckInput {
  key: LimitKey;
  scope: 'global' | 'node' | 'tag' | 'role';
  scopeId?: string;
  currentCounter: () => Promise<number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResourcePolicy: Model<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FleetLogEvent?: Model<any>;
  actorUserId?: string;
}

export interface ResourceGuardCheckResult {
  allowed: boolean;
  enforcement: Enforcement;
  message: string;
  limit?: number;
  current: number;
  soft: boolean;
  policy: EffectivePolicy;
}

export async function enforceResourceGuard(
  input: ResourceGuardCheckInput
): Promise<ResourceGuardCheckResult> {
  const policy = await getEffectivePolicy({
    scope: input.scope,
    scopeId: input.scopeId,
    model: input.ResourcePolicy,
  });

  const current = await input.currentCounter();
  const checked = checkLimit({ key: input.key, current, policy });
  const enforcement: Enforcement = policy.enforcement[input.key] ?? 'hard';

  if (checked.passed) {
    return {
      allowed: true,
      enforcement,
      message: checked.message,
      limit: checked.limit,
      current,
      soft: checked.soft,
      policy,
    };
  }

  if (checked.soft) {
    if (input.FleetLogEvent) {
      try {
        await input.FleetLogEvent.create({
          service: 'servermon',
          level: 'warn',
          eventType: 'limit.soft_exceeded',
          message: checked.message,
          actorUserId: input.actorUserId,
          metadata: {
            key: input.key,
            scope: input.scope,
            scopeId: input.scopeId,
            limit: checked.limit,
            current,
          },
        });
      } catch {
        // Do not block the caller if the audit log fails.
      }
    }
    return {
      allowed: true,
      enforcement,
      message: checked.message,
      limit: checked.limit,
      current,
      soft: true,
      policy,
    };
  }

  return {
    allowed: false,
    enforcement,
    message: checked.message,
    limit: checked.limit,
    current,
    soft: false,
    policy,
  };
}
