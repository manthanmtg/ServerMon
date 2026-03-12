import { defineConfig, devices } from '@playwright/test';

const port = process.env.PORT || '8912';
const jwtSecret = process.env.JWT_SECRET || 'playwright-secret';

export default defineConfig({
    testDir: './src/modules',
    testMatch: /.*\.spec\.ts/,
    timeout: 60_000,
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: `PORT=${port} JWT_SECRET=${jwtSecret} SERVERMON_DOCKER_MOCK=1 pnpm dev`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: true,
        timeout: 120_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
    ],
});
