import fs from 'fs/promises';
import path from 'path';
import { expect } from '@playwright/test';

const fixturePath = path.join(process.cwd(), 'tests/e2e/.auth/file-browser-fixture.json');

export async function loadFixture() {
    return JSON.parse(await fs.readFile(fixturePath, 'utf8'));
}

export async function gotoFileBrowser(page, targetPath) {
    await page.goto(`/file-browser?path=${encodeURIComponent(targetPath)}`);
    await expect(page.getByRole('heading', { name: 'File Browser' })).toBeVisible();
    await expect(page.getByTestId('file-list')).toBeVisible();
}
