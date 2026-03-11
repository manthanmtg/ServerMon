import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import path from 'path';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import {
    createEntry,
    deleteEntry,
    formatPermissions,
    listDirectory,
    matchesFilter,
    previewFile,
    readEditableFile,
    renameEntry,
    resolveBrowserPath,
    saveFile,
    writeUpload,
} from './file-browser.ts';

let sandboxDir = '';

before(async () => {
    sandboxDir = await mkdtemp(path.join(os.tmpdir(), 'servermon-file-browser-'));
});

after(async () => {
    if (sandboxDir) {
        await rm(sandboxDir, { recursive: true, force: true });
    }
});

describe('file-browser helpers', () => {
    it('resolves absolute paths and rejects relative ones', () => {
        assert.equal(resolveBrowserPath('/tmp/../tmp/example'), '/tmp/example');
        assert.throws(() => resolveBrowserPath('../etc/passwd'), /absolute/);
    });

    it('formats permissions into rwx segments', () => {
        assert.equal(formatPermissions(0o100644), 'rw-r--r--');
        assert.equal(formatPermissions(0o040755), 'rwxr-xr-x');
    });

    it('creates, renames, previews, lists, and deletes entries', async () => {
        const createdDir = await createEntry(sandboxDir, 'logs', 'directory');
        const createdFile = await createEntry(createdDir, 'app.log', 'file', 'first\nsecond\nthird\n');
        await writeFile(path.join(createdDir, 'readme.txt'), 'hello world', 'utf8');

        const listing = await listDirectory(createdDir);
        assert.equal(listing.summary.files, 2);
        assert.equal(listing.summary.directories, 0);
        assert.equal(listing.entries[0]?.name, 'app.log');

        const preview = await previewFile(createdFile, 1024, 2);
        assert.equal(preview.kind, 'log');
        assert.deepEqual(preview.tailLines, ['third', '']);

        const renamedPath = await renameEntry(createdFile, 'server.log');
        assert.equal(path.basename(renamedPath), 'server.log');
        assert.equal(await readFile(renamedPath, 'utf8'), 'first\nsecond\nthird\n');

        await deleteEntry(renamedPath);
        await deleteEntry(path.join(createdDir, 'readme.txt'));
        const nextListing = await listDirectory(createdDir);
        assert.equal(nextListing.summary.files, 0);
    });

    it('supports wildcard filtering', () => {
        assert.equal(matchesFilter('server.log', '*.log'), true);
        assert.equal(matchesFilter('server.conf', '*.log'), false);
        assert.equal(matchesFilter('app-01.log', 'app-??.log'), true);
    });

    it('rejects duplicate create operations', async () => {
        const duplicateDir = await createEntry(sandboxDir, 'duplicate-check', 'directory');
        await createEntry(duplicateDir, 'sample.txt', 'file', 'content');

        await assert.rejects(
            () => createEntry(duplicateDir, 'sample.txt', 'file', 'content'),
            /already exists/
        );

        await deleteEntry(duplicateDir);
    });

    it('applies preview and editor limits for large text and log files', async () => {
        const limitDir = await createEntry(sandboxDir, 'limits', 'directory');
        const textPath = await createEntry(limitDir, 'notes.txt', 'file', 'abcdefghij'.repeat(300));
        const logPath = await createEntry(limitDir, 'events.log', 'file', Array.from({ length: 300 }, (_, index) => `line-${index}`).join('\n'));

        const textPreview = await previewFile(textPath, 64);
        assert.equal(textPreview.encoding, 'utf8');
        assert.equal(textPreview.truncated, true);
        assert.equal(textPreview.content?.length, 64);

        const logPreview = await previewFile(logPath, 80, 5);
        assert.equal(logPreview.kind, 'log');
        assert.equal(logPreview.truncated, true);
        assert.ok(logPreview.tailLines?.at(-1)?.includes('line-299'));

        await assert.rejects(() => readEditableFile(textPath, 64), /exceeds editor limit/);
        await deleteEntry(limitDir);
    });

    it('saves editable files and rejects overwriting uploads', async () => {
        const uploadDir = await createEntry(sandboxDir, 'uploads', 'directory');
        const editablePath = await createEntry(uploadDir, 'editable.txt', 'file', 'before');
        await saveFile(editablePath, 'after');
        assert.equal(await readFile(editablePath, 'utf8'), 'after');

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('first upload'));
                controller.close();
            },
        });

        const uploadPath = await writeUpload(uploadDir, 'upload.txt', stream);
        assert.equal(await readFile(uploadPath, 'utf8'), 'first upload');

        await assert.rejects(
            () => writeUpload(uploadDir, 'upload.txt', new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('duplicate'));
                    controller.close();
                },
            })),
            /already exists/
        );

        await deleteEntry(uploadDir);
    });

    it('rejects saving directories as files', async () => {
        const directoryPath = await createEntry(sandboxDir, 'save-target-dir', 'directory');
        await assert.rejects(() => saveFile(directoryPath, 'updated'), /not a file/);
        await deleteEntry(directoryPath);
    });
});
