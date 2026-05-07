import { expect, test } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { encrypt } from '../src/lib/session-core';

loadEnv({ path: '.env.local' });

const appFixture = {
  id: 'app-1',
  name: 'Inventory Portal',
  slug: 'inventory-portal',
  templateId: 'nextjs',
  sourceType: 'local',
  sourcePath: '/srv/apps/inventory-portal',
  domain: 'inventory.example.com',
  port: 3010,
  commands: {
    install: 'pnpm install --frozen-lockfile',
    build: 'pnpm build',
    start: 'pnpm start',
  },
  envVars: {
    NEXT_PUBLIC_APP_URL: 'https://inventory.example.com',
  },
  healthCheckPath: '/',
  tlsEnabled: false,
  status: 'running',
  currentReleaseId: 'release-ok',
  releases: [
    {
      id: 'release-ok',
      status: 'active',
      createdAt: '2026-05-07T00:00:00.000Z',
      activatedAt: '2026-05-07T00:01:00.000Z',
      logs: ['Health check passed'],
    },
    {
      id: 'release-failed',
      status: 'failed',
      createdAt: '2026-05-07T01:00:00.000Z',
      error: 'Command failed: pnpm build',
      logs: ['build failed'],
    },
  ],
};

test.beforeEach(async ({ context, page }) => {
  const session = await encrypt({
    user: { id: 'admin', username: 'admin', role: 'admin' },
    expires: new Date(Date.now() + 60 * 60 * 1000),
  });

  await context.addCookies([
    {
      name: 'session',
      value: session,
      url: 'http://localhost:8912',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  await context.route('**/api/settings/branding/icon', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />',
    });
  });

  await context.route('**/favicon.ico', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />',
    });
  });

  await context.route('**/api/settings/branding', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pageTitle: 'ServerMon', logoBase64: '' }),
    });
  });

  await context.route('**/api/modules/apps', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ apps: [appFixture] }),
    });
  });
});

test('renders the Apps module and opens deployment history', async ({ page }) => {
  await page.goto('/apps');

  await expect(page.getByRole('heading', { name: 'Apps', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registered Apps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New App' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inventory Portal' })).toBeVisible();

  await page.getByRole('button', { name: 'New App' }).click();
  const appDialog = page.getByRole('dialog', { name: 'New App' });
  await expect(appDialog).toBeVisible();
  await expect(appDialog.getByLabel('Template')).toHaveValue('nextjs');
  await expect(appDialog.getByLabel('App name')).toBeVisible();
  await expect(appDialog.getByLabel('Source path')).toBeVisible();
  await expect(appDialog.getByLabel('Domain')).toBeVisible();
  await appDialog.getByRole('button', { name: 'Close app form' }).click();
  await expect(appDialog).toBeHidden();

  await page.getByRole('button', { name: 'Deployment history for Inventory Portal' }).click();

  const dialog = page.getByRole('dialog', { name: 'Deployment history' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('release-ok')).toBeVisible();
  await expect(dialog.getByText('Passed', { exact: true })).toBeVisible();
  await expect(dialog.getByText('release-failed')).toBeVisible();
  await expect(dialog.getByText('Failed', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Command failed: pnpm build')).toBeVisible();
  await expect(dialog.getByText('build failed', { exact: true })).toBeVisible();
});
