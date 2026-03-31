import { InstallTemplate, CLI_TOOL_PIPELINE } from '../../types';

export const lazydockerTemplate: InstallTemplate = {
  id: 'lazydocker',
  name: 'lazydocker',
  description: 'Terminal UI for Docker — manage containers, images, volumes, and networks.',
  longDescription: `# lazydocker

A simple terminal UI for both Docker and Docker Compose. Written in Go.

## Features
- View containers, images, volumes, networks, and logs
- Restart, stop, remove containers
- View real-time stats and logs
- Bulk commands
- Custom commands`,
  category: 'cli-tool',
  icon: 'Container',
  tags: ['docker', 'terminal', 'devops', 'containers'],
  defaultPipeline: CLI_TOOL_PIPELINE,
  configSchema: [
    {
      key: 'installDir',
      label: 'Install Directory',
      type: 'string',
      default: '/usr/local/bin',
      required: true,
      description: 'Directory to install the binary into',
    },
  ],
  installMethods: [
    {
      id: 'shell',
      label: 'Install Script (Official)',
      executionMethod: 'shell',
      recommended: true,
      installCommands: [
        'curl https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash',
      ],
    },
    {
      id: 'binary',
      label: 'Binary Download',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing lazydocker..."

LAZYDOCKER_VERSION=$(curl -s https://api.github.com/repos/jesseduffield/lazydocker/releases/latest | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\\1/')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="x86_64" ;;
  aarch64) ARCH="arm64" ;;
esac

curl -fsSL -o /tmp/lazydocker.tar.gz "https://github.com/jesseduffield/lazydocker/releases/download/v\${LAZYDOCKER_VERSION}/lazydocker_\${LAZYDOCKER_VERSION}_Linux_\${ARCH}.tar.gz"
tar -xzf /tmp/lazydocker.tar.gz -C {{config.installDir}} lazydocker
chmod +x {{config.installDir}}/lazydocker
rm -f /tmp/lazydocker.tar.gz

echo "==> lazydocker installed to {{config.installDir}}/lazydocker"
`,
    },
    {
      id: 'package-manager',
      label: 'Package Manager (brew)',
      executionMethod: 'package-manager',
      installCommands: ['lazydocker'],
    },
  ],
  detection: [
    { method: 'command', value: 'lazydocker --version', versionCommand: 'lazydocker --version' },
    { method: 'file', value: '/usr/local/bin/lazydocker' },
  ],
  version: '1.0.0',
  homepage: 'https://github.com/jesseduffield/lazydocker',
  documentationUrl: 'https://github.com/jesseduffield/lazydocker#readme',
};
