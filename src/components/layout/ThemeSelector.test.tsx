import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeSelector from './ThemeSelector';
import { themes } from '@/lib/themes';

const mockSetTheme = vi.fn();
const lightDefault = themes.find((t) => t.id === 'light-default')!;
const darkDefault = themes.find((t) => t.id === 'dark-default')!;

vi.mock('@/lib/ThemeContext', () => ({
  useTheme: () => ({
    theme: lightDefault,
    setTheme: mockSetTheme,
    availableThemes: [lightDefault, darkDefault],
  }),
}));

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current theme name', () => {
    render(<ThemeSelector />);
    // The theme name is shown
    expect(screen.getByText(lightDefault.name)).toBeDefined();
  });

  it('does not show theme list initially', () => {
    render(<ThemeSelector />);
    expect(screen.queryByText('Interface Theme')).toBeNull();
  });

  it('opens dropdown when button is clicked', () => {
    render(<ThemeSelector />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText('Interface Theme')).toBeDefined();
  });

  it('shows all available themes in dropdown', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText(lightDefault.name).length).toBeGreaterThan(0);
    expect(screen.getByText(darkDefault.name)).toBeDefined();
  });

  it('calls setTheme when a theme is selected', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText(darkDefault.name));
    expect(mockSetTheme).toHaveBeenCalledWith(darkDefault.id);
  });

  it('closes dropdown after selecting a theme', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText(darkDefault.name));
    expect(screen.queryByText('Interface Theme')).toBeNull();
  });

  it('closes dropdown when clicking outside', () => {
    render(<ThemeSelector />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Interface Theme')).toBeDefined();
    // Simulate click outside by firing mousedown on document
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Interface Theme')).toBeNull();
  });
});
