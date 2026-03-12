import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';

async function createSession() {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'playwright-secret');
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return new SignJWT({
        user: { id: 'playwright-user', username: 'playwright', role: 'admin' },
        expires: expires.toISOString(),
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(secret);
}

test.beforeEach(async ({ page, baseURL }) => {
    const session = await createSession();
    await page.context().addCookies([
        {
            name: 'session',
            value: session,
            url: baseURL!,
            httpOnly: true,
        },
    ]);
});

test.describe('Docker module', () => {
    test('displays Docker dashboard data and terminal surface', async ({ page }) => {
        await page.goto('/docker');
        await expect(page.getByTestId('docker-page')).toBeVisible();
        await expect(page.getByTestId('docker-resource-chart')).toBeVisible();
        await expect(page.getByTestId('docker-disk-chart')).toBeVisible();
        await expect(page.getByTestId('docker-containers-table')).toContainText('servermon-api');
        await expect(page.getByTestId('docker-terminal')).toContainText('docker ps -a');
        await expect(page.getByTestId('docker-events')).toContainText('edge-proxy');
    });

    test('updates charts over time and supports start/stop actions', async ({ page }) => {
        await page.goto('/docker');
        await page.selectOption('select', '2000');

        const rowToggle = page.getByRole('button', { name: /servermon-api mock-api/i }).first();
        await rowToggle.click();
        const cpuValue = page.getByText(/^CPU:/).first();
        const initialText = await cpuValue.textContent();

        await page.waitForTimeout(2600);
        await expect(cpuValue).not.toHaveText(initialText || '');

        const workerRow = page.getByTestId('docker-containers-table').locator('tr').filter({ hasText: 'job-worker' }).first();
        await workerRow.getByRole('button', { name: 'Stop' }).click();
        await expect(workerRow).toContainText('exited');

        await workerRow.getByRole('button', { name: 'Start' }).click();
        await expect(workerRow).toContainText('running');
    });

    test('renders on mobile viewport with responsive shell', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'Mobile assertions only run in mobile project.');

        await page.goto('/docker');
        await expect(page.getByRole('heading', { name: 'Docker Monitor' })).toBeVisible();
        await expect(page.getByTestId('docker-sidebar')).toBeVisible();
        await expect(page.getByTestId('docker-assets')).toBeVisible();
    });
});
