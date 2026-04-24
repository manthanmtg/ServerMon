import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { StepIdentity } from './StepIdentity';
import { INITIAL_FORM, ExposeForm } from './schema';

describe('StepIdentity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the name, slug, domain, and template inputs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
    );
    const setForm = vi.fn();
    const next = vi.fn();
    await act(async () => {
      render(
        <StepIdentity
          form={INITIAL_FORM}
          setForm={setForm}
          next={next}
          onCancel={() => undefined}
        />
      );
    });
    expect(screen.getByPlaceholderText('My App')).toBeDefined();
    expect(screen.getByPlaceholderText('my-app')).toBeDefined();
    expect(screen.getByPlaceholderText('app.example.com')).toBeDefined();
    expect(screen.getByLabelText('Template (optional)')).toBeDefined();
  });

  it('blocks Next when required fields are empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
    );
    const setForm = vi.fn();
    const next = vi.fn();
    await act(async () => {
      render(<StepIdentity form={INITIAL_FORM} setForm={setForm} next={next} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeDefined();
    });
    expect(screen.getByText('Slug is required')).toBeDefined();
    expect(screen.getByText('Domain is required')).toBeDefined();
  });

  it('blocks Next on invalid slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
    );
    const filled: ExposeForm = {
      ...INITIAL_FORM,
      name: 'My App',
      slug: 'Bad Slug!',
      domain: 'app.example.com',
    };
    const setForm = vi.fn();
    const next = vi.fn();
    await act(async () => {
      render(<StepIdentity form={filled} setForm={setForm} next={next} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/lowercase letters/i)).toBeDefined();
    });
  });

  it('calls next when identity is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [] }) })
    );
    const filled: ExposeForm = {
      ...INITIAL_FORM,
      name: 'My App',
      slug: 'my-app',
      domain: 'app.example.com',
    };
    const setForm = vi.fn();
    const next = vi.fn();
    await act(async () => {
      render(<StepIdentity form={filled} setForm={setForm} next={next} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
