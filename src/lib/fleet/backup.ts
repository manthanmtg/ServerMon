import fs from 'node:fs/promises';
import path from 'node:path';
import type { Model } from 'mongoose';

export interface BackupScopesData {
  scopes: string[];
  models: Record<string, Model<unknown>>;
}

export interface BackupManifest {
  createdAt: string;
  scopes: string[];
  files: Record<string, { path: string; count: number; sizeBytes: number }>;
  totalBytes: number;
  version: number;
}

export interface BackupResult {
  sizeBytes: number;
  manifestPath: string;
}

/**
 * Writes a JSON snapshot of the given scopes to the destination path. Each
 * scope maps to a model, and the full `.find({}).lean()` result is serialized
 * to `<dest>/<scope>.json`. A `manifest.json` summarizing counts and sizes is
 * written to the destination root. Returns total size (bytes) and manifest
 * path.
 */
export async function writeBackupSnapshot(
  destinationPath: string,
  data: BackupScopesData
): Promise<BackupResult> {
  await fs.mkdir(destinationPath, { recursive: true });

  const files: Record<string, { path: string; count: number; sizeBytes: number }> = {};
  let totalBytes = 0;

  for (const scope of data.scopes) {
    const model = data.models[scope];
    if (!model) continue;

    const docs = await model.find({}).lean();
    const payload = JSON.stringify(docs ?? [], null, 2);
    const filePath = path.join(destinationPath, `${scope}.json`);
    await fs.writeFile(filePath, payload, 'utf8');
    const sizeBytes = Buffer.byteLength(payload, 'utf8');
    files[scope] = {
      path: filePath,
      count: Array.isArray(docs) ? docs.length : 0,
      sizeBytes,
    };
    totalBytes += sizeBytes;
  }

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    scopes: data.scopes,
    files,
    totalBytes,
    version: 1,
  };

  const manifestPath = path.join(destinationPath, 'manifest.json');
  const manifestPayload = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, manifestPayload, 'utf8');
  totalBytes += Buffer.byteLength(manifestPayload, 'utf8');

  return {
    sizeBytes: totalBytes,
    manifestPath,
  };
}
