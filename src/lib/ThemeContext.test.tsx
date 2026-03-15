import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';
import { themes } from './themes';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ThemeDisplay = () => {
  const { theme, availableThemes, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-id">{theme.id}</span>
      <span data-testid="theme-type">{theme.type}</span>
      <span data-testid="theme-count">{availableThemes.length}</span>
      <button onClick={() => setTheme('light-default')}>Switch to Light</button>
      <button onClick={() => setTheme('nonexistent-id')}>Switch to Bad</button>
    </div>
  );
};

const ThemeConsumerOutsideProvider = () => {
  useTheme();
  return null;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThemeContext', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      localStorageMock[key] = String(value);
    });
    // Stub document.documentElement.style.setProperty
    vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(() => {});
    vi.spyOn(document.documentElement, 'setAttribute').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides the default dark theme when localStorage has no entry', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );
    // themes[1] is the dark default (Obsidian)
    expect(screen.getByTestId('theme-id').textContent).toBe(themes[1].id);
  });

  it('loads a saved theme from localStorage', () => {
    localStorageMock['servermon-theme'] = 'light-default';

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-id').textContent).toBe('light-default');
    expect(screen.getByTestId('theme-type').textContent).toBe('light');
  });

  it('falls back to default when localStorage has an unknown theme id', () => {
    localStorageMock['servermon-theme'] = 'completely-unknown-id';

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-id').textContent).toBe(themes[1].id);
  });

  it('exposes all themes via availableThemes', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(Number(screen.getByTestId('theme-count').textContent)).toBe(themes.length);
  });

  it('switches theme when setTheme is called with a valid id', async () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Switch to Light'));
    });

    expect(screen.getByTestId('theme-id').textContent).toBe('light-default');
    expect(screen.getByTestId('theme-type').textContent).toBe('light');
  });

  it('ignores setTheme calls with an unknown id', async () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    const initialId = screen.getByTestId('theme-id').textContent;

    await act(async () => {
      fireEvent.click(screen.getByText('Switch to Bad'));
    });

    // Theme should remain unchanged
    expect(screen.getByTestId('theme-id').textContent).toBe(initialId);
  });

  it('persists the selected theme to localStorage', async () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Switch to Light'));
    });

    expect(localStorageMock['servermon-theme']).toBe('light-default');
  });

  it('applies theme CSS variables on mount', () => {
    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>
    );

    expect(document.documentElement.style.setProperty).toHaveBeenCalled();
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith(
      'data-theme',
      expect.any(String)
    );
  });

  it('throws when useTheme is used outside ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeConsumerOutsideProvider />)).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
    spy.mockRestore();
  });
});
