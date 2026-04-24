/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { NodeZodSchema } from '@/models/Node';
import { generatePairingToken, hashPairingToken, verifyPairingToken } from '@/lib/fleet/pairing';
import { renderFrpcToml, hashToml } from '@/lib/fleet/toml';
import { parseRendered } from '@/lib/fleet/toml-parse';
import { applyRevision, type ApplyEngineDeps } from '@/lib/fleet/applyEngine';

interface FakeRevision {
  _id: string;
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string;
  version: number;
  hash: string;
  rendered: string;
  structured: Record<string, unknown>;
  appliedAt?: Date;
  save: ReturnType<typeof vi.fn>;
}

describe('onboarding flow: node create -> token -> frpc.toml -> parse-back -> apply', () => {
  it('round-trips a full node lifecycle with no real I/O', async () => {
    // 1. Node creation via zod schema (simulates the POST /api/fleet/nodes body parse).
    const node = NodeZodSchema.parse({
      name: 'Orion',
      slug: 'orion',
      description: 'Build machine',
      tags: ['prod', 'linux'],
      proxyRules: [
        {
          name: 'ssh',
          type: 'tcp',
          localIp: '127.0.0.1',
          localPort: 22,
          remotePort: 22022,
        },
        {
          name: 'web',
          type: 'http',
          localIp: '127.0.0.1',
          localPort: 3000,
          subdomain: 'orion-web',
        },
      ],
    });

    expect(node.status).toBe('unpaired');
    expect(node.proxyRules).toHaveLength(2);

    // 2. Pairing token generation + hashing + verification round-trip.
    const token = generatePairingToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    const tokenHash = await hashPairingToken(token);
    expect(tokenHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPairingToken(token, tokenHash)).toBe(true);
    expect(await verifyPairingToken('not-the-token', tokenHash)).toBe(false);

    // 3. Render frpc.toml with the node + hub config.
    const authToken = 'hub-auth-xyz';
    const rendered = renderFrpcToml({
      serverAddr: 'hub.example.com',
      serverPort: 7000,
      authToken,
      node,
    });
    const hash1 = hashToml(rendered);
    // Same input -> same hash (stable).
    expect(hashToml(rendered)).toBe(hash1);
    // Different input -> different hash.
    expect(hashToml(rendered + ' ')).not.toBe(hash1);

    // 4. Parse-back verification: the rendered TOML must contain the expected
    //    proxies and top-level auth/server directives.
    const parsed = parseRendered(rendered);
    expect(parsed.top['serverAddr']).toBe('hub.example.com');
    expect(parsed.top['serverPort']).toBe(7000);
    expect(parsed.top['auth.token']).toBe(authToken);
    expect(parsed.top['transport.tls.enable']).toBe(true);
    expect(parsed.proxies).toHaveLength(2);
    const ssh = parsed.proxies.find((p) => p.name === 'orion-ssh');
    expect(ssh).toBeDefined();
    expect(ssh?.type).toBe('tcp');
    expect(ssh?.localPort).toBe(22);
    expect(ssh?.remotePort).toBe(22022);
    const web = parsed.proxies.find((p) => p.name === 'orion-web');
    expect(web).toBeDefined();
    expect(web?.type).toBe('http');
    expect(web?.subdomain).toBe('orion-web');

    // 5. applyRevision against mocked static models. The frpc revision should
    //    push the structured config onto the Node document.
    const revision: FakeRevision = {
      _id: 'rev-frpc-1',
      kind: 'frpc',
      targetId: 'node-object-id',
      version: 1,
      hash: hash1,
      rendered,
      structured: {
        frpcConfig: node.frpcConfig,
        proxyRules: node.proxyRules,
      },
      save: vi.fn().mockResolvedValue(undefined),
    };

    const nodeFindByIdAndUpdate = vi.fn().mockResolvedValue(null);
    const frpFindOneAndUpdate = vi.fn().mockResolvedValue(null);
    const routeFindByIdAndUpdate = vi.fn().mockResolvedValue(null);
    const deps: ApplyEngineDeps = {
      ConfigRevision: { findById: vi.fn().mockResolvedValue(revision) },
      FrpServerState: { findOneAndUpdate: frpFindOneAndUpdate },
      PublicRoute: { findByIdAndUpdate: routeFindByIdAndUpdate },
      Node: { findByIdAndUpdate: nodeFindByIdAndUpdate },
    };

    const result = await applyRevision('rev-frpc-1', deps);
    expect(result.kind).toBe('frpc');
    expect(result.reloaded).toBe(false);
    expect(nodeFindByIdAndUpdate).toHaveBeenCalledWith(
      'node-object-id',
      expect.objectContaining({
        $set: expect.objectContaining({
          frpcConfig: node.frpcConfig,
          proxyRules: node.proxyRules,
          generatedToml: expect.objectContaining({ hash: hash1, version: 1 }),
        }),
      })
    );
    expect(revision.save).toHaveBeenCalled();
    expect(revision.appliedAt).toBeInstanceOf(Date);

    // Other orchestrators should not have been touched for an frpc revision.
    expect(frpFindOneAndUpdate).not.toHaveBeenCalled();
    expect(routeFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid node payloads at the zod boundary before any token/toml work', () => {
    expect(() => NodeZodSchema.parse({ name: 'x', slug: 'Has Spaces' })).toThrow();
    expect(() =>
      NodeZodSchema.parse({
        name: 'x',
        slug: 'ok',
        proxyRules: [
          {
            // uppercase name violates the lowercase-hyphen regex.
            name: 'BAD_NAME',
            type: 'tcp',
            localPort: 22,
          },
        ],
      })
    ).toThrow();
  });
});
