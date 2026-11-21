import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Keep tests offline: gdu auto-install only runs when a test opts in explicitly.
process.env.SERVERMON_GDU_AUTO_INSTALL ??= 'false';

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});
