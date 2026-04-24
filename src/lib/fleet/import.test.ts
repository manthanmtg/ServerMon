import { describe, it, expect } from 'vitest';
import {
  parseFrpConfig,
  parseNginxConfig,
  detectConflicts,
  type ParsedFrpConfig,
  type ParsedNginxServerBlock,
} from './import';

describe('parseFrpConfig', () => {
  it('parses top-level server keys', () => {
    const raw = `bindPort = 7000
vhostHTTPPort = 8080
auth.method = "token"
auth.token = "secret"
subDomainHost = "example.com"`;
    const r = parseFrpConfig(raw);
    expect(r.server?.bindPort).toBe(7000);
    expect(r.server?.vhostHTTPPort).toBe(8080);
    expect(r.server?.['auth.method']).toBe('token');
    expect(r.server?.['auth.token']).toBe('secret');
    expect(r.server?.subDomainHost).toBe('example.com');
    expect(r.proxies).toEqual([]);
  });

  it('parses [[proxies]] sections with type-specific keys', () => {
    const raw = `serverAddr = "1.2.3.4"
serverPort = 7000

[[proxies]]
name = "orion-term"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8001
remotePort = 9001

[[proxies]]
name = "orion-web"
type = "http"
localIP = "127.0.0.1"
localPort = 8080
subdomain = "orion"`;
    const r = parseFrpConfig(raw);
    expect(r.server?.serverAddr).toBe('1.2.3.4');
    expect(r.server?.serverPort).toBe(7000);
    expect(r.proxies.length).toBe(2);
    expect(r.proxies[0].name).toBe('orion-term');
    expect(r.proxies[0].type).toBe('tcp');
    expect(r.proxies[0].localIp).toBe('127.0.0.1');
    expect(r.proxies[0].localPort).toBe(8001);
    expect(r.proxies[0].remotePort).toBe(9001);
    expect(r.proxies[1].name).toBe('orion-web');
    expect(r.proxies[1].type).toBe('http');
    expect(r.proxies[1].subdomain).toBe('orion');
  });

  it('parses customDomains array into proxy entry', () => {
    const raw = `[[proxies]]
name = "svc"
type = "http"
customDomains = ["a.example.com", "b.example.com"]`;
    const r = parseFrpConfig(raw);
    expect(r.proxies[0].customDomains).toEqual(['a.example.com', 'b.example.com']);
  });

  it('ignores blank lines and comments', () => {
    const raw = `# a comment
bindPort = 7000

[[proxies]]
name = "x"
type = "tcp"`;
    const r = parseFrpConfig(raw);
    expect(r.server?.bindPort).toBe(7000);
    expect(r.proxies.length).toBe(1);
  });
});

describe('parseNginxConfig', () => {
  it('extracts a single server block with locations', () => {
    const raw = `server {
  listen 80;
  server_name example.com www.example.com;
  client_max_body_size 10m;
  location /api {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
  }
  location /static {
    proxy_pass http://127.0.0.1:9090;
  }
}`;
    const blocks = parseNginxConfig(raw);
    expect(blocks.length).toBe(1);
    const b = blocks[0];
    expect(b.serverNames).toEqual(['example.com', 'www.example.com']);
    expect(b.listen).toEqual(['80']);
    expect(b.locations.length).toBe(2);
    expect(b.locations[0].path).toBe('/api');
    expect(b.locations[0].proxyPass).toBe('http://127.0.0.1:8080');
    expect(b.locations[0].directives['proxy_set_header']).toBe('Host $host');
    expect(b.locations[1].path).toBe('/static');
    expect(b.locations[1].proxyPass).toBe('http://127.0.0.1:9090');
  });

  it('handles multiple server blocks', () => {
    const raw = `server {
  listen 80;
  server_name one.example.com;
  location / { proxy_pass http://127.0.0.1:1000; }
}
server {
  listen 443 ssl;
  server_name two.example.com;
  location / { proxy_pass http://127.0.0.1:2000; }
}`;
    const blocks = parseNginxConfig(raw);
    expect(blocks.length).toBe(2);
    expect(blocks[0].serverNames).toEqual(['one.example.com']);
    expect(blocks[0].listen).toEqual(['80']);
    expect(blocks[1].serverNames).toEqual(['two.example.com']);
    expect(blocks[1].listen).toEqual(['443 ssl']);
  });

  it('handles nested braces inside location blocks (if blocks)', () => {
    const raw = `server {
  listen 80;
  server_name nested.example.com;
  location / {
    if ($http_user_agent ~* bot) {
      return 403;
    }
    proxy_pass http://127.0.0.1:3000;
  }
}`;
    const blocks = parseNginxConfig(raw);
    expect(blocks.length).toBe(1);
    expect(blocks[0].serverNames).toEqual(['nested.example.com']);
    expect(blocks[0].locations.length).toBe(1);
    expect(blocks[0].locations[0].path).toBe('/');
    expect(blocks[0].locations[0].proxyPass).toBe('http://127.0.0.1:3000');
  });

  it('ignores http/events/global context and extracts only server blocks', () => {
    const raw = `events { worker_connections 1024; }
http {
  server {
    listen 80;
    server_name inside-http.example.com;
    location / { proxy_pass http://127.0.0.1:4000; }
  }
}`;
    const blocks = parseNginxConfig(raw);
    expect(blocks.length).toBe(1);
    expect(blocks[0].serverNames).toEqual(['inside-http.example.com']);
  });
});

describe('detectConflicts', () => {
  it('flags duplicate FRP proxy names', () => {
    const frp: ParsedFrpConfig = {
      proxies: [{ name: 'orion-term' }, { name: 'orion-web' }],
    };
    const conflicts = detectConflicts(
      { frp },
      {
        nodeProxyNames: ['orion-term', 'other'],
        publicDomains: [],
        usedRemotePorts: [],
      }
    );
    const names = conflicts.filter((c) => c.type === 'frp_proxy_name');
    expect(names.length).toBe(1);
    expect(names[0].detail).toContain('orion-term');
  });

  it('flags nginx server_name duplicates against existing domains', () => {
    const nginx: ParsedNginxServerBlock[] = [
      {
        serverNames: ['dup.example.com'],
        listen: ['80'],
        locations: [],
        raw: '',
      },
    ];
    const conflicts = detectConflicts(
      { nginx },
      {
        nodeProxyNames: [],
        publicDomains: ['dup.example.com'],
        usedRemotePorts: [],
      }
    );
    const hits = conflicts.filter((c) => c.type === 'nginx_server_name');
    expect(hits.length).toBe(1);
    expect(hits[0].detail).toContain('dup.example.com');
  });

  it('flags remotePort collisions', () => {
    const frp: ParsedFrpConfig = {
      proxies: [
        { name: 'a', remotePort: 9001 },
        { name: 'b', remotePort: 9002 },
      ],
    };
    const conflicts = detectConflicts(
      { frp },
      {
        nodeProxyNames: [],
        publicDomains: [],
        usedRemotePorts: [9001, 9999],
      }
    );
    const ports = conflicts.filter((c) => c.type === 'port_conflict');
    expect(ports.length).toBe(1);
    expect(ports[0].detail).toContain('9001');
  });

  it('flags duplicate domains within an import batch (domain_duplicate)', () => {
    const nginx: ParsedNginxServerBlock[] = [
      {
        serverNames: ['same.example.com'],
        listen: ['80'],
        locations: [],
        raw: '',
      },
      {
        serverNames: ['same.example.com'],
        listen: ['443'],
        locations: [],
        raw: '',
      },
    ];
    const conflicts = detectConflicts(
      { nginx },
      {
        nodeProxyNames: [],
        publicDomains: [],
        usedRemotePorts: [],
      }
    );
    const dups = conflicts.filter((c) => c.type === 'domain_duplicate');
    expect(dups.length).toBe(1);
    expect(dups[0].detail).toContain('same.example.com');
  });

  it('returns no conflicts for clean input', () => {
    const frp: ParsedFrpConfig = {
      proxies: [{ name: 'fresh', remotePort: 9100 }],
    };
    const nginx: ParsedNginxServerBlock[] = [
      {
        serverNames: ['new.example.com'],
        listen: ['80'],
        locations: [],
        raw: '',
      },
    ];
    const conflicts = detectConflicts(
      { frp, nginx },
      {
        nodeProxyNames: ['existing'],
        publicDomains: ['other.example.com'],
        usedRemotePorts: [9000],
      }
    );
    expect(conflicts).toEqual([]);
  });
});
