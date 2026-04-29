import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures: string[] = [];

function read(relativePath: string): string {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath}: file is missing`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function requireContains(file: string, needle: string, reason: string): void {
  const text = read(file);
  if (!text.includes(needle)) {
    failures.push(`${file}: missing ${JSON.stringify(needle)} (${reason})`);
  }
}

function requireNotContains(file: string, needle: string, reason: string): void {
  const text = read(file);
  if (text.includes(needle)) {
    failures.push(`${file}: unexpected ${JSON.stringify(needle)} (${reason})`);
  }
}

function requireRegex(file: string, regex: RegExp, reason: string): void {
  const text = read(file);
  if (!regex.test(text)) {
    failures.push(`${file}: failed ${regex} (${reason})`);
  }
}

function requireBashSyntax(file: string): void {
  try {
    execFileSync('bash', ['-n', path.join(root, file)], { stdio: 'pipe' });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr)
        : String(error);
    failures.push(`${file}: bash -n failed\n${detail}`);
  }
}

function requireWorkflowPin(file: string): void {
  const text = read(file);
  const unpinned = [...text.matchAll(/uses:\s*([^@\s]+\/[^@\s]+)@([^\s#]+)/g)].filter(
    ([, , ref]) => !/^[a-f0-9]{40}$/.test(ref)
  );
  for (const [, action, ref] of unpinned) {
    failures.push(`${file}: action ${action}@${ref} is not pinned to a commit SHA`);
  }
}

function requireWorkflowRunnerPin(file: string): void {
  const text = read(file);
  if (text.includes('runs-on: ubuntu-latest')) {
    failures.push(`${file}: use ubuntu-24.04 instead of ubuntu-latest`);
  }
}

function checkReleaseWorkflow(): void {
  const file = '.github/workflows/release.yml';
  requireContains(file, "tags:\n      - 'v*'", 'release must trigger on v* tags only');
  requireNotContains(file, 'workflow_dispatch', 'manual release publishing is intentionally disabled');
  requireContains(file, 'pnpm check:release-contract', 'release must validate installer contract');
  requireContains(file, 'fail-fast: false', 'native build matrix should finish all targets');
  for (const target of ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64']) {
    const [platform, arch] = target.split('-');
    requireContains(file, `platform: ${platform}`, `release matrix must include ${target}`);
    requireContains(file, `arch: ${arch}`, `release matrix must include ${target}`);
    requireContains(file, `servermon-hub-$TARGET.tar.gz`, 'hub artifact naming must stay stable');
    requireContains(file, `servermon-agent-$TARGET.tar.gz`, 'agent artifact naming must stay stable');
  }
  requireContains(file, 'sha256sum *.tar.gz > SHA256SUMS', 'release must publish checksums');
  requireContains(file, 'release-assets/SHA256SUMS', 'release must upload checksum manifest');
}

function checkInstallerContract(): void {
  const installer = 'src/lib/fleet/install-script.ts';
  requireContains(installer, 'INSTALL_MODE="release"', 'fleet curl installer must default to release artifacts');
  requireContains(installer, '--release [latest|vX.Y.Z]', 'release mode must be user-visible');
  requireContains(installer, '--version vX.Y.Z', 'pinned release installs must stay supported');
  requireContains(installer, '--release-base-url URL', 'release mirror installs must stay supported');
  requireContains(installer, '--build-from-source', 'source install fallback must stay supported');
  requireContains(installer, '--source-ref REF', 'source ref override must stay supported');
  requireContains(installer, 'servermon-agent-$PLATFORM_NAME-$ARCH_NAME.tar.gz', 'agent release asset name');
  requireContains(installer, 'SHA256SUMS', 'agent release installs must verify checksums');
  requireContains(installer, 'sha256sum -c', 'Linux checksum verification required');
  requireContains(installer, 'shasum -a 256 -c', 'macOS checksum verification required');
  requireContains(installer, 'SERVERMON_AGENT_INSTALL_MODE=$mode', 'agent install metadata must preserve mode');
  requireContains(installer, 'SERVERMON_AGENT_VERSION_TARGET=$VERSION_TARGET', 'agent install metadata must preserve version target');
  requireContains(installer, 'SERVERMON_AGENT_RELEASE_BASE_URL=$RELEASE_BASE_URL', 'agent install metadata must preserve release base URL');
  requireContains(installer, 'SERVERMON_AGENT_SOURCE_REF=$SOURCE_REF', 'agent install metadata must preserve source ref');
}

function checkAgentUpdateContract(): void {
  const updater = 'src/lib/fleet/agentUpdateCommand.ts';
  requireContains(updater, "export type AgentUpdateMode = 'auto' | 'release' | 'source'", 'agent update modes');
  requireContains(updater, 'SERVERMON_AGENT_INSTALL_MODE', 'agent updater must read install metadata');
  requireContains(updater, 'servermon-agent-$PLATFORM_NAME-$ARCH_NAME.tar.gz', 'agent updater release asset name');
  requireContains(updater, 'SHA256SUMS', 'agent updater must verify checksums');
  requireContains(updater, 'install_from_release', 'agent updater release path');
  requireContains(updater, 'install_from_source', 'agent updater source path');
  requireContains(updater, 'systemctl restart ${serviceName}', 'agent updater must restart service');
  requireContains('src/lib/fleet/agentClient.ts', "'agent.update.log'", 'agent update output must be observable');
  requireContains('src/lib/fleet/agentClient.ts', "stdio: ['ignore', 'pipe', 'pipe']", 'agent update stdout/stderr must be captured');
}

function checkServerMonInstallUpdateContract(): void {
  const command = 'src/lib/fleet/servermonAgentCommands.ts';
  requireContains(command, 'servermon-hub-$PLATFORM_NAME-$ARCH_NAME.tar.gz', 'hub release asset name');
  requireContains(command, 'SHA256SUMS', 'hub release install must verify checksums');
  requireContains(command, 'run_installer release --prebuilt', 'hub release install must skip local build');
  requireContains(command, 'install_from_source', 'hub source fallback must stay supported');

  const install = 'scripts/install.sh';
  requireBashSyntax(install);
  requireContains(install, '--prebuilt', 'prebuilt installer flag must exist');
  requireContains(install, 'Prebuilt application detected; skipping pnpm install and build', 'prebuilt must skip build');
  requireContains(install, 'SERVERMON_INSTALL_MODE=${SERVERMON_INSTALL_MODE}', 'hub install metadata must preserve mode');
  requireContains(install, 'SERVERMON_VERSION_TARGET=${SERVERMON_VERSION_TARGET}', 'hub install metadata must preserve version target');
  requireContains(install, 'SERVERMON_RELEASE_BASE_URL=${SERVERMON_RELEASE_BASE_URL}', 'hub install metadata must preserve release base URL');
  requireContains(install, 'SERVERMON_SOURCE_REF=${SERVERMON_SOURCE_REF}', 'hub install metadata must preserve source ref');

  const updater = 'scripts/update-servermon.sh';
  requireBashSyntax(updater);
  requireContains(updater, 'SERVERMON_INSTALL_MODE', 'hub updater must read install mode');
  requireContains(updater, 'run_release_update', 'hub updater release path must exist');
  requireContains(updater, 'servermon-hub-${PLATFORM_NAME}-${ARCH_NAME}.tar.gz', 'hub updater release asset name');
  requireContains(updater, 'SHA256SUMS', 'hub updater must verify checksums');
  requireContains(updater, '--prebuilt --use-existing-values', 'release updater must use prebuilt upgrade path');
}

function checkCiHardening(): void {
  for (const file of [
    '.github/workflows/build.yml',
    '.github/workflows/test.yml',
    '.github/workflows/quality.yml',
    '.github/workflows/release.yml',
    '.github/workflows/auto-tag.yml',
  ]) {
    requireWorkflowPin(file);
    requireWorkflowRunnerPin(file);
  }
  requireContains('.github/workflows/quality.yml', 'pnpm check:release-contract', 'PR quality gate must include release contract');
  requireContains('package.json', '"check:release-contract"', 'package script must expose release contract check');
}

function checkTestsCoverContracts(): void {
  requireContains('src/lib/fleet/install-script.test.ts', 'SHA256SUMS', 'fleet installer checksum test');
  requireContains('src/lib/fleet/agentUpdateCommand.test.ts', 'SHA256SUMS', 'agent updater checksum test');
  requireContains('src/lib/fleet/servermonAgentCommands.test.ts', 'servermon-hub-$PLATFORM_NAME-$ARCH_NAME.tar.gz', 'hub release install test');
  requireRegex(
    'src/modules/fleet/ui/details/NodeServerMonPanel.test.tsx',
    /installMode:\s*'release'[\s\S]*releaseBaseUrl:/,
    'UI must test configurable release install options'
  );
}

checkReleaseWorkflow();
checkInstallerContract();
checkAgentUpdateContract();
checkServerMonInstallUpdateContract();
checkCiHardening();
checkTestsCoverContracts();

if (failures.length > 0) {
  console.error('Release contract check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Release contract check passed.');
