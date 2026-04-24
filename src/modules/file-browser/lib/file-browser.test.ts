/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import {
  resolveBrowserPath,
  formatPermissions,
  formatBytes,
  detectKind,
  matchesFilter,
  defaultShortcuts,
  parseStatusCode,
  FileBrowserError,
} from './file-browser';

describe('file-browser lib', () => {
  describe('resolveBrowserPath', () => {
    it('should expand home directory (~)', () => {
      const homedir = os.homedir();
      expect(resolveBrowserPath('~')).toBe(homedir);
    });

    it('should expand home directory (~/)', () => {
      const homedir = os.homedir();
      expect(resolveBrowserPath('~/test')).toBe(path.join(homedir, 'test'));
    });

    it('should throw if path is not absolute', () => {
      expect(() => resolveBrowserPath('relative/path')).toThrow(FileBrowserError);
    });

    it('should throw if path is empty', () => {
      expect(() => resolveBrowserPath('  ')).toThrow(FileBrowserError);
    });

    it('should resolve absolute paths', () => {
      const absPath = path.resolve('/tmp/test');
      expect(resolveBrowserPath('/tmp/test')).toBe(absPath);
    });
  });

  describe('formatPermissions', () => {
    it('should format mode 0o777 correctly', () => {
      expect(formatPermissions(0o777)).toBe('rwxrwxrwx');
    });

    it('should format mode 0o644 correctly', () => {
      expect(formatPermissions(0o644)).toBe('rw-r--r--');
    });

    it('should format mode 0o755 correctly', () => {
      expect(formatPermissions(0o755)).toBe('rwxr-xr-x');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format KB correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('should format MB correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    });

    it('should format with decimals when small', () => {
      // size = 1.5. toFixed(1) if size < 10 and unitIndex > 0
      // 1.5 * 1024 * 1024 = 1572864
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });
  });

  describe('detectKind', () => {
    it('should detect directory', () => {
      expect(detectKind('/any/path', true)).toBe('directory');
    });

    it('should detect image', () => {
      expect(detectKind('test.png', false)).toBe('image');
      expect(detectKind('test.jpg', false)).toBe('image');
      expect(detectKind('test.SVG', false)).toBe('image');
    });

    it('should detect log', () => {
      expect(detectKind('error.log', false)).toBe('log');
    });

    it('should detect archive', () => {
      expect(detectKind('backup.zip', false)).toBe('archive');
      expect(detectKind('data.tar.gz', false)).toBe('archive');
    });

    it('should detect code', () => {
      expect(detectKind('index.ts', false)).toBe('code');
      expect(detectKind('styles.css', false)).toBe('code');
      expect(detectKind('config.json', false)).toBe('code');
    });

    it('should detect text', () => {
      expect(detectKind('notes.txt', false)).toBe('text');
      expect(detectKind('README.md', false)).toBe('text');
    });

    it('should detect binary for unknown extensions', () => {
      expect(detectKind('unknown.dat', false)).toBe('binary');
    });
  });

  describe('matchesFilter', () => {
    it('should return true for empty filter', () => {
      expect(matchesFilter('test.txt', '')).toBe(true);
      expect(matchesFilter('test.txt', '  ')).toBe(true);
    });

    it('should match partially (case-insensitive)', () => {
      expect(matchesFilter('TestFile.txt', 'test')).toBe(true);
    });

    it('should support wildcards (*)', () => {
      expect(matchesFilter('test.txt', 't*t')).toBe(true);
    });

    it('should support wildcards (?)', () => {
      expect(matchesFilter('test.txt', 't?st')).toBe(true);
    });

    it('should escape regex characters', () => {
      expect(matchesFilter('test.txt', 'test.txt')).toBe(true);
      expect(matchesFilter('other.txt', 'test.txt')).toBe(false);
    });
  });

  describe('defaultShortcuts', () => {
    it('should return default shortcuts', () => {
      const shortcuts = defaultShortcuts();
      expect(shortcuts).toContainEqual({ id: 'root', label: 'Root', path: '/' });
      expect(shortcuts).toContainEqual({ id: 'home', label: 'Home', path: os.homedir() });
    });
  });

  describe('parseStatusCode', () => {
    it('should parse known status codes', () => {
      expect(parseStatusCode('M')).toBe('modified');
      expect(parseStatusCode('A')).toBe('added');
      expect(parseStatusCode('D')).toBe('deleted');
      expect(parseStatusCode('?')).toBe('untracked');
    });

    it('should return code as is if unknown', () => {
      expect(parseStatusCode('X')).toBe('X');
    });
  });
});
