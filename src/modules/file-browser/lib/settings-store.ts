import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import connectDB from '@/lib/db';
import FileBrowserSettingsModel from '@/models/FileBrowserSettings';
import { defaultShortcuts, resolveBrowserPath } from './file-browser';

export interface StoredFileBrowserShortcut {
    id: string;
    label: string;
    path: string;
}

export interface StoredFileBrowserSettings {
    shortcuts: StoredFileBrowserShortcut[];
    defaultPath: string;
    editorMaxBytes: number;
    previewMaxBytes: number;
}

const SETTINGS_ID = 'file-browser-settings';
const FALLBACK_SETTINGS_PATH = path.join(os.tmpdir(), 'servermon-file-browser-settings.json');

function defaultSettings(): StoredFileBrowserSettings {
    return {
        shortcuts: defaultShortcuts(),
        defaultPath: '/',
        editorMaxBytes: 1024 * 1024,
        previewMaxBytes: 512 * 1024,
    };
}

function normalizeShortcut(shortcut: StoredFileBrowserShortcut): StoredFileBrowserShortcut {
    return {
        id: shortcut.id.trim(),
        label: shortcut.label.trim(),
        path: resolveBrowserPath(shortcut.path),
    };
}

function normalizeSettings(input: Partial<StoredFileBrowserSettings>): StoredFileBrowserSettings {
    const defaults = defaultSettings();

    return {
        shortcuts: (input.shortcuts?.length ? input.shortcuts : defaults.shortcuts).map(normalizeShortcut),
        defaultPath: input.defaultPath ? resolveBrowserPath(input.defaultPath) : defaults.defaultPath,
        editorMaxBytes: input.editorMaxBytes || defaults.editorMaxBytes,
        previewMaxBytes: input.previewMaxBytes || defaults.previewMaxBytes,
    };
}

async function readFallbackSettings(): Promise<StoredFileBrowserSettings> {
    try {
        const raw = await fs.readFile(FALLBACK_SETTINGS_PATH, 'utf8');
        return normalizeSettings(JSON.parse(raw) as StoredFileBrowserSettings);
    } catch {
        const defaults = defaultSettings();
        await writeFallbackSettings(defaults);
        return defaults;
    }
}

async function writeFallbackSettings(settings: StoredFileBrowserSettings): Promise<StoredFileBrowserSettings> {
    await fs.mkdir(path.dirname(FALLBACK_SETTINGS_PATH), { recursive: true });
    await fs.writeFile(FALLBACK_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    return settings;
}

export async function loadFileBrowserSettings(): Promise<StoredFileBrowserSettings> {
    try {
        await connectDB();
        let settings = await FileBrowserSettingsModel.findById(SETTINGS_ID).lean();
        if (!settings) {
            const created = await FileBrowserSettingsModel.create({
                _id: SETTINGS_ID,
                ...defaultSettings(),
            });
            settings = created.toObject();
        }
        return normalizeSettings({
            shortcuts: settings.shortcuts,
            defaultPath: settings.defaultPath,
            editorMaxBytes: settings.editorMaxBytes,
            previewMaxBytes: settings.previewMaxBytes,
        });
    } catch {
        return readFallbackSettings();
    }
}

export async function saveFileBrowserSettings(update: Partial<StoredFileBrowserSettings>): Promise<StoredFileBrowserSettings> {
    const nextSettings = normalizeSettings(update);

    try {
        await connectDB();
        const settings = await FileBrowserSettingsModel.findByIdAndUpdate(
            SETTINGS_ID,
            { $set: nextSettings },
            { new: true, upsert: true }
        ).lean();

        return normalizeSettings({
            shortcuts: settings?.shortcuts,
            defaultPath: settings?.defaultPath,
            editorMaxBytes: settings?.editorMaxBytes,
            previewMaxBytes: settings?.previewMaxBytes,
        });
    } catch {
        return writeFallbackSettings(nextSettings);
    }
}
