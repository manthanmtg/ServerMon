import { NextResponse } from 'next/server';

export const FLEET_ROLES = ['viewer', 'operator', 'admin'] as const;
export type FleetRole = (typeof FLEET_ROLES)[number];

export const FLEET_CAPABILITIES = [
  'can_view_fleet',
  'can_terminal',
  'can_mutate_node_config',
  'can_toggle_server',
  'can_mutate_routes',
  'can_rotate_tokens',
  'can_emergency',
  'can_dispatch_endpoint',
  'can_apply_revision',
  'can_rollback_revision',
  'can_restore_backup',
  'can_manage_alerts',
  'can_manage_policies',
] as const;
export type FleetCapability = (typeof FLEET_CAPABILITIES)[number];

export interface FleetSessionUser {
  id?: string;
  username: string;
  role: string;
}

// Capability matrix keyed by role.
const CAPABILITY_MATRIX: Record<FleetRole, ReadonlySet<FleetCapability>> = {
  viewer: new Set<FleetCapability>(['can_view_fleet']),
  operator: new Set<FleetCapability>([
    'can_view_fleet',
    'can_terminal',
    'can_mutate_node_config',
    'can_mutate_routes',
    'can_apply_revision',
    'can_dispatch_endpoint',
  ]),
  admin: new Set<FleetCapability>([...FLEET_CAPABILITIES]),
};

// Map raw role strings from User.role to FleetRole.
// 'admin' -> admin; 'operator' -> operator; everything else -> viewer.
export function mapRole(raw: string | undefined | null): FleetRole {
  if (raw === 'admin') return 'admin';
  if (raw === 'operator') return 'operator';
  return 'viewer';
}

export function hasCapability(role: FleetRole, cap: FleetCapability): boolean {
  return CAPABILITY_MATRIX[role].has(cap);
}

export class RbacError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'RbacError';
    this.statusCode = statusCode;
  }
}

// Throws RbacError(401) if user is null/undefined.
// Throws RbacError(403) if the user's role lacks the capability.
export function requireCapability(
  user: FleetSessionUser | null | undefined,
  cap: FleetCapability
): void {
  if (!user) {
    throw new RbacError('Unauthorized', 401);
  }
  const role = mapRole(user.role);
  if (!hasCapability(role, cap)) {
    throw new RbacError('Forbidden', 403);
  }
}

// Helper for Next.js route handlers: returns a NextResponse when not authorized,
// or null when the caller may proceed.
export function enforceRbac(
  user: FleetSessionUser | null | undefined,
  cap: FleetCapability
): NextResponse | null {
  try {
    requireCapability(user, cap);
    return null;
  } catch (e) {
    if (e instanceof RbacError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }
}
