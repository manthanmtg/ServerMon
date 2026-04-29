export interface InstallServerMonArgs {
  mongoUri: string;
  port: number;
  skipMongo: boolean;
  allowRoot: boolean;
  sourceDir?: string;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildInstallServerMonCommand(args: InstallServerMonArgs): [string, string[]] {
  if (!args.mongoUri.trim()) {
    throw new Error('MongoDB URI is required');
  }
  const sourceDir = args.sourceDir ?? '/opt/servermon-agent/source';
  const flags = [
    '--unattended',
    '--port "$SERVERMON_INSTALL_PORT"',
    '--mongo-uri "$SERVERMON_INSTALL_MONGO_URI"',
  ];
  if (args.allowRoot) flags.push('--allow-root');
  if (args.skipMongo) flags.push('--skip-mongo');

  return [
    'bash',
    [
      '-lc',
      [`cd ${shellSingleQuote(sourceDir)}`, `./scripts/install.sh ${flags.join(' ')}`].join(' && '),
    ],
  ];
}

export function redactServerMonInstallText(input: string, mongoUri?: string): string {
  let out = input;
  if (mongoUri) {
    out = out.split(mongoUri).join('[redacted-mongodb-uri]');
  }
  return out.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted-mongodb-uri]');
}
