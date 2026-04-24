/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import {
  FLEET_CAPABILITIES,
  RbacError,
  enforceRbac,
  hasCapability,
  mapRole,
  requireCapability,
  type FleetCapability,
  type FleetSessionUser,
} from './rbac';

describe('mapRole', () => {
  it('maps "admin" to admin', () => {
    expect(mapRole('admin')).toBe('admin');
  });

  it('maps "operator" to operator', () => {
    expect(mapRole('operator')).toBe('operator');
  });

  it('maps "user" to viewer', () => {
    expect(mapRole('user')).toBe('viewer');
  });

  it('maps empty string to viewer', () => {
    expect(mapRole('')).toBe('viewer');
  });

  it('maps undefined to viewer', () => {
    expect(mapRole(undefined)).toBe('viewer');
  });

  it('maps null to viewer', () => {
    expect(mapRole(null)).toBe('viewer');
  });

  it('maps unknown strings to viewer', () => {
    expect(mapRole('superuser')).toBe('viewer');
    expect(mapRole('ADMIN')).toBe('viewer'); // case-sensitive
  });
});

describe('hasCapability', () => {
  it('viewer has only can_view_fleet', () => {
    expect(hasCapability('viewer', 'can_view_fleet')).toBe(true);
    expect(hasCapability('viewer', 'can_terminal')).toBe(false);
    expect(hasCapability('viewer', 'can_mutate_node_config')).toBe(false);
    expect(hasCapability('viewer', 'can_toggle_server')).toBe(false);
    expect(hasCapability('viewer', 'can_mutate_routes')).toBe(false);
    expect(hasCapability('viewer', 'can_rotate_tokens')).toBe(false);
    expect(hasCapability('viewer', 'can_emergency')).toBe(false);
    expect(hasCapability('viewer', 'can_dispatch_endpoint')).toBe(false);
    expect(hasCapability('viewer', 'can_apply_revision')).toBe(false);
    expect(hasCapability('viewer', 'can_rollback_revision')).toBe(false);
    expect(hasCapability('viewer', 'can_restore_backup')).toBe(false);
    expect(hasCapability('viewer', 'can_manage_alerts')).toBe(false);
    expect(hasCapability('viewer', 'can_manage_policies')).toBe(false);
  });

  it('operator has viewer capabilities plus terminal/config/routes/apply/dispatch', () => {
    expect(hasCapability('operator', 'can_view_fleet')).toBe(true);
    expect(hasCapability('operator', 'can_terminal')).toBe(true);
    expect(hasCapability('operator', 'can_mutate_node_config')).toBe(true);
    expect(hasCapability('operator', 'can_mutate_routes')).toBe(true);
    expect(hasCapability('operator', 'can_apply_revision')).toBe(true);
    expect(hasCapability('operator', 'can_dispatch_endpoint')).toBe(true);
  });

  it('operator does NOT have admin-only capabilities', () => {
    expect(hasCapability('operator', 'can_toggle_server')).toBe(false);
    expect(hasCapability('operator', 'can_rotate_tokens')).toBe(false);
    expect(hasCapability('operator', 'can_emergency')).toBe(false);
    expect(hasCapability('operator', 'can_rollback_revision')).toBe(false);
    expect(hasCapability('operator', 'can_restore_backup')).toBe(false);
    expect(hasCapability('operator', 'can_manage_alerts')).toBe(false);
    expect(hasCapability('operator', 'can_manage_policies')).toBe(false);
  });

  it('admin has every capability', () => {
    for (const cap of FLEET_CAPABILITIES) {
      expect(hasCapability('admin', cap)).toBe(true);
    }
  });
});

describe('requireCapability', () => {
  it('throws RbacError(401) when user is null', () => {
    try {
      requireCapability(null, 'can_view_fleet');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(401);
      expect((e as RbacError).message).toBe('Unauthorized');
    }
  });

  it('throws RbacError(401) when user is undefined', () => {
    try {
      requireCapability(undefined, 'can_view_fleet');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(401);
    }
  });

  it('throws RbacError(403) when viewer asks for can_emergency', () => {
    const user: FleetSessionUser = { username: 'v', role: 'user' };
    try {
      requireCapability(user, 'can_emergency');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(403);
      expect((e as RbacError).message).toBe('Forbidden');
    }
  });

  it('throws RbacError(403) when operator asks for admin-only capability', () => {
    const user: FleetSessionUser = { username: 'o', role: 'operator' };
    try {
      requireCapability(user, 'can_toggle_server');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RbacError);
      expect((e as RbacError).statusCode).toBe(403);
    }
  });

  it('does not throw when user has the capability', () => {
    const admin: FleetSessionUser = { username: 'a', role: 'admin' };
    expect(() => requireCapability(admin, 'can_emergency')).not.toThrow();
    const operator: FleetSessionUser = { username: 'o', role: 'operator' };
    expect(() => requireCapability(operator, 'can_terminal')).not.toThrow();
  });
});

describe('enforceRbac', () => {
  it('returns a 401 NextResponse when user is null', async () => {
    const res = enforceRbac(null, 'can_view_fleet');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(401);
    const body = await res?.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns a 403 NextResponse when user lacks capability', async () => {
    const user: FleetSessionUser = { username: 'v', role: 'user' };
    const res = enforceRbac(user, 'can_emergency');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns null when user is authorized', () => {
    const admin: FleetSessionUser = { username: 'a', role: 'admin' };
    expect(enforceRbac(admin, 'can_emergency')).toBeNull();
    const operator: FleetSessionUser = { username: 'o', role: 'operator' };
    expect(enforceRbac(operator, 'can_terminal')).toBeNull();
  });

  it('returns null for every admin capability pair', () => {
    const admin: FleetSessionUser = { username: 'a', role: 'admin' };
    for (const cap of FLEET_CAPABILITIES as readonly FleetCapability[]) {
      expect(enforceRbac(admin, cap)).toBeNull();
    }
  });
});
