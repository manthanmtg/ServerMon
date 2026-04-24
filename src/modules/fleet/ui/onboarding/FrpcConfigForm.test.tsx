import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FrpcConfigForm } from './FrpcConfigForm';
import type { OnboardingForm } from './schema';

function defaultValue(): OnboardingForm['frpcConfig'] {
  return {
    protocol: 'tcp',
    tlsEnabled: true,
    tlsVerify: true,
    transportEncryptionEnabled: true,
    compressionEnabled: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
  };
}

describe('FrpcConfigForm', () => {
  it('renders all configurable fields', () => {
    render(<FrpcConfigForm value={defaultValue()} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Protocol')).toBeDefined();
    expect(screen.getByLabelText('TLS enabled')).toBeDefined();
    expect(screen.getByLabelText('TLS verify')).toBeDefined();
    expect(screen.getByLabelText('Transport encryption')).toBeDefined();
    expect(screen.getByLabelText('Compression')).toBeDefined();
    expect(screen.getByLabelText('Heartbeat interval')).toBeDefined();
    expect(screen.getByLabelText('Heartbeat timeout')).toBeDefined();
    expect(screen.getByLabelText('Pool count')).toBeDefined();
  });

  it('emits onChange when protocol changes', () => {
    const onChange = vi.fn();
    render(<FrpcConfigForm value={defaultValue()} onChange={onChange} />);
    const select = screen.getByLabelText('Protocol') as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: 'quic' } });
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'quic' }));
  });

  it('emits onChange when TLS toggled off and disables verify', () => {
    const onChange = vi.fn();
    render(<FrpcConfigForm value={defaultValue()} onChange={onChange} />);
    const tls = screen.getByLabelText('TLS enabled') as HTMLInputElement;
    act(() => {
      fireEvent.click(tls);
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tlsEnabled: false }));
  });

  it('disables TLS verify when TLS is off', () => {
    const v = defaultValue();
    v.tlsEnabled = false;
    render(<FrpcConfigForm value={v} onChange={vi.fn()} />);
    const tlsVerify = screen.getByLabelText('TLS verify') as HTMLInputElement;
    expect(tlsVerify.disabled).toBe(true);
  });

  it('emits onChange when numeric fields change', () => {
    const onChange = vi.fn();
    render(<FrpcConfigForm value={defaultValue()} onChange={onChange} />);
    const hb = screen.getByLabelText('Heartbeat interval') as HTMLInputElement;
    act(() => {
      fireEvent.change(hb, { target: { value: '45' } });
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ heartbeatInterval: 45 }));
  });

  it('emits onChange when compression toggled', () => {
    const onChange = vi.fn();
    render(<FrpcConfigForm value={defaultValue()} onChange={onChange} />);
    const comp = screen.getByLabelText('Compression');
    act(() => {
      fireEvent.click(comp);
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ compressionEnabled: true }));
  });
});
