import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { SignJWT } from 'jose';

const rootDir = path.join(os.tmpdir(), 'servermon-file-browser-e2e');
const authDir = path.join(process.cwd(), 'tests/e2e/.auth');
const fixturePath = path.join(process.cwd(), 'tests/e2e/.auth/file-browser-fixture.json');
const settingsPath = path.join(os.tmpdir(), 'servermon-file-browser-settings.json');
const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAX+H0WQAAAABJRU5ErkJggg==',
    'base64'
);

async function resetDir(targetPath) {
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.mkdir(targetPath, { recursive: true });
}

async function createFixtureTree() {
    await resetDir(rootDir);
    await fs.mkdir(path.join(rootDir, 'docs', 'drafts'), { recursive: true });
    await fs.mkdir(path.join(rootDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(rootDir, 'logs'), { recursive: true });
    await fs.mkdir(path.join(rootDir, 'nested', 'deep'), { recursive: true });

    await fs.writeFile(path.join(rootDir, 'README.md'), '# File Browser\n\nSeed content.\n', 'utf8');
    await fs.writeFile(path.join(rootDir, 'config.yaml'), 'name: servermon\nmode: test\n', 'utf8');
    await fs.writeFile(path.join(rootDir, 'binary.bin'), Buffer.from([0, 255, 12, 44, 90, 1]));
    await fs.writeFile(path.join(rootDir, 'images', 'pixel.png'), pngBytes);
    await fs.writeFile(path.join(rootDir, 'logs', 'app.log'), Array.from({ length: 250 }, (_, index) => `line-${index}`).join('\n'), 'utf8');
    await fs.writeFile(path.join(rootDir, 'docs', 'drafts', 'notes.txt'), 'alpha\nbeta\ngamma\n', 'utf8');
    await fs.writeFile(path.join(rootDir, 'large.txt'), '0123456789abcdef'.repeat(40_000), 'utf8');
    await fs.writeFile(path.join(rootDir, 'nested', 'deep', 'inside.txt'), 'deep file', 'utf8');
}

async function writeSettings() {
    const settings = {
        shortcuts: [
            { id: 'root', label: 'Root', path: '/' },
            { id: 'sandbox', label: 'Sandbox', path: rootDir },
            { id: 'logs', label: 'Logs', path: path.join(rootDir, 'logs') },
        ],
        defaultPath: rootDir,
        editorMaxBytes: 1024 * 1024,
        previewMaxBytes: 16 * 1024,
    };

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

async function writeStorageState() {
    await fs.mkdir(authDir, { recursive: true });
    const key = new TextEncoder().encode('playwright-file-browser-secret');
    const token = await new SignJWT({
        user: {
            id: 'playwright-user',
            username: 'playwright',
            role: 'admin',
        },
        expires: new Date(Date.now() + 2 * 60 * 60 * 1000),
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(key);

    await fs.writeFile(
        path.join(authDir, 'session.json'),
        JSON.stringify({
            cookies: [
                {
                    name: 'session',
                    value: token,
                    domain: '127.0.0.1',
                    path: '/',
                    httpOnly: true,
                    secure: false,
                    sameSite: 'Lax',
                },
            ],
            origins: [],
        }, null, 2),
        'utf8'
    );
}

export default async function globalSetup() {
    await createFixtureTree();
    await writeSettings();
    await writeStorageState();
    await fs.writeFile(fixturePath, JSON.stringify({ rootDir }, null, 2), 'utf8');
}
