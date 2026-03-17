import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CertificatesRoute from './page';

vi.mock('@/components/layout/ProShell', () => ({
  default: ({
    children,
    title,
    subtitle,
  }: {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
  }) => (
    <div data-testid="pro-shell">
      <span data-testid="title">{title}</span>
      {subtitle && <span data-testid="subtitle">{subtitle}</span>}
      {children}
    </div>
  ),
}));

vi.mock('@/modules/certificates/ui/CertificatesPage', () => ({
  default: () => <div data-testid="certificates-page">CertificatesPage</div>,
}));

describe('Certificates page route', () => {
  it('renders ProShell with correct title and subtitle', () => {
    render(<CertificatesRoute />);
    expect(screen.getByTestId('title').textContent).toBe('Certificates');
    expect(screen.getByTestId('subtitle').textContent).toBe('SSL/TLS Certificate Management');
  });

  it('renders CertificatesPage inside ProShell', () => {
    render(<CertificatesRoute />);
    expect(screen.getByTestId('certificates-page')).toBeDefined();
  });
});
