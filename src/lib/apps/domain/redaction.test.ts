import { describe, expect, it } from 'vitest';
import { redactOperationDetails, redactOperationMessage } from './redaction';

describe('operation event redaction', () => {
  it('redacts secret-like keys in nested event details', () => {
    expect(
      redactOperationDetails({
        username: 'deploy',
        password: 'pw',
        nested: {
          apiToken: 'token',
          normal: 'value',
          privateKey: 'key',
        },
        values: [{ clientSecret: 'secret' }, 'safe'],
      })
    ).toEqual({
      username: 'deploy',
      password: '[redacted]',
      nested: {
        apiToken: '[redacted]',
        normal: 'value',
        privateKey: '[redacted]',
      },
      values: [{ clientSecret: '[redacted]' }, 'safe'],
    });
  });

  it('redacts env-style credentials from event messages', () => {
    expect(
      redactOperationMessage(
        'DATABASE_URL=mongodb://user:pass@example.test/db JWT_SECRET=abc123 NEXT_PUBLIC_URL=https://example.test'
      )
    ).toBe('DATABASE_URL=[redacted] JWT_SECRET=[redacted] NEXT_PUBLIC_URL=https://example.test');
  });
});
