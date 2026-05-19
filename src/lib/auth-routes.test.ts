import { describe, it, expect } from 'vitest';
import { isPublicRoute } from './auth-routes';

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
});
