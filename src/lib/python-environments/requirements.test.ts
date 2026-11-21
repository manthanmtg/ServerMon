import { describe, expect, it } from 'vitest';
import { normalizeRequirements, PythonEnvironmentError } from './requirements';

describe('normalizeRequirements', () => {
  it('accepts named packages and removes requirement comments', () => {
    expect(
      normalizeRequirements('# bot\r\nhttpx[http2]>=0.27,<1 # client\r\npython-telegram-bot==22.0')
    ).toBe('httpx[http2]>=0.27,<1\npython-telegram-bot==22.0');
  });

  it('returns an empty string for empty or comment-only input', () => {
    expect(normalizeRequirements('')).toBe('');
    expect(normalizeRequirements('# only comments\n   \n\t\n')).toBe('');
  });

  it('trims surrounding whitespace and handles mixed line endings', () => {
    expect(normalizeRequirements('  requests  \r\n\tflask\r\n')).toBe('requests\nflask');
  });

  it('keeps multiple extras and version specifiers', () => {
    expect(normalizeRequirements('httpx[http2,http3]==0.27.0')).toBe('httpx[http2,http3]==0.27.0');
    expect(normalizeRequirements('a>=1,<2,~=3,!=4,<=5,>6')).toBe('a>=1,<2,~=3,!=4,<=5,>6');
  });

  it.each([
    '-r other.txt',
    '--extra-index-url https://example.com',
    './other',
    'name @ https://example.com/pkg',
    'name\\\n--no-index',
    'pkg extra tokens',
    'pkg==',
    '[extras]==1',
    'pkg!==1',
  ])(
    'rejects requirement line %j that selects another source, passes pip options, or is malformed',
    (input) => {
      try {
        normalizeRequirements(input);
        expect.unreachable('expected normalizeRequirements to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(PythonEnvironmentError);
        if (error instanceof PythonEnvironmentError) {
          expect(error.status).toBe(422);
          expect(error.message).toContain('Requirement line');
        }
      }
    }
  );

  it('rejects requirement lines longer than 256 characters', () => {
    const longName = `a${'b'.repeat(256)}`;
    expect(longName.length).toBe(257);
    expect(() => normalizeRequirements(longName)).toThrow('Requirement line 1');
  });

  it('accepts exactly 128 requirements', () => {
    const requirements = Array.from({ length: 128 }, (_, index) => `pkg${index}`);
    expect(normalizeRequirements(requirements.join('\n'))).toBe(requirements.join('\n'));
  });

  it('rejects more than 128 requirements', () => {
    const requirements = Array.from({ length: 129 }, (_, index) => `pkg${index}`);
    expect(() => normalizeRequirements(requirements.join('\n'))).toThrow(
      'Use up to 128 requirements.'
    );
  });

  it('raises PythonEnvironmentError as a typed error with an HTTP status', () => {
    const error = new PythonEnvironmentError('bad input', 422);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('bad input');
    expect(error.status).toBe(422);
  });
});
