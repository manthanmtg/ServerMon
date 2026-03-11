import path from 'path';
import { expect, test } from '@playwright/test';
import { gotoFileBrowser, loadFixture } from './support/file-browser-test-utils.mjs';

test.describe('File Browser', () => {
    test('supports tree navigation, breadcrumbs, filters, and history', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Desktop-specific tree assertions');
        const { rootDir } = await loadFixture();
        const sandboxName = path.basename(rootDir);

        await gotoFileBrowser(page, rootDir);
        await page.getByRole('button', { name: `Expand ${sandboxName}` }).click();
        await page.getByTestId(`tree-node-${path.join(rootDir, 'docs')}`).click();

        await expect(page.getByText('drafts')).toBeVisible();
        await page.getByRole('button', { name: 'docs' }).click();
        await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(path.join(rootDir, 'docs'))}`));

        await page.getByLabel('Filter files').fill('*.txt');
        await expect(page.getByText('notes.txt')).toBeVisible();
        await expect(page.getByText('drafts')).toBeHidden();

        await page.getByRole('button', { name: 'Go back' }).click();
        await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(path.join(rootDir, 'docs'))}`));
        await page.getByRole('button', { name: 'Go forward' }).click();
        await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(path.join(rootDir, 'docs'))}`));
    });

    test('creates, renames, deletes, and uploads entries with explicit dialogs', async ({ page }) => {
        const { rootDir } = await loadFixture();
        await gotoFileBrowser(page, rootDir);

        await page.getByLabel('Create folder').click();
        await page.getByLabel('Name').fill('created-dir');
        await page.getByRole('button', { name: 'Confirm' }).click();
        await expect(page.getByRole('alert')).toContainText('Folder created');
        await expect(page.getByText('created-dir')).toBeVisible();

        await page.getByLabel('Create file').click();
        await page.getByLabel('Name').fill('draft.txt');
        await page.getByLabel('Initial content').fill('hello from playwright');
        await page.getByRole('button', { name: 'Confirm' }).click();
        await expect(page.getByText('draft.txt')).toBeVisible();

        await page.getByLabel('Rename draft.txt').click();
        await page.getByLabel('Name').fill('renamed.txt');
        await page.getByRole('button', { name: 'Confirm' }).click();
        await expect(page.getByText('renamed.txt')).toBeVisible();

        await page.setInputFiles('[data-testid="file-upload-input"]', {
            name: 'upload.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('uploaded from e2e'),
        });
        await expect(page.getByRole('alert')).toContainText('uploaded');
        await expect(page.getByText('upload.txt')).toBeVisible();

        await page.getByLabel('Delete renamed.txt').click();
        await page.getByRole('button', { name: 'Delete' }).click();
        await expect(page.getByText('renamed.txt')).toBeHidden();
    });

    test('previews text, logs, images, binary files, and saves edits', async ({ page }) => {
        const { rootDir } = await loadFixture();
        await gotoFileBrowser(page, rootDir);

        await page.getByLabel('Preview README.md').click();
        await expect(page.getByTestId('text-preview')).toContainText('# File Browser');
        await page.getByRole('button', { name: 'Edit' }).click();
        await page.getByTestId('editor-textarea').fill('# File Browser\n\nEdited.\n');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('alert')).toContainText('File saved');
        await expect(page.getByTestId('text-preview')).toContainText('Edited.');

        await page.getByLabel('Preview app.log').click();
        await expect(page.getByTestId('log-preview')).toContainText('line-249');
        await expect(page.getByText('Preview truncated by module limit')).toBeVisible();

        await page.getByLabel('Preview pixel.png').click();
        await page.getByRole('button', { name: 'Open image preview' }).click();
        await expect(page.getByRole('dialog')).toContainText('pixel.png');
        await page.getByLabel('Close image preview').click();

        await page.getByLabel('Preview binary.bin').click();
        await expect(page.getByText('Binary preview is not supported')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    });

    test('persists settings shortcuts and handles duplicate-name errors', async ({ page }) => {
        const { rootDir } = await loadFixture();
        await gotoFileBrowser(page, rootDir);

        await page.getByLabel('Open settings').click();
        await page.getByRole('button', { name: 'Add' }).click();
        const labels = page.getByLabel('Label');
        const paths = page.getByLabel('Path');
        await labels.last().fill('Docs');
        await paths.last().fill(path.join(rootDir, 'docs'));
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('alert')).toContainText('saved');
        await expect(page.getByRole('button', { name: 'Docs' })).toBeVisible();

        await page.getByRole('button', { name: 'Docs' }).click();
        await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(path.join(rootDir, 'docs'))}`));

        await page.getByLabel('Create folder').click();
        await page.getByLabel('Name').fill('drafts');
        await page.getByRole('button', { name: 'Confirm' }).click();
        await expect(page.getByRole('alert')).toContainText('already exists');
    });

    test('supports responsive mobile actions and the folder tree overlay', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'mobile', 'Mobile-specific assertions');
        const { rootDir } = await loadFixture();

        await gotoFileBrowser(page, rootDir);
        await page.getByLabel('Open folder tree').click();
        await expect(page.getByRole('dialog')).toContainText('Folders');
        await page.getByTestId(`tree-node-${path.join(rootDir, 'logs')}`).click();
        await expect(page.getByText('app.log')).toBeVisible();

        await page.getByRole('button', { name: 'Preview' }).click();
        await expect(page.getByTestId('log-preview')).toBeVisible();
        await page.getByRole('button', { name: 'Copy Path' }).click();
        await expect(page.getByRole('alert')).toContainText('Path copied');
    });

    test('shows directory-level errors for invalid paths', async ({ page }) => {
        await page.goto(`/file-browser?path=${encodeURIComponent('/definitely/missing/path')}`);
        await expect(page.getByRole('alert')).toContainText('Directory not found');
    });
});
