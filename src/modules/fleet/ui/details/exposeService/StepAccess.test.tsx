import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StepAccess } from './StepAccess';
import { INITIAL_FORM } from './schema';

describe('StepAccess', () => {
  it('renders access + TLS controls', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepAccess form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    expect(screen.getByLabelText('Access mode')).toBeDefined();
    expect(screen.getByLabelText('TLS provider')).toBeDefined();
    expect(screen.getByLabelText('TLS enabled')).toBeDefined();
  });

  it('toggling TLS off updates the form', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepAccess form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('TLS enabled'));
    });
    expect(setForm).toHaveBeenCalled();
    const arg = setForm.mock.calls[0][0];
    expect(arg.tlsEnabled).toBe(false);
  });

  it('Next/Back buttons call callbacks', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepAccess form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
