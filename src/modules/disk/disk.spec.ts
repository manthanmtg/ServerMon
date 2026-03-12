import { test, expect, Page } from '@playwright/test';

test.describe('Disk Module', () => {
    test.beforeEach(async ({ page }: { page: Page }) => {
        await page.goto('http://localhost:8912/disk');
    });

    test('should display dashboard with multiple widgets', async ({ page }: { page: Page }) => {
        // Check for header title
        await expect(page.locator('h2')).toContainText('Storage Dashboard');

        // Check for usage cards (should be 4 in the grid)
        const usageCards = page.locator('.grid >> .border-border\\/50');
        await expect(usageCards.locator('p:text("Main Storage")')).toBeVisible();
        await expect(usageCards.locator('p:text("Live Throughput")')).toBeVisible();
        await expect(usageCards.locator('p:text("Disk Health")')).toBeVisible();
        await expect(usageCards.locator('p:text("Active Load")')).toBeVisible();

        // Check for I/O chart
        await expect(page.getByText('I/O Performance History')).toBeVisible();
    });

    test('should allow toggling unit settings via modal', async ({ page }: { page: Page }) => {
        // Click settings icon
        const settingsBtn = page.locator('button').filter({ hasText: '' }).last(); // The icon button
        await settingsBtn.click();

        // Check if modal appears
        await expect(page.getByText('Disk Settings')).toBeVisible();
        await expect(page.getByText('Binary (base 1024)')).toBeVisible();
        
        const decimalOption = page.getByText('Decimal (base 1000)');
        await decimalOption.click();

        // Modal should close or we should see "decimal units" badge in header
        await expect(page.getByText('decimal units')).toBeVisible();
    });

    test('should allow running a directory scan', async ({ page }: { page: Page }) => {
        const scanButton = page.getByRole('button', { name: 'Scan' });
        await expect(scanButton).toBeVisible();
        await scanButton.click();

        // Wait for scan results (BarChart should appear)
        await page.waitForSelector('rect.recharts-bar-rectangle', { timeout: 30000 });
        
        const bars = page.locator('rect.recharts-bar-rectangle');
        await expect(bars.count()).toBeGreaterThan(0);
    });

    test('should be mobile friendly', async ({ page }: { page: Page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        
        // Storage dashboard title should still be visible
        await expect(page.locator('h2')).toBeVisible();

        // Grid should respond
        const grid = page.locator('.grid');
        await expect(grid.first()).toBeVisible();
    });
});
