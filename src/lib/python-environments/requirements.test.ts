import { expect, it } from 'vitest';
import { normalizeRequirements } from './requirements';

it('accepts named packages and removes requirement comments', () => {
  expect(
    normalizeRequirements('# bot\r\nhttpx[http2]>=0.27,<1 # client\r\npython-telegram-bot==22.0')
  ).toBe('httpx[http2]>=0.27,<1\npython-telegram-bot==22.0');
});

it.each([
  '-r other.txt',
  '--extra-index-url https://example.com',
  './other',
  'name @ https://example.com/pkg',
  'name\\\n--no-index',
])('rejects requirements that select another source or pass pip options (%s)', (input) =>
  expect(() => normalizeRequirements(input)).toThrow('Requirement line')
);
