import { describe, it, expect } from 'vitest';
import { themes } from './themes';
import type { Theme, ThemeColors } from './themes';

const REQUIRED_COLOR_KEYS: (keyof ThemeColors)[] = [
  'background',
  'foreground',
  'card',
  'cardForeground',
  'popover',
  'popoverForeground',
  'primary',
  'primaryForeground',
  'secondary',
  'secondaryForeground',
  'muted',
  'mutedForeground',
  'accent',
  'accentForeground',
  'destructive',
  'destructiveForeground',
  'border',
  'input',
  'ring',
  'success',
  'warning',
  'sidebar',
  'sidebarForeground',
  'sidebarBorder',
];

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(value);
}

describe('themes', () => {
  it('should export a non-empty array', () => {
    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBeGreaterThan(0);
  });

  it('should include at least one light and one dark theme', () => {
    const lightThemes = themes.filter((t: Theme) => t.type === 'light');
    const darkThemes = themes.filter((t: Theme) => t.type === 'dark');
    expect(lightThemes.length).toBeGreaterThan(0);
    expect(darkThemes.length).toBeGreaterThan(0);
  });

  it('should have unique IDs for all themes', () => {
    const ids = themes.map((t: Theme) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('should have unique names for all themes', () => {
    const names = themes.map((t: Theme) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('each theme should have all required color tokens', () => {
    for (const theme of themes) {
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(theme.colors[key], `${theme.id} missing color key "${key}"`).toBeDefined();
        expect(theme.colors[key]).not.toBe('');
      }
    }
  });

  it('each color value should be a valid hex color', () => {
    for (const theme of themes) {
      for (const key of REQUIRED_COLOR_KEYS) {
        const value = theme.colors[key];
        expect(isHexColor(value), `${theme.id}.${key} = "${value}" is not a valid hex color`).toBe(
          true
        );
      }
    }
  });

  it('each theme should have a non-empty id, name, and valid type', () => {
    for (const theme of themes) {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(['light', 'dark']).toContain(theme.type);
    }
  });

  it('should include the light-default and dark-default themes', () => {
    const ids = themes.map((t: Theme) => t.id);
    expect(ids).toContain('light-default');
    expect(ids).toContain('dark-default');
  });
});
