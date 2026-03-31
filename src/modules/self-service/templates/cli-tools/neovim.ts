import { InstallTemplate, CLI_TOOL_PIPELINE } from '../../types';

export const neovimTemplate: InstallTemplate = {
  id: 'neovim',
  name: 'Neovim',
  description: 'Hyperextensible Vim-based text editor with Lua plugin ecosystem.',
  longDescription: `# Neovim

Neovim is a refactor and continuation of Vim. It aims to improve extensibility and maintainability while keeping full Vim compatibility.

## Features
- Built-in LSP client
- Lua scripting and plugin API
- Treesitter for syntax highlighting
- Async job control
- Terminal emulator built-in`,
  category: 'cli-tool',
  icon: 'FileCode',
  tags: ['editor', 'vim', 'terminal', 'development', 'lua'],
  defaultPipeline: CLI_TOOL_PIPELINE,
  configSchema: [],
  installMethods: [
    {
      id: 'package-manager',
      label: 'Package Manager',
      executionMethod: 'package-manager',
      recommended: true,
      installCommands: ['neovim'],
    },
    {
      id: 'binary',
      label: 'AppImage (Latest Stable)',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Installing Neovim AppImage..."

curl -fsSL -o /tmp/nvim.appimage "https://github.com/neovim/neovim/releases/latest/download/nvim.appimage"
chmod +x /tmp/nvim.appimage
mv /tmp/nvim.appimage /usr/local/bin/nvim

echo "==> Neovim installed to /usr/local/bin/nvim"
nvim --version | head -1
`,
    },
    {
      id: 'script',
      label: 'Build from Source',
      executionMethod: 'script',
      installScript: `#!/bin/bash
set -euo pipefail

echo "==> Building Neovim from source..."

# Install build dependencies
apt-get install -y ninja-build gettext cmake unzip curl build-essential

# Clone and build
git clone https://github.com/neovim/neovim.git /tmp/neovim-build
cd /tmp/neovim-build
git checkout stable
make CMAKE_BUILD_TYPE=Release
make install

# Cleanup
rm -rf /tmp/neovim-build

echo "==> Neovim built and installed successfully."
nvim --version | head -1
`,
    },
  ],
  detection: [
    { method: 'command', value: 'nvim --version', versionCommand: 'nvim --version' },
    { method: 'file', value: '/usr/local/bin/nvim' },
    { method: 'file', value: '/usr/bin/nvim' },
  ],
  version: '1.0.0',
  homepage: 'https://neovim.io',
  documentationUrl: 'https://neovim.io/doc/',
};
