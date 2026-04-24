import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StepPreview } from './StepPreview';
import { INITIAL_FORM, ExposeForm } from './schema';

describe('StepPreview', () => {
  it('renders nginx + frpc preview panels', async () => {
    const filled: ExposeForm = {
      ...INITIAL_FORM,
      name: 'My App',
      slug: 'my-app',
      domain: 'app.example.com',
      nodeId: 'n1',
      proxyRuleName: 'my-app',
      target: { localIp: '127.0.0.1', localPort: 3000, protocol: 'http' },
    };
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepPreview form={filled} setForm={setForm} next={next} back={back} />);
    });
    expect(screen.getByLabelText('nginx snippet preview').textContent).toContain(
      'server_name app.example.com'
    );
    expect(screen.getByLabelText('frpc toml preview').textContent).toContain('localPort = 3000');
  });

  it('Next/Back buttons call callbacks', async () => {
    const setForm = vi.fn();
    const next = vi.fn();
    const back = vi.fn();
    await act(async () => {
      render(<StepPreview form={INITIAL_FORM} setForm={setForm} next={next} back={back} />);
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
