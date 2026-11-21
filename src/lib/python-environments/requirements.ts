export class PythonEnvironmentError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const identifier = '[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?';
const specifier = '(?:===|==|~=|!=|<=|>=|<|>)\\s*[A-Za-z0-9*][A-Za-z0-9._+!*\\-]*';
const namedRequirement = new RegExp(
  `^${identifier}(?:\\[\\s*${identifier}(?:\\s*,\\s*${identifier})*\\s*\\])?(?:\\s*${specifier}(?:\\s*,\\s*${specifier})*)?$`
);

export function normalizeRequirements(requirements: string) {
  const names: string[] = [];
  for (const [index, line] of requirements.split(/\r?\n/).entries()) {
    const entry = line.split('#', 1)[0].trim();
    if (!entry) continue;
    if (entry.length > 256 || !namedRequirement.test(entry)) {
      throw new PythonEnvironmentError(
        `Requirement line ${index + 1} must be a package name with optional extras and version constraints.`,
        422
      );
    }
    names.push(entry);
  }
  if (names.length > 128) throw new PythonEnvironmentError('Use up to 128 requirements.', 422);
  return names.join('\n');
}
