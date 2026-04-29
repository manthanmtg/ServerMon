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

type FrpPublicInterface = Pick<FrpOrchestrator, 'applyRevision' | 'reconcileOnce'>;
type NginxPublicInterface = Pick<
  NginxOrchestrator,
  'writeSnippet' | 'removeSnippet' | 'applyAndReload'
>;

let frpOrch: FrpPublicInterface | null = null;
let nginxOrch: NginxPublicInterface | null = null;

function buildFrp(): FrpOrchestrator {
  const cacheDir = process.env.FLEET_BINARY_CACHE_DIR || '/var/lib/servermon/frp-cache';
  const configDir = process.env.FLEET_FRPS_CONFIG_DIR || '/etc/servermon/frp';
  const version = process.env.FLEET_FRP_VERSION;

  type Deps = ConstructorParameters<typeof FrpOrchestrator>[0];

  return new FrpOrchestrator({
    FrpServerState: FrpServerState as unknown as Deps['FrpServerState'],
    FleetLogEvent: FleetLogEvent as unknown as Deps['FleetLogEvent'],
    binaryCacheDir: cacheDir,
    configDir,
    binaryVersion: version,
  });
}

function buildNginx(): NginxOrchestrator {
  type Deps = ConstructorParameters<typeof NginxOrchestrator>[0];

  return new NginxOrchestrator({
    NginxState: NginxState as unknown as Deps['NginxState'],
    FleetLogEvent: FleetLogEvent as unknown as Deps['FleetLogEvent'],
  });
}

function makeNoopFrp(): FrpPublicInterface {
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

export function getFrpOrchestrator(): FrpPublicInterface {
  if (!frpOrch) {
    try {
      frpOrch = buildFrp();
    } catch (err) {
      log.error('Failed to build FRP orchestrator', err);
      frpOrch = makeNoopFrp();
    }
  }
  return frpOrch;
}

export function getNginxOrchestrator(): NginxPublicInterface {
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
  return nginxOrch;
}

/**
 * Test-only hook to inject orchestrator singletons. Pass `null` to reset.
 */
export function __setOrchestrators__(
  f: FrpPublicInterface | null,
  n: NginxPublicInterface | null
): void {
  frpOrch = f;
  nginxOrch = n;
}
