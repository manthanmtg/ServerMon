import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LoginPage from './page';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/BrandContext', () => ({
  useBrand: () => ({
    settings: { pageTitle: 'ServerMon', logoBase64: '' },
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the login form with username and password fields', () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText('admin')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter your password')).toBeDefined();
  });

  it('renders the page title from brand settings', () => {
    render(<LoginPage />);
    expect(screen.getByText('ServerMon')).toBeDefined();
  });

  it('renders the Continue button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Continue')).toBeDefined();
  });

  it('renders the Sign in with Passkey button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in with Passkey')).toBeDefined();
  });

  it('shows error when credentials are invalid', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'wrongpass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeDefined();
    });
  });

  it('moves to step 2 (TOTP) after valid credentials', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'correctpass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Two-factor authentication')).toBeDefined();
    });
  });

  it('renders TOTP form in step 2', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'pass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
      expect(screen.getByText('Verify')).toBeDefined();
    });
  });

  it('can go back from step 2 to step 1', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'pass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Back to login')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Back to login'));
    });

    expect(screen.getByPlaceholderText('admin')).toBeDefined();
  });

  it('redirects to dashboard after successful TOTP', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // verify credentials
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // login with TOTP

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'pass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '123456' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows TOTP error when verification fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // verify credentials
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid TOTP code' }) }); // login with TOTP

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
      target: { value: 'pass' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '999999' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Verify'));
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid TOTP code')).toBeDefined();
    });
  });

  it('renders security footer text', () => {
    render(<LoginPage />);
    expect(screen.getByText('Secured with Argon2 & TOTP')).toBeDefined();
  });

  it('renders logo when logoBase64 is empty', () => {
    render(<LoginPage />);
    // Should render the Activity icon (no img tag)
    expect(screen.queryByAltText('Logo')).toBeNull();
  });
});
