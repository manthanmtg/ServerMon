import { describe, it, expect } from 'vitest';
import { parseRendered } from './toml-parse';

describe('toml-parse', () => {
  describe('parseRendered', () => {
    it('should parse simple top-level key-value pairs', () => {
      const toml = `
        name = "ServerMon"
        version = 1
        enabled = true
        pi = 3.14
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({
        name: 'ServerMon',
        version: 1,
        enabled: true,
        pi: 3.14,
      });
      expect(result.proxies).toHaveLength(0);
    });

    it('should parse proxies blocks', () => {
      const toml = `
        global_key = "global"
        [[proxies]]
        id = "proxy1"
        port = 8080
        [[proxies]]
        id = "proxy2"
        port = 9090
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({ global_key: 'global' });
      expect(result.proxies).toHaveLength(2);
      expect(result.proxies[0]).toEqual({ id: 'proxy1', port: 8080 });
      expect(result.proxies[1]).toEqual({ id: 'proxy2', port: 9090 });
    });

    it('should handle unquoted strings and types correctly', () => {
      const toml = `
        s1 = "quoted"
        s2 = unquoted
        b1 = true
        b2 = false
        n1 = 123
        n2 = -456
        f1 = 1.23
        f2 = -4.56
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({
        s1: 'quoted',
        s2: 'unquoted', // Current implementation returns raw trim for unknown
        b1: true,
        b2: false,
        n1: 123,
        n2: -456,
        f1: 1.23,
        f2: -4.56,
      });
    });

    it('should parse arrays of strings', () => {
      const toml = `
        tags = ["a", "b", "c"]
        empty = []
        with_escapes = ["quote \\"", "backslash \\\\"]
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({
        tags: ['a', 'b', 'c'],
        empty: [],
        with_escapes: ['quote "', 'backslash \\'],
      });
    });

    it('should handle complex array scenarios', () => {
      const toml = `
        mixed = ["a", "b,c", "d"]
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({
        mixed: ['a', 'b,c', 'd'],
      });
    });

    it('should skip comments and empty lines (if supported by implementation)', () => {
      // The current implementation skips empty lines but doesn't explicitly skip comments
      // Unless they fail eqIdx check
      const toml = `
        # This is a comment
        key = "value"

        [[proxies]]
        # proxy comment
        id = "p1"
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({ key: 'value' });
      expect(result.proxies[0]).toEqual({ id: 'p1' });
    });

    it('should handle escaped characters in strings', () => {
      const toml = `
        path = "C:\\\\Program Files\\\\App"
        desc = "He said \\"Hello\\""
      `;
      const result = parseRendered(toml);
      expect(result.top).toEqual({
        path: 'C:\\Program Files\\App',
        desc: 'He said "Hello"',
      });
    });
  });
});
