/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import User, { UserZodSchema } from './User';

describe('User validation contract', () => {
  it('applies schema defaults for minimal valid user payload', () => {
    const parsed = UserZodSchema.parse({
      username: 'agent',
      passwordHash: 'sha256digest',
    });

    expect(parsed.username).toBe('agent');
    expect(parsed.role).toBe('user');
    expect(parsed.totpEnabled).toBe(false);
    expect(parsed.passkeys).toEqual([]);
    expect(parsed.isActive).toBe(true);
    expect(parsed.passwordHash).toBe('sha256digest');
  });

  it('accepts an explicit custom role and explicit passkeys payload', () => {
    const parsed = UserZodSchema.parse({
      username: 'operator',
      passwordHash: 'sha256digest',
      role: 'admin',
      passkeys: [
        {
          credentialID: 'cred-1',
          publicKey: Buffer.from('abc'),
          counter: 7,
          transports: ['usb', 'nfc'],
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      ],
    });

    expect(parsed.role).toBe('admin');
    expect(parsed.passkeys).toHaveLength(1);
    expect(parsed.passkeys[0].credentialID).toBe('cred-1');
    expect(parsed.passkeys[0].counter).toBe(7);
    expect(parsed.passkeys[0].transports).toEqual(['usb', 'nfc']);
    expect(parsed.passkeys[0].createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('sets default createdAt for passkeys when omitted', () => {
    const parsed = UserZodSchema.parse({
      username: 'devops',
      passwordHash: 'sha256digest',
      passkeys: [
        {
          credentialID: 'cred-auto-time',
          publicKey: Buffer.from('abc'),
          counter: 1,
        },
      ],
    });

    expect(parsed.passkeys).toHaveLength(1);
    expect(parsed.passkeys[0].createdAt).toBeInstanceOf(Date);
  });

  it('rejects usernames that are too short or too long', () => {
    expect(() => UserZodSchema.parse({ username: 'ab', passwordHash: 'sha256digest' })).toThrow();
    expect(() =>
      UserZodSchema.parse({ username: 'a'.repeat(21), passwordHash: 'sha256digest' })
    ).toThrow();
  });

  it('rejects unsupported user roles', () => {
    expect(() =>
      UserZodSchema.parse({ username: 'admin01', passwordHash: 'sha256digest', role: 'superuser' })
    ).toThrow();
  });

  it('requires passkey entries to include credentialId and counter types', () => {
    expect(() =>
      UserZodSchema.parse({
        username: 'tester',
        passwordHash: 'sha256digest',
        passkeys: [
          {
            credentialID: 'cred-missing-counter',
            publicKey: Buffer.from('abc'),
          },
        ],
      })
    ).toThrow();

    expect(() =>
      UserZodSchema.parse({
        username: 'tester2',
        passwordHash: 'sha256digest',
        passkeys: [
          {
            credentialID: 'cred-invalid-key',
            publicKey: 'not-a-buffer',
            counter: 2,
          },
        ],
      })
    ).toThrow();
  });

  it('strips unknown fields from validated user payloads', () => {
    const parsed = UserZodSchema.parse({
      username: 'unknowns',
      passwordHash: 'sha256digest',
      role: 'user',
      extraTopLevelField: 'should be removed',
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty('extraTopLevelField');
  });

  it('matches key mongoose schema defaults for username constraints', () => {
    const usernamePath = User.schema.path('username');

    expect(usernamePath.options.required).toBe(true);
    expect(usernamePath.options.unique).toBe(true);
    expect(usernamePath.options.index).toBe(true);
  });
});
