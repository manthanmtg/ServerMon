export interface ParsedFrpProxy {
  name?: string;
  type?: string;
  localIp?: string;
  localPort?: number;
  remotePort?: number;
  subdomain?: string;
  customDomains?: string[];
}

export interface ParsedFrpConfig {
  server?: Record<string, string | number | boolean>;
  proxies: ParsedFrpProxy[];
}

function stripComment(line: string): string {
  // Only treat '#' as a comment when it's outside a quoted string.
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== '\\') {
      inStr = !inStr;
    } else if (!inStr && ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw: string): string | number | boolean {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  return t;
}

function parseArrayOfStrings(raw: string): string[] | null {
  const t = raw.trim();
  if (t.length < 2 || t[0] !== '[' || t[t.length - 1] !== ']') return null;
  const inner = t.slice(1, -1).trim();
  if (inner.length === 0) return [];
  const parts: string[] = [];
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
      if (ch === '"') inStr = false;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === ',') {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim().length > 0) parts.push(buf);
  const out: string[] = [];
  for (const p of parts) {
    const v = p.trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
      out.push(v.slice(1, -1));
    } else {
      return null;
    }
  }
  return out;
}

function assignProxyKey(proxy: ParsedFrpProxy, key: string, raw: string): void {
  const arr = parseArrayOfStrings(raw);
  switch (key) {
    case 'name': {
      const v = parseScalar(raw);
      if (typeof v === 'string') proxy.name = v;
      break;
    }
    case 'type': {
      const v = parseScalar(raw);
      if (typeof v === 'string') proxy.type = v;
      break;
    }
    case 'localIP':
    case 'localIp': {
      const v = parseScalar(raw);
      if (typeof v === 'string') proxy.localIp = v;
      break;
    }
    case 'localPort': {
      const v = parseScalar(raw);
      if (typeof v === 'number') proxy.localPort = v;
      break;
    }
    case 'remotePort': {
      const v = parseScalar(raw);
      if (typeof v === 'number') proxy.remotePort = v;
      break;
    }
    case 'subdomain': {
      const v = parseScalar(raw);
      if (typeof v === 'string') proxy.subdomain = v;
      break;
    }
    case 'customDomains': {
      if (arr) proxy.customDomains = arr;
      break;
    }
    default:
      // Unknown keys are ignored for now.
      break;
  }
}

export function parseFrpConfig(raw: string): ParsedFrpConfig {
  const server: Record<string, string | number | boolean> = {};
  const proxies: ParsedFrpProxy[] = [];
  let currentProxy: ParsedFrpProxy | null = null;

  const lines = raw.split('\n');
  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;
    if (line === '[[proxies]]') {
      currentProxy = {};
      proxies.push(currentProxy);
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const valueRaw = line.slice(eqIdx + 1).trim();
    if (currentProxy) {
      assignProxyKey(currentProxy, key, valueRaw);
    } else {
      const v = parseScalar(valueRaw);
      server[key] = v;
    }
  }

  const result: ParsedFrpConfig = { proxies };
  if (Object.keys(server).length > 0) result.server = server;
  return result;
}

// -------- Nginx --------

export interface ParsedNginxServerBlock {
  serverNames: string[];
  listen: string[];
  locations: Array<{
    path: string;
    proxyPass?: string;
    directives: Record<string, string>;
  }>;
  raw: string;
}

/**
 * Walk `src` and extract top-level `server { ... }` blocks. A "top-level"
 * server block is one whose keyword appears while no block other than `http`
 * is on the stack, which matches real nginx configs where servers live either
 * at the root (our rendered output) or inside the `http` context.
 */
function extractServerBlocks(src: string): string[] {
  const blocks: string[] = [];
  // stack of context names at each open brace, closest on top
  const ctxStack: string[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(src[i])) i++;
    if (i >= len) break;

    // Skip comments (# to end of line)
    if (src[i] === '#') {
      while (i < len && src[i] !== '\n') i++;
      continue;
    }

    // Close brace pops context
    if (src[i] === '}') {
      ctxStack.pop();
      i++;
      continue;
    }

    // Read next "word" which is a directive/block keyword
    const wordStart = i;
    while (i < len && /[A-Za-z0-9_]/.test(src[i])) i++;
    const word = src.slice(wordStart, i);
    if (word.length === 0) {
      // Could not make progress with a word; just skip
      i++;
      continue;
    }

    // Read until we find either `;` (simple directive) or `{` (block open)
    let j = i;
    const depth = 0;
    while (j < len) {
      const ch = src[j];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        j++;
        while (j < len && src[j] !== quote) {
          if (src[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        if (j < len) j++;
        continue;
      }
      if (ch === '#') {
        while (j < len && src[j] !== '\n') j++;
        continue;
      }
      if (ch === ';' && depth === 0) {
        // Simple directive; consume and move on
        i = j + 1;
        break;
      }
      if (ch === '{' && depth === 0) {
        // Block open: find matching close using brace counting with string/comment awareness
        const blockBodyStart = j + 1;
        let k = j + 1;
        let d = 1;
        while (k < len && d > 0) {
          const c = src[k];
          if (c === '"' || c === "'") {
            const quote = c;
            k++;
            while (k < len && src[k] !== quote) {
              if (src[k] === '\\' && k + 1 < len) k += 2;
              else k++;
            }
            if (k < len) k++;
            continue;
          }
          if (c === '#') {
            while (k < len && src[k] !== '\n') k++;
            continue;
          }
          if (c === '{') d++;
          else if (c === '}') d--;
          k++;
        }
        const blockBodyEnd = k - 1; // index of matching '}'
        const body = src.slice(blockBodyStart, blockBodyEnd);
        if (
          word === 'server' &&
          (ctxStack.length === 0 || ctxStack[ctxStack.length - 1] === 'http')
        ) {
          blocks.push(body);
          // Don't descend into server blocks (we parse them separately).
          i = k;
        } else {
          // Descend: push context name
          ctxStack.push(word);
          // Continue parsing inside; leave closing brace for the outer loop by
          // resetting i to blockBodyStart.
          i = blockBodyStart;
        }
        break;
      }
      j++;
    }
    if (j >= len) break;
  }

  return blocks;
}

function parseLocationBlocks(body: string): Array<{
  path: string;
  proxyPass?: string;
  directives: Record<string, string>;
}> {
  const locations: Array<{
    path: string;
    proxyPass?: string;
    directives: Record<string, string>;
  }> = [];

  const len = body.length;
  let i = 0;
  while (i < len) {
    // find next "location" keyword at top level
    const idx = body.indexOf('location', i);
    if (idx < 0) break;
    // Must be at word boundary (preceded by whitespace or start) and followed by whitespace.
    const before = idx === 0 ? ' ' : body[idx - 1];
    const after = body[idx + 'location'.length] ?? '';
    if (!/\s/.test(before) || !/\s/.test(after)) {
      i = idx + 1;
      continue;
    }
    // Read tokens up to `{`
    let k = idx + 'location'.length;
    while (k < len && /\s/.test(body[k])) k++;
    // gather path token (may include modifiers like = ~ ~* ^~ but we keep it simple)
    const pathStart = k;
    while (k < len && body[k] !== '{' && body[k] !== ';') k++;
    if (k >= len || body[k] === ';') {
      i = k + 1;
      continue;
    }
    const pathRaw = body.slice(pathStart, k).trim();
    // Find matching close brace
    const bodyStart = k + 1;
    let bj = bodyStart;
    let d = 1;
    while (bj < len && d > 0) {
      const c = body[bj];
      if (c === '"' || c === "'") {
        const q = c;
        bj++;
        while (bj < len && body[bj] !== q) {
          if (body[bj] === '\\' && bj + 1 < len) bj += 2;
          else bj++;
        }
        if (bj < len) bj++;
        continue;
      }
      if (c === '#') {
        while (bj < len && body[bj] !== '\n') bj++;
        continue;
      }
      if (c === '{') d++;
      else if (c === '}') d--;
      bj++;
    }
    const locBody = body.slice(bodyStart, bj - 1);
    const directives: Record<string, string> = {};
    let proxyPass: string | undefined;

    // Walk locBody, skipping nested blocks entirely, and split top-level
    // statements by `;`. This ensures directives inside a nested `if { ... }`
    // don't pollute our parse, and that top-level directives that follow a
    // nested block are still captured.
    const stmts: string[] = [];
    let buf = '';
    for (let p = 0; p < locBody.length; p++) {
      const c = locBody[p];
      if (c === '"' || c === "'") {
        const q = c;
        buf += c;
        p++;
        while (p < locBody.length && locBody[p] !== q) {
          if (locBody[p] === '\\' && p + 1 < locBody.length) {
            buf += locBody[p] + locBody[p + 1];
            p += 2;
            continue;
          }
          buf += locBody[p];
          p++;
        }
        if (p < locBody.length) buf += locBody[p];
        continue;
      }
      if (c === '#') {
        while (p < locBody.length && locBody[p] !== '\n') p++;
        continue;
      }
      if (c === '{') {
        // Skip the entire nested block and discard the partial preceding
        // token (it's the header of the nested block, e.g. "if (...)").
        let d = 1;
        p++;
        while (p < locBody.length && d > 0) {
          const cc = locBody[p];
          if (cc === '"' || cc === "'") {
            const q = cc;
            p++;
            while (p < locBody.length && locBody[p] !== q) {
              if (locBody[p] === '\\' && p + 1 < locBody.length) p += 2;
              else p++;
            }
            if (p < locBody.length) p++;
            continue;
          }
          if (cc === '#') {
            while (p < locBody.length && locBody[p] !== '\n') p++;
            continue;
          }
          if (cc === '{') d++;
          else if (cc === '}') d--;
          p++;
        }
        // The outer loop's p++ will advance past the closing `}`.
        p--;
        buf = '';
        continue;
      }
      if (c === ';') {
        stmts.push(buf);
        buf = '';
        continue;
      }
      buf += c;
    }
    if (buf.trim().length > 0) stmts.push(buf);

    for (const stmt of stmts) {
      const t = stmt.trim();
      if (t.length === 0) continue;
      const spaceIdx = t.search(/\s/);
      if (spaceIdx < 0) continue;
      const key = t.slice(0, spaceIdx);
      const val = t.slice(spaceIdx + 1).trim();
      if (key === 'proxy_pass') {
        proxyPass = val;
      }
      directives[key] = val;
    }

    const entry: {
      path: string;
      proxyPass?: string;
      directives: Record<string, string>;
    } = {
      path: pathRaw,
      directives,
    };
    if (proxyPass !== undefined) entry.proxyPass = proxyPass;
    locations.push(entry);
    i = bj;
  }

  return locations;
}

export function parseNginxConfig(raw: string): ParsedNginxServerBlock[] {
  const bodies = extractServerBlocks(raw);
  const blocks: ParsedNginxServerBlock[] = [];
  for (const body of bodies) {
    const serverNames: string[] = [];
    const listen: string[] = [];
    // Parse top-level directives
    let i = 0;
    const len = body.length;
    while (i < len) {
      while (i < len && /\s/.test(body[i])) i++;
      if (i >= len) break;
      if (body[i] === '#') {
        while (i < len && body[i] !== '\n') i++;
        continue;
      }
      // find ; or { at depth 0
      let j = i;
      const depth = 0;
      let hitBrace = false;
      while (j < len) {
        const c = body[j];
        if (c === '"' || c === "'") {
          const q = c;
          j++;
          while (j < len && body[j] !== q) {
            if (body[j] === '\\' && j + 1 < len) j += 2;
            else j++;
          }
          if (j < len) j++;
          continue;
        }
        if (c === '#') {
          while (j < len && body[j] !== '\n') j++;
          continue;
        }
        if (c === '{') {
          hitBrace = true;
          break;
        }
        if (c === ';' && depth === 0) {
          break;
        }
        j++;
      }
      if (j >= len) break;
      if (hitBrace) {
        // skip nested block
        let k = j + 1;
        let d = 1;
        while (k < len && d > 0) {
          const c = body[k];
          if (c === '"' || c === "'") {
            const q = c;
            k++;
            while (k < len && body[k] !== q) {
              if (body[k] === '\\' && k + 1 < len) k += 2;
              else k++;
            }
            if (k < len) k++;
            continue;
          }
          if (c === '#') {
            while (k < len && body[k] !== '\n') k++;
            continue;
          }
          if (c === '{') d++;
          else if (c === '}') d--;
          k++;
        }
        i = k;
        continue;
      }
      const stmt = body.slice(i, j).trim();
      i = j + 1;
      if (stmt.length === 0) continue;
      const spaceIdx = stmt.search(/\s/);
      if (spaceIdx < 0) continue;
      const key = stmt.slice(0, spaceIdx);
      const val = stmt.slice(spaceIdx + 1).trim();
      if (key === 'server_name') {
        serverNames.push(...val.split(/\s+/));
      } else if (key === 'listen') {
        listen.push(val);
      }
    }
    const locations = parseLocationBlocks(body);
    blocks.push({
      serverNames,
      listen,
      locations,
      raw: body,
    });
  }
  return blocks;
}

// -------- Conflict detection --------

export interface ConflictReport {
  type: 'frp_proxy_name' | 'nginx_server_name' | 'port_conflict' | 'domain_duplicate';
  detail: string;
}

export interface ExistingState {
  nodeProxyNames: string[];
  publicDomains: string[];
  usedRemotePorts: number[];
}

export function detectConflicts(
  parsed: { frp?: ParsedFrpConfig; nginx?: ParsedNginxServerBlock[] },
  existing: ExistingState
): ConflictReport[] {
  const out: ConflictReport[] = [];

  if (parsed.frp) {
    const existingNames = new Set(existing.nodeProxyNames);
    const existingPorts = new Set(existing.usedRemotePorts);
    const seenNames = new Set<string>();
    const seenPorts = new Set<number>();
    for (const p of parsed.frp.proxies) {
      if (p.name) {
        if (existingNames.has(p.name) || seenNames.has(p.name)) {
          out.push({
            type: 'frp_proxy_name',
            detail: `FRP proxy name already in use: ${p.name}`,
          });
        }
        seenNames.add(p.name);
      }
      if (typeof p.remotePort === 'number') {
        if (existingPorts.has(p.remotePort) || seenPorts.has(p.remotePort)) {
          out.push({
            type: 'port_conflict',
            detail: `Remote port already in use: ${p.remotePort}`,
          });
        }
        seenPorts.add(p.remotePort);
      }
    }
  }

  if (parsed.nginx) {
    const existingDomains = new Set(existing.publicDomains);
    const seen = new Map<string, number>();
    for (const block of parsed.nginx) {
      for (const name of block.serverNames) {
        seen.set(name, (seen.get(name) ?? 0) + 1);
        if (existingDomains.has(name)) {
          out.push({
            type: 'nginx_server_name',
            detail: `Domain already configured: ${name}`,
          });
        }
      }
    }
    for (const [name, count] of seen.entries()) {
      if (count > 1) {
        out.push({
          type: 'domain_duplicate',
          detail: `Duplicate domain in import batch: ${name}`,
        });
      }
    }
  }

  return out;
}
