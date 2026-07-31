const REDACTED = '[redacted]';
const SECRET_KEY_PATTERN = /(password|secret|token|key|credential|database_url|mongo_uri)/i;
const ENV_ASSIGNMENT_PATTERN =
  /\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL|DATABASE_URL|MONGO_URI)[A-Z0-9_]*)=([^\s]+)/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? REDACTED : redactUnknown(entry),
    ])
  );
}

export function redactOperationDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const redacted = redactUnknown(details);
  return isRecord(redacted) ? redacted : undefined;
}

export function redactOperationMessage(message: string): string {
  return message.replace(ENV_ASSIGNMENT_PATTERN, (_match, key: string) => `${key}=${REDACTED}`);
}
