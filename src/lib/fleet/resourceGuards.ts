import type { Model } from 'mongoose';

export type LimitKey =
  | 'maxAgents'
  | 'maxPublicRoutes'
  | 'maxProxiesPerNode'
  | 'maxActiveTerminals'
  | 'maxEndpointRuns'
  | 'logRetentionDays'
  | 'logStorageMb'
  | 'bandwidthWarnMbps'
  | 'uploadBodyMb'
  | 'requestTimeoutSec'
  | 'updateBatchSize';

export type Enforcement = 'soft' | 'hard';

export interface EffectivePolicy {
  limits: Partial<Record<LimitKey, number>>;
  enforcement: Partial<Record<LimitKey, Enforcement>>;
}

export interface CheckLimitInput {
  key: LimitKey;
  current: number;
  policy: EffectivePolicy;
}

export interface CheckLimitResult {
  key: LimitKey;
  passed: boolean;
  soft: boolean;
  limit?: number;
  current: number;
  message: string;
}

export function checkLimit(i: CheckLimitInput): CheckLimitResult {
  const limit = i.policy.limits[i.key];
  const enforcement = i.policy.enforcement[i.key] ?? 'hard';
  const soft = enforcement === 'soft';
  if (limit === undefined) {
    return {
      key: i.key,
      passed: true,
      soft,
      current: i.current,
      message: `${i.key}: no limit configured`,
    };
  }
  const passed = i.current <= limit;
  const message = passed
    ? `${i.key} within limit (${i.current} <= ${limit})`
    : `${i.key} exceeded: ${i.current} > ${limit} (${enforcement})`;
  return {
    key: i.key,
    passed,
    soft,
    limit,
    current: i.current,
    message,
  };
}

export interface GetEffectivePolicyInput {
  scope: 'global' | 'node' | 'tag' | 'role';
  scopeId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
}

interface PolicyDoc {
  scope: 'global' | 'node' | 'tag' | 'role';
  scopeId?: string;
  limits?: Partial<Record<LimitKey, number>>;
  enforcement?: Partial<Record<LimitKey, Enforcement>>;
}

function mergePolicy(base: EffectivePolicy, override: PolicyDoc): EffectivePolicy {
  return {
    limits: { ...base.limits, ...(override.limits ?? {}) },
    enforcement: { ...base.enforcement, ...(override.enforcement ?? {}) },
  };
}

export async function getEffectivePolicy(i: GetEffectivePolicyInput): Promise<EffectivePolicy> {
  const query = i.model.find({});
  const docs = (await query.lean()) as PolicyDoc[];

  let merged: EffectivePolicy = { limits: {}, enforcement: {} };

  // Global base first.
  for (const d of docs) {
    if (d.scope === 'global') {
      merged = mergePolicy(merged, d);
      break;
    }
  }

  if (i.scope === 'global') return merged;

  // Scope-specific overrides on top.
  for (const d of docs) {
    if (d.scope === i.scope && d.scopeId && d.scopeId === i.scopeId) {
      merged = mergePolicy(merged, d);
      break;
    }
  }

  return merged;
}
