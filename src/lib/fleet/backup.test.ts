import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

import { writeBackupSnapshot } from './backup';

function makeModel(docs: unknown[]): { find: ReturnType<typeof vi.fn> } {
  return {
    find: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(docs),
    }),
  };
}

describe('writeBackupSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('creates the destination directory before writing', async () => {
    const nodes = makeModel([{ _id: 'n1' }]);
    await writeBackupSnapshot('/tmp/backup-123', {
      scopes: ['nodes'],
      models: { nodes: nodes as never },
    });
    expect(mockMkdir).toHaveBeenCalledWith('/tmp/backup-123', {
      recursive: true,
    });
  });

  it('writes a JSON file per scope with lean docs', async () => {
    const nodes = makeModel([{ _id: 'n1', slug: 'orion' }]);
    const routes = makeModel([
      { _id: 'r1', domain: 'a.example.com' },
      { _id: 'r2', domain: 'b.example.com' },
    ]);

    await writeBackupSnapshot('/tmp/backup-xyz', {
      scopes: ['nodes', 'publicRoutes'],
      models: {
        nodes: nodes as never,
        publicRoutes: routes as never,
      },
    });

    const scopeCalls = mockWriteFile.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        (c[0].endsWith('/nodes.json') || c[0].endsWith('/publicRoutes.json'))
    );
    expect(scopeCalls).toHaveLength(2);

    const nodesCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith('/nodes.json'));
    expect(nodesCall).toBeDefined();
    const nodesJson = JSON.parse(nodesCall![1] as string);
    expect(nodesJson).toEqual([{ _id: 'n1', slug: 'orion' }]);

    const routesCall = mockWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith('/publicRoutes.json')
    );
    expect(routesCall).toBeDefined();
    const routesJson = JSON.parse(routesCall![1] as string);
    expect(routesJson).toHaveLength(2);
  });

  it('writes a manifest.json with expected keys', async () => {
    const nodes = makeModel([{ _id: 'n1' }]);
    const result = await writeBackupSnapshot('/tmp/backup-manifest', {
      scopes: ['nodes'],
      models: { nodes: nodes as never },
    });

    const manifestCall = mockWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith('/manifest.json')
    );
    expect(manifestCall).toBeDefined();
    const manifest = JSON.parse(manifestCall![1] as string);
    expect(manifest).toHaveProperty('createdAt');
    expect(manifest).toHaveProperty('scopes');
    expect(manifest).toHaveProperty('files');
    expect(manifest).toHaveProperty('totalBytes');
    expect(manifest).toHaveProperty('version');
    expect(manifest.scopes).toEqual(['nodes']);
    expect(manifest.files.nodes).toMatchObject({
      count: 1,
    });
    expect(typeof manifest.files.nodes.path).toBe('string');
    expect(typeof manifest.files.nodes.sizeBytes).toBe('number');

    expect(result.manifestPath).toContain('manifest.json');
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('skips scopes whose model is missing', async () => {
    const nodes = makeModel([{ _id: 'n1' }]);
    await writeBackupSnapshot('/tmp/backup-missing', {
      scopes: ['nodes', 'missing-scope'],
      models: { nodes: nodes as never },
    });
    const missingCall = mockWriteFile.mock.calls.find((c) =>
      String(c[0]).endsWith('/missing-scope.json')
    );
    expect(missingCall).toBeUndefined();
  });

  it('handles empty find results gracefully', async () => {
    const empty = makeModel([]);
    const result = await writeBackupSnapshot('/tmp/backup-empty', {
      scopes: ['nodes'],
      models: { nodes: empty as never },
    });
    const nodesCall = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith('/nodes.json'));
    expect(nodesCall).toBeDefined();
    expect(JSON.parse(nodesCall![1] as string)).toEqual([]);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });
});
