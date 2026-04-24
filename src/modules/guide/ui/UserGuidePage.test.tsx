import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserGuidePage from './UserGuidePage';

// Mock the guide registry with a small, controlled set
vi.mock('@/modules/guide-registry', () => ({
  moduleGuides: [
    {
      id: 'guide',
      name: 'User Guide',
      guide: {
        title: 'ServerMon Knowledge Center',
        description: 'Everything you need to monitor and manage your infrastructure.',
        sections: [
          {
            title: 'What is ServerMon?',
            content: 'ServerMon is a secure, self-hosted server monitoring platform.',
            icon: 'Info',
          },
          {
            title: 'Getting Started',
            content: 'Start with the Dashboard for a high-level overview.',
            icon: 'Compass',
          },
        ],
      },
    },
    {
      id: 'terminal',
      name: 'Terminal',
      guide: {
        title: 'Web Terminal',
        description: 'A full-featured browser-based terminal.',
        sections: [
          {
            title: 'Opening a Session',
            content: 'Click the + button to open a new terminal tab.',
            icon: 'Terminal',
          },
        ],
      },
    },
    {
      id: 'docker',
      name: 'Docker Monitor',
      guide: {
        title: 'Docker Overview',
        description: 'Manage Docker containers and images.',
        sections: [
          {
            title: 'Container Management',
            content: 'Start, stop, and inspect containers.',
            icon: 'Container',
          },
        ],
      },
    },
  ],
}));

describe('UserGuidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Knowledge Center heading', () => {
    render(<UserGuidePage />);
    expect(screen.getByText('Knowledge Center')).toBeDefined();
  });

  it('renders the description', () => {
    render(<UserGuidePage />);
    expect(screen.getByText(/Everything you need to know about monitoring/)).toBeDefined();
  });

  it('renders the search input', () => {
    render(<UserGuidePage />);
    expect(screen.getByPlaceholderText('Search guides...')).toBeDefined();
  });

  it('renders all module names in sidebar', () => {
    render(<UserGuidePage />);
    expect(screen.getByText('User Guide')).toBeDefined();
    expect(screen.getByText('Terminal')).toBeDefined();
    expect(screen.getByText('Docker Monitor')).toBeDefined();
  });

  it('shows the first module guide by default', () => {
    render(<UserGuidePage />);
    expect(screen.getByText('ServerMon Knowledge Center')).toBeDefined();
    expect(screen.getByText('What is ServerMon?')).toBeDefined();
    expect(screen.getByText('Getting Started')).toBeDefined();
  });

  it('switches guide content when a sidebar module is clicked', () => {
    render(<UserGuidePage />);

    // Click on Terminal
    fireEvent.click(screen.getByText('Terminal'));

    expect(screen.getByText('Web Terminal')).toBeDefined();
    expect(screen.getByText('Opening a Session')).toBeDefined();
    // Previous guide should not be visible
    expect(screen.queryByText('ServerMon Knowledge Center')).toBeNull();
  });

  it('switches to Docker Monitor guide when clicked', () => {
    render(<UserGuidePage />);

    fireEvent.click(screen.getByText('Docker Monitor'));

    expect(screen.getByText('Docker Overview')).toBeDefined();
    expect(screen.getByText('Container Management')).toBeDefined();
  });

  it('filters modules by search query (name match)', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByPlaceholderText('Search guides...');
    fireEvent.change(searchInput, { target: { value: 'Terminal' } });

    // Only Terminal should remain in sidebar
    expect(screen.getByText('Terminal')).toBeDefined();
    expect(screen.queryByText('Docker Monitor')).toBeNull();
  });

  it('filters modules by section title', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByPlaceholderText('Search guides...');
    fireEvent.change(searchInput, { target: { value: 'Container Management' } });

    expect(screen.getByText('Docker Monitor')).toBeDefined();
    expect(screen.queryByText('Terminal')).toBeNull();
  });

  it('clears filter when search query is removed', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByPlaceholderText('Search guides...');
    fireEvent.change(searchInput, { target: { value: 'Docker' } });
    expect(screen.queryByText('Terminal')).toBeNull();

    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Terminal')).toBeDefined();
    expect(screen.getByText('Docker Monitor')).toBeDefined();
  });

  it('shows empty state when search matches nothing', () => {
    render(<UserGuidePage />);

    const searchInput = screen.getByPlaceholderText('Search guides...');
    fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

    // No modules in sidebar
    expect(screen.queryByText('User Guide')).toBeNull();
    expect(screen.queryByText('Terminal')).toBeNull();
    // The currently selected guide content may still be visible since selectedModule is still set
    // but sidebar is empty
    expect(screen.queryByText('xyznonexistent')).toBeNull();
  });

  it('renders guide description in content area', () => {
    render(<UserGuidePage />);
    expect(
      screen.getByText('Everything you need to monitor and manage your infrastructure.')
    ).toBeDefined();
  });

  it('renders section content text', () => {
    render(<UserGuidePage />);
    expect(
      screen.getByText('ServerMon is a secure, self-hosted server monitoring platform.')
    ).toBeDefined();
  });
});
