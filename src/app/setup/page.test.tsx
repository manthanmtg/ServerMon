import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SetupPage from './page';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// next/image mock
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders step 1 with username and password fields', () => {
    render(<SetupPage />);
    expect(screen.getByPlaceholderText('admin')).toBeDefined();
    expect(screen.getByPlaceholderText('At least 8 characters')).toBeDefined();
    expect(screen.getByPlaceholderText('Repeat your password')).toBeDefined();
  });

  it('renders the Setup ServerMon heading', () => {
    render(<SetupPage />);
    expect(screen.getByText('Setup ServerMon')).toBeDefined();
  });

  it('renders step indicators', () => {
    render(<SetupPage />);
    expect(screen.getByText('Account')).toBeDefined();
    expect(screen.getByText('2FA Setup')).toBeDefined();
    expect(screen.getByText('Complete')).toBeDefined();
  });

  it('shows error when passwords do not match', async () => {
    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'different' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    expect(screen.getByText('Passwords do not match')).toBeDefined();
  });

  it('shows error when password is too short', async () => {
    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'short' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined();
  });

  it('advances to step 2 when setup/init succeeds', async () => {
    const mockSecret = 'ABCDEFGHIJKLMNOP';
    const mockQrCode = 'data:image/png;base64,fakeqrcode';

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ secret: mockSecret, qrCode: mockQrCode }),
    });

    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Set up two-factor auth')).toBeDefined();
    });

    // Shows QR code
    expect(screen.getByAltText('TOTP QR Code')).toBeDefined();
    // Shows manual key
    expect(screen.getByText(mockSecret)).toBeDefined();
  });

  it('shows API error from step 1', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Setup already completed' }),
    });

    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Setup already completed')).toBeDefined();
    });
  });

  it('completes setup and redirects to login', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: 'TESTSECRET', qrCode: 'data:image/png;base64,test' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    render(<SetupPage />);

    // Step 1
    fireEvent.change(screen.getByPlaceholderText('admin'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
    });

    // Step 2
    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '123456' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Complete setup'));
    });

    await waitFor(() => {
      expect(screen.getByText('Setup complete')).toBeDefined();
    });

    // Wait for the redirect timer (uses real timers now)
    await waitFor(
      () => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      },
      { timeout: 5000 }
    );
  });

  it('shows error from step 2 when complete setup fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ secret: 'TESTSECRET', qrCode: 'data:image/png;base64,test' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid TOTP code' }),
      });

    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: '000000' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Complete setup'));
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid TOTP code')).toBeDefined();
    });
  });

  it('strips non-digits from TOTP input', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ secret: 'TESTSECRET', qrCode: 'data:image/png;base64,test' }),
    });

    render(<SetupPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), {
      target: { value: 'password123' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Continue'));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeDefined();
    });

    const totpInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
    fireEvent.change(totpInput, { target: { value: 'abc123def' } });
    expect(totpInput.value).toBe('123');
  });
});
