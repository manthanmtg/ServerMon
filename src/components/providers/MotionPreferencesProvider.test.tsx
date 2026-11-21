import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { motionConfigSpy } = vi.hoisted(() => ({
  motionConfigSpy: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  MotionConfig: ({
    children,
    reducedMotion,
  }: {
    children: React.ReactNode;
    reducedMotion: string;
  }) => {
    motionConfigSpy(reducedMotion);
    return <>{children}</>;
  },
}));

import { MotionPreferencesProvider } from './MotionPreferencesProvider';

describe('MotionPreferencesProvider', () => {
  it('renders children under the user reduced-motion preference', () => {
    render(
      <MotionPreferencesProvider>
        <span>Application content</span>
      </MotionPreferencesProvider>
    );

    expect(screen.getByText('Application content')).toBeDefined();
    expect(motionConfigSpy).toHaveBeenCalledWith('user');
  });
});
