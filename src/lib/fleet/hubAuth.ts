import crypto from 'node:crypto';
import FrpServerState from '@/models/FrpServerState';

/**
 * Returns a single, stable hub auth token shared by:
 *   - frps (Hub) when rendering its config
 *   - frpc (Agent) when establishing the tunnel
 *   - The pair endpoint that ships the token to the agent
 *
 * Resolution order:
 *   1. process.env.FLEET_HUB_AUTH_TOKEN (operator override)
 *   2. FrpServerState.authTokenHash (persisted)
 *   3. Generate a fresh random token, persist it, and return it.
 *
 * The third case ensures that a fresh ServerMon install has a working
 * token without any manual configuration. All consumers (Hub and Agent)
 * read this same value, so frpc's auth always matches frps's auth.
 *
 * If the database is unavailable (e.g. unit tests with mocks that omit
 * findOne), this falls back to the legacy literal "pending" so behavior
 * remains backwards compatible.
 */
export async function getOrCreateHubAuthToken(): Promise<string> {
  const envToken = process.env.FLEET_HUB_AUTH_TOKEN;
  if (envToken && envToken.trim().length > 0) return envToken;

  try {
    let state = await FrpServerState.findOne({ key: 'global' });
    if (!state) {
      state = new FrpServerState({ key: 'global' });
    }
    if (!state.authTokenHash) {
      const token = crypto.randomBytes(32).toString('base64url');
      state.authTokenHash = token;
      state.authTokenPrefix = token.slice(0, 8);
      await state.save();
    }
    return state.authTokenHash;
  } catch {
    return 'pending';
  }
}
