import type { FrpOrchestrator } from './frpOrchestrator';
import type { NginxOrchestrator } from './nginxOrchestrator';

export interface ApplyEngineDeps {
  frp?: Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'>;
  nginx?: Pick<NginxOrchestrator, 'writeSnippet' | 'removeSnippet' | 'applyAndReload'>;
  ConfigRevision: {
    findById: (id: string) => Promise<RevisionDoc | null> | RevisionDoc | null;
  };
  FrpServerState: {
    findOneAndUpdate: (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => Promise<unknown> | unknown;
  };
  PublicRoute: {
    findByIdAndUpdate: (
      id: string,
      update: Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => Promise<unknown> | unknown;
  };
  Node: {
    findByIdAndUpdate: (
      id: string,
      update: Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => Promise<unknown> | unknown;
  };
  now?: () => Date;
}

export interface ApplyRevisionResult {
  kind: string;
  reloaded: boolean;
  detail?: string;
}

interface RevisionDoc {
  _id: unknown;
  kind: 'frps' | 'frpc' | 'nginx';
  targetId?: string;
  version: number;
  hash: string;
  rendered: string;
  structured: unknown;
  appliedAt?: Date;
  save: () => Promise<unknown>;
}

interface NginxStructured {
  slug?: string;
}

interface FrpcStructured {
  frpcConfig?: unknown;
  proxyRules?: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object';
}

export async function applyRevision(
  revisionId: string,
  deps: ApplyEngineDeps
): Promise<ApplyRevisionResult> {
  const now = deps.now ?? (() => new Date());
  const revision = await deps.ConfigRevision.findById(revisionId);
  if (!revision) {
    throw new Error('revision not found');
  }

  if (revision.kind === 'frps') {
    if (!deps.frp) throw new Error('frp orchestrator is required for frps revisions');
    await deps.frp.applyRevision(revision.rendered, revision.hash);
    const at = now();
    await deps.FrpServerState.findOneAndUpdate(
      { key: 'global' },
      {
        $set: {
          generatedConfigHash: revision.hash,
          configVersion: revision.version,
          lastAppliedAt: at,
        },
      }
    );
    revision.appliedAt = at;
    await revision.save();
    return { kind: 'frps', reloaded: false };
  }

  if (revision.kind === 'frpc') {
    if (!revision.targetId) throw new Error('frpc revision missing targetId');
    const structured = (isObject(revision.structured) ? revision.structured : {}) as FrpcStructured;
    const set: Record<string, unknown> = {};
    if (structured.frpcConfig !== undefined) set.frpcConfig = structured.frpcConfig;
    if (structured.proxyRules !== undefined) set.proxyRules = structured.proxyRules;
    set['generatedToml'] = {
      hash: revision.hash,
      renderedAt: now(),
      version: revision.version,
    };
    await deps.Node.findByIdAndUpdate(revision.targetId, { $set: set });
    revision.appliedAt = now();
    await revision.save();
    return { kind: 'frpc', reloaded: false };
  }

  if (revision.kind === 'nginx') {
    if (!deps.nginx) throw new Error('nginx orchestrator is required for nginx revisions');
    if (!revision.targetId) throw new Error('nginx revision missing targetId');
    const structured = (
      isObject(revision.structured) ? revision.structured : {}
    ) as NginxStructured;
    if (!structured.slug || typeof structured.slug !== 'string') {
      throw new Error('nginx revision missing structured.slug');
    }
    await deps.nginx.writeSnippet(structured.slug, revision.rendered);
    const reload = await deps.nginx.applyAndReload();
    if (!reload.ok) {
      await deps.PublicRoute.findByIdAndUpdate(revision.targetId, {
        $set: {
          status: 'nginx_reload_failed',
          healthStatus: 'down',
          lastError: reload.stderr,
        },
      });
      return { kind: 'nginx', reloaded: false, detail: reload.stderr };
    }

    await deps.PublicRoute.findByIdAndUpdate(revision.targetId, {
      $set: {
        nginxConfigRevisionId: String(revision._id),
        status: 'active',
        healthStatus: 'healthy',
      },
    });
    revision.appliedAt = now();
    await revision.save();
    return { kind: 'nginx', reloaded: true };
  }

  throw new Error(`unknown revision kind: ${String((revision as RevisionDoc).kind)}`);
}
