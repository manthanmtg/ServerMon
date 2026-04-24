import { describe, it, expect } from 'vitest';
import {
  runChain,
  sanitize,
  CLIENT_DIAG_CHAIN,
  ROUTE_DIAG_CHAIN,
  type DiagnosticStep,
  type ClientDiagCtx,
  type RouteDiagCtx,
} from './diagnostics';

describe('sanitize', () => {
  it('redacts argon2 hashes', () => {
    const s = 'hash: $argon2id$v=19$m=65536,t=3,p=4$abcdefghij$qwertyuiopasdfghjkl';
    expect(sanitize(s)).not.toContain('$argon2id$');
    expect(sanitize(s)).toContain('***');
  });

  it('redacts JWT-like tokens (three dot-separated base64url segments)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0JZ1vXF2c_5zFZsnA';
    const s = `auth: Bearer ${jwt} trailing`;
    expect(sanitize(s)).not.toContain(jwt);
    expect(sanitize(s)).toContain('***');
    expect(sanitize(s)).toContain('trailing');
  });

  it('redacts long base64url strings', () => {
    const longTok = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDEFGHIJKL';
    const s = `token=${longTok}`;
    const out = sanitize(s);
    expect(out).not.toContain(longTok);
    expect(out).toContain('***');
  });

  it('leaves short safe strings alone', () => {
    expect(sanitize('hello world, port 80 closed')).toBe('hello world, port 80 closed');
  });
});

describe('runChain', () => {
  interface Ctx {
    hits: string[];
  }
  const makeStep = (id: string, ok: boolean, detail = 'detail'): DiagnosticStep<Ctx> => ({
    id,
    label: id,
    async run(ctx) {
      ctx.hits.push(id);
      return {
        status: ok ? 'pass' : 'fail',
        evidence: detail,
        likelyCause: ok ? undefined : 'because',
        recommendedFix: ok ? undefined : 'fix it',
      };
    },
  });

  it('executes all steps in order when all pass', async () => {
    const ctx: Ctx = { hits: [] };
    const steps = [makeStep('a', true), makeStep('b', true), makeStep('c', true)];
    const out = await runChain(steps, ctx);
    expect(ctx.hits).toEqual(['a', 'b', 'c']);
    expect(out.map((r) => r.step)).toEqual(['a', 'b', 'c']);
    expect(out.every((r) => r.status === 'pass')).toBe(true);
    expect(out.every((r) => typeof r.durationMs === 'number')).toBe(true);
  });

  it('short-circuits at first fail by default', async () => {
    const ctx: Ctx = { hits: [] };
    const steps = [makeStep('a', true), makeStep('b', false), makeStep('c', true)];
    const out = await runChain(steps, ctx);
    expect(ctx.hits).toEqual(['a', 'b']);
    expect(out).toHaveLength(2);
    expect(out[1].status).toBe('fail');
    expect(out[1].recommendedFix).toBe('fix it');
  });

  it('runs all steps when stopOnFail: false', async () => {
    const ctx: Ctx = { hits: [] };
    const steps = [makeStep('a', true), makeStep('b', false), makeStep('c', true)];
    const out = await runChain(steps, ctx, { stopOnFail: false });
    expect(ctx.hits).toEqual(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
  });

  it('catches thrown errors as status fail', async () => {
    const ctx: Ctx = { hits: [] };
    const steps: DiagnosticStep<Ctx>[] = [
      {
        id: 'boom',
        label: 'boom',
        async run() {
          throw new Error('exploded');
        },
      },
    ];
    const out = await runChain(steps, ctx);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('fail');
    expect(out[0].evidence).toMatch(/exploded/);
  });

  it('sanitizes evidence on each step', async () => {
    const ctx: Ctx = { hits: [] };
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0JZ1vXF2c_5zFZsnA';
    const steps: DiagnosticStep<Ctx>[] = [
      {
        id: 'x',
        label: 'x',
        async run() {
          return { status: 'pass', evidence: `token=${jwt}` };
        },
      },
    ];
    const out = await runChain(steps, ctx);
    expect(out[0].evidence).not.toContain(jwt);
    expect(out[0].evidence).toContain('***');
  });
});

describe('CLIENT_DIAG_CHAIN', () => {
  it('has exactly 7 steps in the correct order', () => {
    const ids = CLIENT_DIAG_CHAIN.map((s) => s.id);
    expect(ids).toEqual([
      'hub.reachable',
      'token.auth',
      'frps.connection',
      'frpc.config',
      'heartbeat.fresh',
      'serviceManager',
      'localCapabilities',
    ]);
  });

  it('each step calls the corresponding ctx method', async () => {
    const calls: string[] = [];
    const ctx: ClientDiagCtx = {
      checkHubReachability: async () => {
        calls.push('hub');
        return { ok: true };
      },
      verifyTokenAuth: async () => {
        calls.push('token');
        return { ok: true };
      },
      checkFrpsConnection: async () => {
        calls.push('frps');
        return { ok: true };
      },
      validateFrpcConfig: async () => {
        calls.push('frpc');
        return { ok: true };
      },
      checkHeartbeatFresh: async () => {
        calls.push('hb');
        return { ok: true };
      },
      checkServiceManager: async () => {
        calls.push('sm');
        return { ok: true };
      },
      checkLocalCapabilities: async () => {
        calls.push('caps');
        return { ok: true };
      },
    };
    const out = await runChain(CLIENT_DIAG_CHAIN, ctx);
    expect(out).toHaveLength(7);
    expect(out.every((r) => r.status === 'pass')).toBe(true);
    expect(calls).toEqual(['hub', 'token', 'frps', 'frpc', 'hb', 'sm', 'caps']);
  });

  it('short-circuits at first failure', async () => {
    const calls: string[] = [];
    const ctx: ClientDiagCtx = {
      checkHubReachability: async () => {
        calls.push('hub');
        return { ok: true };
      },
      verifyTokenAuth: async () => {
        calls.push('token');
        return { ok: false, detail: 'wrong token' };
      },
      checkFrpsConnection: async () => {
        calls.push('frps');
        return { ok: true };
      },
      validateFrpcConfig: async () => {
        calls.push('frpc');
        return { ok: true };
      },
      checkHeartbeatFresh: async () => {
        calls.push('hb');
        return { ok: true };
      },
      checkServiceManager: async () => {
        calls.push('sm');
        return { ok: true };
      },
      checkLocalCapabilities: async () => {
        calls.push('caps');
        return { ok: true };
      },
    };
    const out = await runChain(CLIENT_DIAG_CHAIN, ctx);
    expect(out).toHaveLength(2);
    expect(out[1].status).toBe('fail');
    expect(out[1].recommendedFix).toBeTruthy();
    expect(calls).toEqual(['hub', 'token']);
  });
});

describe('ROUTE_DIAG_CHAIN', () => {
  it('has exactly 8 steps in the correct order', () => {
    const ids = ROUTE_DIAG_CHAIN.map((s) => s.id);
    expect(ids).toEqual([
      'dns',
      'tls',
      'nginx.config',
      'nginx.reloadState',
      'frps.route',
      'frpc.tunnel',
      'remote.localPort',
      'public.url',
    ]);
  });

  it('each step calls the corresponding ctx method', async () => {
    const calls: string[] = [];
    const ctx: RouteDiagCtx = {
      checkDns: async () => {
        calls.push('dns');
        return { ok: true };
      },
      checkTls: async () => {
        calls.push('tls');
        return { ok: true };
      },
      checkNginxConfig: async () => {
        calls.push('ncfg');
        return { ok: true };
      },
      checkNginxReloadState: async () => {
        calls.push('nrel');
        return { ok: true };
      },
      checkFrpsRoute: async () => {
        calls.push('frps');
        return { ok: true };
      },
      checkFrpcTunnel: async () => {
        calls.push('frpc');
        return { ok: true };
      },
      checkRemoteLocalPort: async () => {
        calls.push('rport');
        return { ok: true };
      },
      checkPublicUrl: async () => {
        calls.push('purl');
        return { ok: true };
      },
    };
    const out = await runChain(ROUTE_DIAG_CHAIN, ctx);
    expect(out).toHaveLength(8);
    expect(calls).toEqual(['dns', 'tls', 'ncfg', 'nrel', 'frps', 'frpc', 'rport', 'purl']);
  });
});
