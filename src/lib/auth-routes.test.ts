import { describe, it, expect } from 'vitest';
import { isPublicApiRoute, isPublicRoute } from './auth-routes';

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

    it('allows the root route to direct first-time visitors to setup', () => {
      expect(isPublicRoute('/')).toBe(true);
    });

    it('should return false for routes that are prefixes but not exact matches', () => {
      expect(isPublicRoute('/login/extra')).toBe(false);
      expect(isPublicRoute('/setup/step1')).toBe(false);
    });

    it('should return false for routes with query parameters (assuming raw URL is passed)', () => {
      expect(isPublicRoute('/login?redirect=/dashboard')).toBe(false);
      expect(isPublicRoute('/setup?token=123')).toBe(false);
    });

    it('should return false for routes with trailing slashes', () => {
      expect(isPublicRoute('/login/')).toBe(false);
      expect(isPublicRoute('/setup/')).toBe(false);
    });

    it('should return false for routes with hash fragments (assuming raw URL is passed)', () => {
      expect(isPublicRoute('/login#foo')).toBe(false);
      expect(isPublicRoute('/setup#bar')).toBe(false);
    });

    it('should return false for routes with multiple leading slashes', () => {
      expect(isPublicRoute('//login')).toBe(false);
      expect(isPublicRoute('///setup')).toBe(false);
    });

    it('should return false for completely different paths that contain public route names', () => {
      expect(isPublicRoute('/api/login')).toBe(false);
      expect(isPublicRoute('/dashboard/setup')).toBe(false);
      expect(isPublicRoute('/thelogin')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPublicRoute('')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isPublicRoute('/LOGIN')).toBe(false);
    });
  });

  describe('isPublicApiRoute', () => {
    it('allows only the unauthenticated browser bootstrap endpoints', () => {
      expect(isPublicApiRoute('/api/auth/login')).toBe(true);
      expect(isPublicApiRoute('/api/auth/passkey/login/options')).toBe(true);
      expect(isPublicApiRoute('/api/setup/init')).toBe(true);
      expect(isPublicApiRoute('/api/settings/branding')).toBe(true);
    });

    it('allows health checks and endpoints that authenticate with their own tokens', () => {
      expect(isPublicApiRoute('/api/health')).toBe(true);
      expect(isPublicApiRoute('/api/endpoints/uptime-check')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/install')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/public/install-script')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes/node-1')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes/node-1/pair')).toBe(true);
      expect(isPublicApiRoute('/api/fleet/nodes/node-1/heartbeat')).toBe(true);
    });

    it('keeps privileged APIs behind the session boundary', () => {
      expect(isPublicApiRoute('/api/auth/passkey/register/options')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/nodes')).toBe(false);
      expect(isPublicApiRoute('/api/fleet/nodes/node-1/rotate-token')).toBe(false);
      expect(isPublicApiRoute('/api/modules/self-service/install')).toBe(false);
      expect(isPublicApiRoute('/api/modules/endpoints')).toBe(false);
      expect(isPublicApiRoute('/api/endpoints/uptime-check/subpath')).toBe(false);
    });
  });
});
