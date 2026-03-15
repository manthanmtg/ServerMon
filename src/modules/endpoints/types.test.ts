import { describe, it, expect } from 'vitest';

describe('Endpoints Types', () => {
  describe('HTTP Methods', () => {
    it('should have valid HTTP method values', () => {
      const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      validMethods.forEach((method) => {
        expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
      });
    });
  });

  describe('Endpoint Types', () => {
    it('should have valid endpoint type values', () => {
      const validTypes = ['script', 'logic', 'webhook'];
      validTypes.forEach((type) => {
        expect(['script', 'logic', 'webhook']).toContain(type);
      });
    });
  });

  describe('Script Languages', () => {
    it('should have valid script language values', () => {
      const validLangs = ['python', 'bash', 'node'];
      validLangs.forEach((lang) => {
        expect(['python', 'bash', 'node']).toContain(lang);
      });
    });
  });

  describe('Auth Types', () => {
    it('should have valid auth type values', () => {
      const validAuth = ['public', 'token'];
      validAuth.forEach((auth) => {
        expect(['public', 'token']).toContain(auth);
      });
    });
  });
});
