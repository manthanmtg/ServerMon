import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveRevision, diffLines } from './revisions';
import { hashToml } from './toml';

interface FakeModel {
  findOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

function makeModel(previous: unknown): FakeModel {
  const findOne = vi.fn().mockReturnValue({
    sort: () => ({ lean: () => previous }),
  });
  const create = vi.fn().mockImplementation((doc) => ({ _id: 'abc', ...doc }));
  return { findOne, create };
}

describe('diffLines', () => {
  it('returns empty string when inputs match', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toBe('');
  });

  it('prefixes added lines with + and removed lines with -', () => {
    const result = diffLines('a\nb\n', 'a\nc\n');
    expect(result).toContain('-b');
    expect(result).toContain('+c');
  });

  it('handles pure addition', () => {
    const result = diffLines('', 'x\n');
    expect(result).toContain('+x');
  });

  it('handles pure removal', () => {
    const result = diffLines('x\n', '');
    expect(result).toContain('-x');
  });

  it('returns unified-ish output with newlines between lines', () => {
    const result = diffLines('a\nb\nc\n', 'a\nB\nc\n');
    const lines = result.split('\n').filter(Boolean);
    expect(lines.some((l) => l.startsWith('-b'))).toBe(true);
    expect(lines.some((l) => l.startsWith('+B'))).toBe(true);
  });
});

describe('saveRevision', () => {
  let model: FakeModel;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first save gets version 1 when no previous revision exists', async () => {
    model = makeModel(null);
    const rendered = 'bindPort = 7000\n';
    const result = await saveRevision(model as never, {
      kind: 'frps',
      structured: { bindPort: 7000 },
      rendered,
    });
    expect(result.version).toBe(1);
    expect(result.hash).toBe(hashToml(rendered));
    expect(result.diffFromPrevious).toBeUndefined();
    expect(model.create).toHaveBeenCalledTimes(1);
    const doc = model.create.mock.calls[0][0];
    expect(doc.kind).toBe('frps');
    expect(doc.version).toBe(1);
    expect(doc.hash).toBe(hashToml(rendered));
    expect(doc.rendered).toBe(rendered);
  });

  it('second save with different content gets version 2 and a diff', async () => {
    const prev = {
      _id: 'prev-id',
      kind: 'frps',
      version: 1,
      hash: hashToml('bindPort = 7000\n'),
      rendered: 'bindPort = 7000\n',
      structured: { bindPort: 7000 },
    };
    model = makeModel(prev);
    const rendered = 'bindPort = 7001\n';
    const result = await saveRevision(model as never, {
      kind: 'frps',
      structured: { bindPort: 7001 },
      rendered,
    });
    expect(result.version).toBe(2);
    expect(result.hash).toBe(hashToml(rendered));
    expect(result.diffFromPrevious).toBeTruthy();
    expect(result.diffFromPrevious).toContain('-bindPort = 7000');
    expect(result.diffFromPrevious).toContain('+bindPort = 7001');
    const doc = model.create.mock.calls[0][0];
    expect(doc.version).toBe(2);
    expect(doc.diffFromPrevious).toBe(result.diffFromPrevious);
  });

  it('is idempotent: same rendered content returns existing revision without creating', async () => {
    const rendered = 'bindPort = 7000\n';
    const prev = {
      _id: 'prev-id',
      kind: 'frps',
      version: 3,
      hash: hashToml(rendered),
      rendered,
      structured: { bindPort: 7000 },
    };
    model = makeModel(prev);
    const result = await saveRevision(model as never, {
      kind: 'frps',
      structured: { bindPort: 7000 },
      rendered,
    });
    expect(result.version).toBe(3);
    expect(result.hash).toBe(hashToml(rendered));
    expect(result.id).toBe('prev-id');
    expect(model.create).not.toHaveBeenCalled();
  });

  it('queries latest revision by kind + targetId', async () => {
    model = makeModel(null);
    await saveRevision(model as never, {
      kind: 'frpc',
      targetId: 'node-1',
      structured: {},
      rendered: 'x\n',
    });
    expect(model.findOne).toHaveBeenCalledTimes(1);
    const filter = model.findOne.mock.calls[0][0];
    expect(filter.kind).toBe('frpc');
    expect(filter.targetId).toBe('node-1');
  });

  it('forwards createdBy to the created document', async () => {
    model = makeModel(null);
    await saveRevision(model as never, {
      kind: 'nginx',
      structured: {},
      rendered: 'server {}\n',
      createdBy: 'user-1',
    });
    const doc = model.create.mock.calls[0][0];
    expect(doc.createdBy).toBe('user-1');
  });
});
