import type { Model } from 'mongoose';
import { hashToml } from './toml';

export interface SaveRevisionInput {
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string | null;
  structured: unknown;
  rendered: string;
  createdBy?: string;
}

export interface SaveRevisionResult {
  version: number;
  hash: string;
  diffFromPrevious?: string;
  id: string;
}

interface PreviousRevisionDoc {
  _id: unknown;
  version: number;
  rendered: string;
  hash: string;
}

export async function saveRevision(
  ConfigRevision: Model<unknown>,
  input: SaveRevisionInput
): Promise<SaveRevisionResult> {
  const filter: Record<string, unknown> = { kind: input.kind };
  if (input.targetId !== undefined) filter.targetId = input.targetId;

  const cursor = ConfigRevision.findOne(filter) as unknown as {
    sort: (s: Record<string, 1 | -1>) => {
      lean: () => Promise<PreviousRevisionDoc | null> | PreviousRevisionDoc | null;
    };
  };
  const previous = (await cursor.sort({ version: -1 }).lean()) as PreviousRevisionDoc | null;

  const hash = hashToml(input.rendered);

  if (previous && previous.rendered === input.rendered) {
    return {
      version: previous.version,
      hash: previous.hash,
      id: String(previous._id),
    };
  }

  const version = previous ? previous.version + 1 : 1;
  const diffFromPrevious = previous ? diffLines(previous.rendered, input.rendered) : undefined;

  const doc = {
    kind: input.kind,
    targetId: input.targetId ?? undefined,
    version,
    hash,
    rendered: input.rendered,
    structured: input.structured,
    createdBy: input.createdBy,
    diffFromPrevious,
  };

  const created = (await ConfigRevision.create(doc)) as unknown as {
    _id: unknown;
  };

  return {
    version,
    hash,
    diffFromPrevious,
    id: String(created._id),
  };
}

/**
 * Simple line-by-line diff. Produces a unified-ish output where removed lines
 * (present in `a` but not `b`) are prefixed `-` and added lines (present in
 * `b` but not `a`) are prefixed `+`. Uses longest-common-subsequence alignment
 * so interleaved edits are emitted in reasonable order.
 */
export function diffLines(a: string, b: string): string {
  const aLines = a === '' ? [] : a.split('\n');
  const bLines = b === '' ? [] : b.split('\n');

  // Trim trailing empty line produced by a trailing newline for cleaner output.
  if (aLines.length && aLines[aLines.length - 1] === '') aLines.pop();
  if (bLines.length && bLines[bLines.length - 1] === '') bLines.pop();

  const m = aLines.length;
  const n = bLines.length;

  // LCS dp table.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${aLines[i]}`);
      i++;
    } else {
      out.push(`+${bLines[j]}`);
      j++;
    }
  }
  while (i < m) {
    out.push(`-${aLines[i]}`);
    i++;
  }
  while (j < n) {
    out.push(`+${bLines[j]}`);
    j++;
  }

  return out.length ? out.join('\n') + '\n' : '';
}
