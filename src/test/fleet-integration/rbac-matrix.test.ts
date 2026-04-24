/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  FLEET_CAPABILITIES,
  FLEET_ROLES,
  RbacError,
  enforceRbac,
  hasCapability,
  mapRole,
  requireCapability,
  type FleetCapability,
  type FleetRole,
  type FleetSessionUser,
} from '@/lib/fleet/rbac';

// Authoritative expected matrix. When this disagrees with rbac.ts the test
// fails, making the capability model explicit and reviewable.
const EXPECTED: Record<FleetRole, ReadonlySet<FleetCapability>> = {
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

describe('fleet RBAC capability matrix', () => {
  // Table-driven assertion across every (role, capability) pair.
  for (const role of FLEET_ROLES) {
    for (const cap of FLEET_CAPABILITIES) {
      const shouldHave = EXPECTED[role].has(cap);
      it(`${role} ${shouldHave ? 'has' : 'lacks'} ${cap}`, () => {
        expect(hasCapability(role, cap)).toBe(shouldHave);
      });
    }
  }

  it('mapRole produces the expected role string', () => {
    expect(mapRole('admin')).toBe('admin');
    expect(mapRole('operator')).toBe('operator');
    expect(mapRole('user')).toBe('viewer');
    expect(mapRole(undefined)).toBe('viewer');
    expect(mapRole(null)).toBe('viewer');
    expect(mapRole('superuser')).toBe('viewer');
  });

  it('requireCapability throws RbacError(401) for unauthenticated user', () => {
    try {
      requireCapability(null, 'can_view_fleet');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(401);
    }
  });

  it('requireCapability throws RbacError(403) for insufficient role', () => {
    const viewer: FleetSessionUser = { username: 'v', role: 'user' };
    try {
      requireCapability(viewer, 'can_emergency');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(403);
    }
  });

  it('enforceRbac returns null for authorized users', () => {
    const admin: FleetSessionUser = { username: 'a', role: 'admin' };
    const operator: FleetSessionUser = { username: 'o', role: 'operator' };
    expect(enforceRbac(admin, 'can_emergency')).toBeNull();
    expect(enforceRbac(operator, 'can_apply_revision')).toBeNull();
    expect(enforceRbac(operator, 'can_dispatch_endpoint')).toBeNull();
  });

  it('enforceRbac returns 403 NextResponse for forbidden requests', async () => {
    const operator: FleetSessionUser = { username: 'o', role: 'operator' };
    const res = enforceRbac(operator, 'can_rollback_revision');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toBe('Forbidden');
  });

  it('enforceRbac returns 401 NextResponse for null session', async () => {
    const res = enforceRbac(null, 'can_view_fleet');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
    const body = await res?.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('admin can do everything the operator can do, plus admin-only caps', () => {
    for (const cap of FLEET_CAPABILITIES) {
      // Every cap operator has, admin also has.
      if (EXPECTED.operator.has(cap)) {
        expect(EXPECTED.admin.has(cap)).toBe(true);
      }
    }
    // Admin-only caps (not in operator) must exist and include dangerous ops.
    const adminOnly = [...EXPECTED.admin].filter((c) => !EXPECTED.operator.has(c));
    expect(adminOnly).toContain('can_rollback_revision');
    expect(adminOnly).toContain('can_rotate_tokens');
    expect(adminOnly).toContain('can_emergency');
    expect(adminOnly).toContain('can_manage_alerts');
    expect(adminOnly).toContain('can_manage_policies');
    expect(adminOnly).toContain('can_restore_backup');
    expect(adminOnly).toContain('can_toggle_server');
  });
});
