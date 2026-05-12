import { describe, it, expect } from 'vitest';
import { isPublicRoute, isPublicApiRoute } from './auth-routes';

describe('auth-routes', () => {
  describe('isPublicRoute', () => {
    it('should return true for /login', () => {
      expect(isPublicRoute('/login')).toBe(true);
    });

    it('should return true for /setup', () => {
      expect(isPublicRoute('/setup')).toBe(true);
    });

    it('should return false for private routes like /dashboard', () => {
      expect(isPublicRoute('/dashboard')).toBe(false);
    });

    it('should return false for the root route /', () => {
      expect(isPublicRoute('/')).toBe(false);
    });

    it('should return false for routes that are prefixes but not exact matches', () => {
      expect(isPublicRoute('/login/extra')).toBe(false);
      expect(isPublicRoute('/setup/step1')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPublicRoute('')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isPublicRoute('/LOGIN')).toBe(false);
    });
  });

  describe('isPublicApiRoute', () => {
    it('should return true for exact matches of public API routes', () => {
      expect(isPublicApiRoute('/api/auth/login')).toBe(true);
      expect(isPublicApiRoute('/api/auth/logout')).toBe(true);
      expect(isPublicApiRoute('/api/auth/passkey')).toBe(true);
      expect(isPublicApiRoute('/api/auth/verify')).toBe(true);
      expect(isPublicApiRoute('/api/setup')).toBe(true);
      expect(isPublicApiRoute('/api/settings/branding')).toBe(true);
      expect(isPublicApiRoute('/api/endpoints')).toBe(true);
      expect(isPublicApiRoute('/api/health/ping')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/public')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes')).toBe(true);
    });

    it('should return true for sub-paths of public API routes', () => {
      expect(isPublicApiRoute('/api/auth/login/callback')).toBe(true);
      expect(isPublicApiRoute('/api/auth/passkey/register')).toBe(true);
      expect(isPublicApiRoute('/api/setup/admin')).toBe(true);
    });

    it('should return true for public fleet install and bridge sub-paths', () => {
      expect(isPublicApiRoute('/api/fleet/public/install-script')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/public/servermon-bridge')).toBe(true);
    });

    it('should return true for fleet node sub-paths used by remote agents', () => {
      expect(isPublicApiRoute('/api/fleet/nodes/node-1/heartbeat')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes/node-1/servermon/install')).toBe(true);
    });

    it('should return false for private API routes', () => {
      expect(isPublicApiRoute('/api/users')).toBe(false);
      expect(isPublicApiRoute('/api/settings/general')).toBe(false);
      expect(isPublicApiRoute('/api/stats')).toBe(false);
      expect(isPublicApiRoute('/api/health')).toBe(false);
    });

    it('should return false for routes that do not start with public prefixes', () => {
      expect(isPublicApiRoute('/auth/login')).toBe(false);
      expect(isPublicApiRoute('/public/api/auth/login')).toBe(false);
    });

    it('should return false for paths that only share a public prefix segment', () => {
      expect(isPublicApiRoute('/api/auth/loginx')).toBe(false);
      expect(isPublicApiRoute('/api/setup-wizard')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/public-routes')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/nodes-extra')).toBe(false);
    });

    it('should return false for similarly named fleet paths outside the public prefixes', () => {
      expect(isPublicApiRoute('/api/fleet/publicity')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/node')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/routes/public')).toBe(false);
    });

    it('should treat trailing slashes as sub-paths of public API routes', () => {
      expect(isPublicApiRoute('/api/fleet/public/')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes/')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isPublicApiRoute('')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isPublicApiRoute('/API/AUTH/LOGIN')).toBe(false);
    });
  });
});
