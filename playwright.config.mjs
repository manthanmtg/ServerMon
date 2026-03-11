import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const PORT = 3005;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    retries: 0,
    timeout: 45_000,
    expect: {
        timeout: 10_000,
    },
    globalSetup: path.join(process.cwd(), 'tests/e2e/support/global-setup.mjs'),
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        storageState: path.join(process.cwd(), 'tests/e2e/.auth/session.json'),
    },
    projects: [
        {
            name: 'desktop',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
        {
            name: 'mobile',
            use: {
                ...devices['iPhone 13'],
            },
        },
    ],
    webServer: {
        command: `pnpm exec next dev -p ${PORT}`,
        url: `${baseURL}/login`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
            NODE_ENV: 'development',
            JWT_SECRET: 'playwright-file-browser-secret',
            MONGO_URI: '',
            PORT: String(PORT),
        },
    },
});
