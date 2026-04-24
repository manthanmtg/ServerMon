/**
 * Lazy singleton accessors for FrpOrchestrator and NginxOrchestrator.
 *
 * At runtime these are constructed from environment variables on first use.
 * If the required environment is not present (e.g. `FLEET_BINARY_CACHE_DIR`),
 * a no-op orchestrator is returned that only logs a warning. Tests may
 * override the instances via `__setOrchestrators__`.
 */
import { createLogger } from '@/lib/logger';
import FrpServerState from '@/models/FrpServerState';
import NginxState from '@/models/NginxState';
import FleetLogEvent from '@/models/FleetLogEvent';
import { FrpOrchestrator } from './frpOrchestrator';
import { NginxOrchestrator } from './nginxOrchestrator';

const log = createLogger('fleet:orchestrators');

let frpOrch: unknown = null;
let nginxOrch: unknown = null;

function buildFrp(): unknown {
  const cacheDir = process.env.FLEET_BINARY_CACHE_DIR || '/var/lib/servermon/frp-cache';
  const configDir = process.env.FLEET_FRPS_CONFIG_DIR || '/etc/servermon/frp';
  const version = process.env.FLEET_FRP_VERSION;

  return new FrpOrchestrator({
    FrpServerState: FrpServerState as unknown as ConstructorParameters<
      typeof FrpOrchestrator
    >[0]['FrpServerState'],
    FleetLogEvent: FleetLogEvent as unknown as ConstructorParameters<
      typeof FrpOrchestrator
    >[0]['FleetLogEvent'],
    binaryCacheDir: cacheDir,
    configDir,
    binaryVersion: version,
  });
}

function buildNginx(): unknown {
  return new NginxOrchestrator({
    NginxState: NginxState as unknown as ConstructorParameters<
      typeof NginxOrchestrator
    >[0]['NginxState'],
    FleetLogEvent: FleetLogEvent as unknown as ConstructorParameters<
      typeof NginxOrchestrator
    >[0]['FleetLogEvent'],
  });
}

function makeNoopFrp(): Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'> {
  return {
    applyRevision: async () => {
      log.warn('FRP orchestrator not configured; applyRevision is a no-op');
    },
    reconcileOnce: async () => {
      log.warn('FRP orchestrator not configured; reconcileOnce is a no-op');
      return { action: 'none' as const };
    },
  };
}

export function getFrpOrchestrator(): Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'> {
  if (!frpOrch) {
    try {
      frpOrch = buildFrp();
    } catch (err) {
      log.error('Failed to build FRP orchestrator', err);
      frpOrch = makeNoopFrp();
    }
  }
  return frpOrch as Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'>;
}

export function getNginxOrchestrator(): Pick<
  NginxOrchestrator,
  'writeSnippet' | 'removeSnippet' | 'applyAndReload'
> {
  if (!nginxOrch) {
    try {
      nginxOrch = buildNginx();
    } catch (err) {
      log.error('Failed to build Nginx orchestrator', err);
      nginxOrch = {
        writeSnippet: async () => {
          throw new Error('nginx orchestrator unavailable');
        },
        removeSnippet: async () => {
          throw new Error('nginx orchestrator unavailable');
        },
        applyAndReload: async () => ({ ok: false, stderr: 'nginx orchestrator unavailable' }),
      };
    }
  }
  return nginxOrch as Pick<NginxOrchestrator, 'writeSnippet' | 'removeSnippet' | 'applyAndReload'>;
}

/**
 * Test-only hook to inject orchestrator singletons. Pass `null` to reset.
 */
export function __setOrchestrators__(f: unknown, n: unknown): void {
  frpOrch = f;
  nginxOrch = n;
}
