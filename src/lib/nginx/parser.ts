import type {
  NginxListenDirective,
  NginxLocation,
  NginxRedirect,
  NginxTlsDetails,
  NginxVirtualHost,
} from '@/modules/nginx/types';

interface ServerBlock {
  body: string;
  raw: string;
  sourceLine?: number;
}

function isWordBoundary(value: string | undefined): boolean {
  return value === undefined || !/[A-Za-z0-9_]/.test(value);
}

function skipQuoted(src: string, index: number): number {
  const quote = src[index];
  let i = index + 1;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function skipComment(src: string, index: number): number {
  let i = index;
  while (i < src.length && src[i] !== '\n') i++;
  return i;
}

function findMatchingBrace(src: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(src, i);
      continue;
    }
    if (ch === '#') {
      i = skipComment(src, i);
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
}

function lineNumberAt(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

function extractServerBlocks(src: string): ServerBlock[] {
  const blocks: ServerBlock[] = [];
  let index = 0;

  while (index < src.length) {
    const found = src.indexOf('server', index);
    if (found < 0) break;
    const before = found === 0 ? undefined : src[found - 1];
    const after = src[found + 'server'.length];
    if (!isWordBoundary(before) || !isWordBoundary(after)) {
      index = found + 1;
      continue;
    }

    let brace = found + 'server'.length;
    while (brace < src.length && /\s/.test(src[brace])) brace++;
    if (src[brace] !== '{') {
      index = found + 1;
      continue;
    }

    const close = findMatchingBrace(src, brace);
    if (close < 0) break;
    blocks.push({
      body: src.slice(brace + 1, close),
      raw: src.slice(found, close + 1),
      sourceLine: lineNumberAt(src, found),
    });
    index = close + 1;
  }

  return blocks;
}

function stripInlineComment(line: string): string {
  let inQuote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && line[i - 1] !== '\\') {
      inQuote = inQuote === ch ? null : ch;
      continue;
    }
    if (ch === '#' && !inQuote) return line.slice(0, i);
  }
  return line;
}

function topLevelStatements(body: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let depth = 0;
  let i = 0;

  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'") {
      const end = skipQuoted(body, i);
      buffer += body.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '#') {
      i = skipComment(body, i);
      continue;
    }
    if (ch === '{' && depth === 0) {
      const close = findMatchingBrace(body, i);
      if (close < 0) break;
      buffer = '';
      i = close + 1;
      continue;
    }
    if (ch === '{') {
      depth++;
      buffer += ch;
      i++;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      buffer += ch;
      i++;
      continue;
    }
    if (ch === ';' && depth === 0) {
      const cleaned = stripInlineComment(buffer).trim();
      if (cleaned) statements.push(cleaned);
      buffer = '';
      i++;
      continue;
    }
    buffer += ch;
    i++;
  }

  const cleaned = stripInlineComment(buffer).trim();
  if (cleaned) statements.push(cleaned);
  return statements;
}

function parseDirective(statement: string): { key: string; value: string } | null {
  const match = statement.match(/^([A-Za-z0-9_]+)\s+([\s\S]+)$/);
  if (!match) return null;
  return { key: match[1], value: match[2].trim() };
}

function parseListen(value: string): NginxListenDirective {
  const portMatch = value.match(/(?:^|:)(\d{2,5})(?:\s|$)/);
  return {
    value,
    port: portMatch ? Number(portMatch[1]) : undefined,
    ssl: /\bssl\b/.test(value),
    http2: /\bhttp2\b/.test(value),
    defaultServer: /\bdefault_server\b/.test(value),
  };
}

function extractLocationBlocks(body: string): Array<{ path: string; body: string }> {
  const locations: Array<{ path: string; body: string }> = [];
  let index = 0;
  while (index < body.length) {
    const found = body.indexOf('location', index);
    if (found < 0) break;
    const before = found === 0 ? undefined : body[found - 1];
    const after = body[found + 'location'.length];
    if (!isWordBoundary(before) || !/\s/.test(after ?? '')) {
      index = found + 1;
      continue;
    }
    let cursor = found + 'location'.length;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor++;
    const pathStart = cursor;
    while (cursor < body.length && body[cursor] !== '{') cursor++;
    if (cursor >= body.length) break;
    const path = body.slice(pathStart, cursor).trim();
    const close = findMatchingBrace(body, cursor);
    if (close < 0) break;
    locations.push({ path, body: body.slice(cursor + 1, close) });
    index = close + 1;
  }
  return locations;
}

function parseLocations(body: string): NginxLocation[] {
  return extractLocationBlocks(body).map((location) => {
    const directives: Record<string, string> = {};
    let proxyPass: string | undefined;
    let root: string | undefined;
    for (const statement of topLevelStatements(location.body)) {
      const directive = parseDirective(statement);
      if (!directive) continue;
      directives[directive.key] = directive.value;
      if (directive.key === 'proxy_pass') proxyPass = directive.value;
      if (directive.key === 'root') root = directive.value;
    }
    return {
      path: location.path,
      proxyPass,
      root,
      directives,
    };
  });
}

function parseRedirects(body: string): NginxRedirect[] {
  const redirects: NginxRedirect[] = [];
  const returnRe = /return\s+(\d{3})(?:\s+([^;{}]+))?\s*;/g;
  for (const match of body.matchAll(returnRe)) {
    redirects.push({
      code: Number(match[1]),
      target: match[2]?.trim(),
      raw: match[0].trim(),
    });
  }
  return redirects;
}

function primaryName(serverNames: string[], fallback: string): string {
  return serverNames.find((name) => name && name !== '_') ?? fallback;
}

function isManagedPath(sourcePath: string): boolean {
  return sourcePath.includes('/servermon/');
}

function toVirtualHost(block: ServerBlock, sourcePath: string, index: number): NginxVirtualHost {
  const statements = topLevelStatements(block.body);
  const serverNames: string[] = [];
  const listen: NginxListenDirective[] = [];
  let root = '';
  let certificate: string | undefined;
  let certificateKey: string | undefined;
  let topLevelProxyPass = '';

  for (const statement of statements) {
    const directive = parseDirective(statement);
    if (!directive) continue;
    if (directive.key === 'server_name') {
      serverNames.push(...directive.value.split(/\s+/).filter(Boolean));
    } else if (directive.key === 'listen') {
      listen.push(parseListen(directive.value));
    } else if (directive.key === 'root') {
      root = directive.value;
    } else if (directive.key === 'ssl_certificate') {
      certificate = directive.value;
    } else if (directive.key === 'ssl_certificate_key') {
      certificateKey = directive.value;
    } else if (directive.key === 'proxy_pass') {
      topLevelProxyPass = directive.value;
    }
  }

  const locations = parseLocations(block.body);
  const proxyPass = locations.find((location) => location.proxyPass)?.proxyPass ?? topLevelProxyPass;
  const tls: NginxTlsDetails = {
    enabled: listen.some((entry) => entry.ssl) || Boolean(certificate || certificateKey),
    certificate,
    certificateKey,
    certbotManaged: /managed by Certbot/.test(block.raw),
  };
  const filename = sourcePath.split('/').pop() ?? sourcePath;
  const displayName = primaryName(serverNames, filename);

  return {
    id: `${sourcePath}::${index}`,
    name: filename,
    filename: sourcePath,
    sourcePath,
    sourceLine: block.sourceLine,
    enabled: true,
    loaded: true,
    managed: isManagedPath(sourcePath),
    serverNames,
    primaryServerName: displayName,
    wildcard: serverNames.some((name) => name.startsWith('*.')),
    listenPorts: listen.map((entry) => entry.value),
    listen,
    root,
    sslEnabled: tls.enabled,
    tls,
    proxyPass,
    locations,
    redirects: parseRedirects(block.body),
    warnings: [],
    raw: block.raw,
  };
}

export function parseNginxServerBlocks(raw: string, sourcePath: string): NginxVirtualHost[] {
  return extractServerBlocks(raw).map((block, index) => toVirtualHost(block, sourcePath, index));
}
