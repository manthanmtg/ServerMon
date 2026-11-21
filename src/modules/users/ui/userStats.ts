export interface UserStats {
  osCount: number;
  webCount: number;
  admins: number;
}

interface SummarizeUserStatsInput {
  osPayload: unknown;
  webPayload: unknown;
}

interface WebUserSummary {
  role?: 'admin' | 'user';
}

function toPayloadArray(payload: unknown): unknown[] {
  return Array.isArray(payload) ? payload : [];
}

function isAdminUser(user: unknown): user is WebUserSummary {
  return (
    typeof user === 'object' &&
    user !== null &&
    'role' in user &&
    (user as Record<string, unknown>).role === 'admin'
  );
}

export function summarizeUserStats({ osPayload, webPayload }: SummarizeUserStatsInput): UserStats {
  const osUsers = toPayloadArray(osPayload);
  const webUsers = toPayloadArray(webPayload);

  return {
    osCount: osUsers.length,
    webCount: webUsers.length,
    admins: webUsers.filter(isAdminUser).length,
  };
}
