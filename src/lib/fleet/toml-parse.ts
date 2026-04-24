export interface ParsedToml {
  top: Record<string, unknown>;
  proxies: Record<string, unknown>[];
}

function unescapeString(s: string): string {
  // s is the content inside the outer quotes (quotes already stripped).
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === '"') {
        out += '"';
        i++;
      } else if (next === '\\') {
        out += '\\';
        i++;
      } else {
        out += ch;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function parseQuotedString(raw: string): string | undefined {
  // raw should start with " and end with " after trimming.
  const t = raw.trim();
  if (t.length < 2 || t[0] !== '"' || t[t.length - 1] !== '"') return undefined;
  return unescapeString(t.slice(1, -1));
}

function parseArrayOfStrings(raw: string): string[] | undefined {
  const t = raw.trim();
  if (t.length < 2 || t[0] !== '[' || t[t.length - 1] !== ']') return undefined;
  const inner = t.slice(1, -1).trim();
  if (inner.length === 0) return [];
  // Split on commas that are not inside a quoted string.
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      if (ch === '\\' && i + 1 < inner.length) {
        buf += ch + inner[i + 1];
        i++;
        continue;
      }
      if (ch === '"') {
        inStr = false;
      }
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) parts.push(buf);
  const result: string[] = [];
  for (const p of parts) {
    const s = parseQuotedString(p);
    if (s === undefined) return undefined;
    result.push(s);
  }
  return result;
}

function parseValue(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t[0] === '"') {
    const s = parseQuotedString(t);
    if (s !== undefined) return s;
  }
  if (t[0] === '[') {
    const arr = parseArrayOfStrings(t);
    if (arr !== undefined) return arr;
  }
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  return t;
}

export function parseRendered(src: string): ParsedToml {
  const top: Record<string, unknown> = {};
  const proxies: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = top;
  let inProxyBlock = false;
  const lines = src.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line === '[[proxies]]') {
      const entry: Record<string, unknown> = {};
      proxies.push(entry);
      current = entry;
      inProxyBlock = true;
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const valueRaw = line.slice(eqIdx + 1);
    const value = parseValue(valueRaw);
    if (inProxyBlock) {
      current[key] = value;
    } else {
      top[key] = value;
    }
  }
  return { top, proxies };
}
