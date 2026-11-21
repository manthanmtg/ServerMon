import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DiskScanError,
  GDU_INSTALL_HELP,
  ensureGduExecutable,
} from './gdu-binary';

export { DiskScanError } from './gdu-binary';

const execFileAsync = promisify(execFile);
// Whole-filesystem scans are slow and CPU/memory bound, and the explorer
// already supports polling a running scan, so give them a generous budget.
const SCAN_TIMEOUT_MS = 900_000;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 500_000;
const MAX_DEPTH = 256;
const INVALID_EXPORT = 'Gdu returned an invalid disk scan. Try rescanning the directory.';

export interface DiskScanNode {
  name: string;
  size: number;
  readError: boolean;
  /** Unix seconds. Gdu reports the newest observed modification time for directories. */
  modifiedAt?: number;
  special?: boolean;
  children?: DiskScanNode[];
}

export interface DiskScanTree {
  root: DiskScanNode;
  partial: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseExport(stdout: string, scanPath: string): DiskScanTree {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new DiskScanError(INVALID_EXPORT);
  }
  if (
    !Array.isArray(data) ||
    data.length !== 4 ||
    data[0] !== 1 ||
    data[1] !== 2 ||
    !isRecord(data[2]) ||
    data[2].progname !== 'gdu' ||
    typeof data[2].progver !== 'string' ||
    !Array.isArray(data[3])
  ) {
    throw new DiskScanError(INVALID_EXPORT);
  }

  let entries = 0;
  function parseNode(value: unknown, depth: number): DiskScanNode | null {
    if (depth > MAX_DEPTH) {
      throw new DiskScanError('The disk scan is too deep. Scan a smaller directory.');
    }
    if (++entries > MAX_ENTRIES) {
      throw new DiskScanError('The disk scan contains too many entries. Scan a smaller directory.');
    }
    const directory = Array.isArray(value);
    const record: unknown = directory ? value[0] : value;
    if (!isRecord(record)) {
      throw new DiskScanError(INVALID_EXPORT);
    }

    const {
      name,
      dsize,
      gdu_dsize: totalSize,
      read_error: readError,
      mtime: modifiedAt,
      notreg: special,
    } = record;
    if (
      typeof name !== 'string' ||
      (depth === 0
        ? name !== scanPath
        : !name || name === '.' || name === '..' || /[/\0]/.test(name)) ||
      (dsize !== undefined && !isByteCount(dsize)) ||
      (totalSize !== undefined && (!directory || !isByteCount(totalSize))) ||
      (readError !== undefined && typeof readError !== 'boolean') ||
      (modifiedAt !== undefined &&
        (typeof modifiedAt !== 'number' || !Number.isSafeInteger(modifiedAt))) ||
      (special !== undefined && typeof special !== 'boolean')
    ) {
      throw new DiskScanError(INVALID_EXPORT);
    }

    // Go replaces invalid UTF-8 bytes in JSON strings with U+FFFD. Skip these
    // ambiguous child names so a reconstructed path cannot refer to another file.
    if (depth > 0 && name.includes('\uFFFD')) {
      return null;
    }

    // Directory dsize is the total in v5.39 exports. Later exports use gdu_dsize
    // for the total and reserve dsize for the blocks occupied by the directory itself.
    const size = totalSize ?? dsize;
    if (!isByteCount(size) && directory) {
      throw new DiskScanError(`Gdu did not export directory sizes. ${GDU_INSTALL_HELP}`);
    }
    const node: DiskScanNode = {
      name,
      size: isByteCount(size) ? size : 0,
      readError: readError === true,
    };
    if (special === true) {
      node.special = true;
    }
    if (modifiedAt !== undefined) {
      node.modifiedAt = modifiedAt;
    }
    if (directory) {
      const names = new Set<string>();
      const children: DiskScanNode[] = [];
      for (let index = 1; index < value.length; index++) {
        const child = parseNode(value[index], depth + 1);
        if (!child) {
          node.readError = true;
          continue;
        }
        if (names.has(child.name)) {
          throw new DiskScanError(INVALID_EXPORT);
        }
        names.add(child.name);
        children.push(child);
        node.readError ||= child.readError;
      }
      node.children = children.sort(
        (a, b) => b.size - a.size || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      );
    }
    return node;
  }

  const root = parseNode(data[3], 0);
  if (!root) {
    throw new DiskScanError(INVALID_EXPORT);
  }
  return { root, partial: root.readError };
}

function scanCommandError(error: unknown): DiskScanError {
  if (isRecord(error)) {
    if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'ENOEXEC') {
      return new DiskScanError(`Gdu could not start. ${GDU_INSTALL_HELP}`);
    }
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return new DiskScanError('The disk scan output is too large. Scan a smaller directory.');
    }
    if (error.killed === true) {
      return new DiskScanError('The disk scan timed out. Scan a smaller directory.');
    }
    if (typeof error.stderr === 'string') {
      if (/invalid option -- 'o'|GNU coreutils/i.test(error.stderr)) {
        return new DiskScanError(
          `Disk Explorer requires dundee/gdu, a different tool than GNU du. ${GDU_INSTALL_HELP}`
        );
      }
      if (/unknown flag|unrecognized option|illegal option/i.test(error.stderr)) {
        return new DiskScanError(
          `Gdu does not support the required scan options. ${GDU_INSTALL_HELP}`
        );
      }
    }
  }
  return new DiskScanError('Gdu could not scan this directory. Check that ServerMon can read it.');
}

export async function scanDisk(scanPath: string): Promise<DiskScanTree> {
  let stdout: string;
  const gduExecutable = await ensureGduExecutable();
  try {
    ({ stdout } = await execFileAsync(
      gduExecutable,
      [
        '-x',
        '-o',
        '-',
        '--config-file=/dev/null',
        '--db=',
        '--input-file=',
        '--log-file=/dev/null',
        '--enable-profiling=false',
        '--follow-symlinks=false',
        '--exclusive-size=false',
        '--max-cores=8',
        '--output-attrs=dsize,mtime,notreg',
        '--depth=1',
        '--top=0',
        '--summarize=false',
        '--',
        scanPath,
      ],
      {
        encoding: 'utf8',
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          LC_ALL: 'C',
          // Too small a soft heap limit makes gdu garbage-collect constantly
          // on trees with hundreds of thousands of entries instead of finishing.
          GOMEMLIMIT: '1GiB',
        },
        timeout: SCAN_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
      }
    ));
  } catch (error) {
    throw scanCommandError(error);
  }
  return parseExport(stdout, scanPath);
}
