import { InstallTemplate, CLI_TOOL_PIPELINE } from '../../types';

export const htopTemplate: InstallTemplate = {
  id: 'htop',
  name: 'htop',
  description: 'Interactive process viewer and system monitor for the terminal.',
  longDescription: `# htop

htop is an interactive process viewer for Unix systems. It is a text-mode application and requires ncurses. It is designed as an alternative to the Unix program top.

## Features
- Color-coded process list
- Mouse support
- Tree view of processes
- CPU, memory, and swap meters
- Kill processes without entering PID`,
  category: 'cli-tool',
  icon: 'Monitor',
  tags: ['monitoring', 'processes', 'system', 'terminal'],
  defaultPipeline: CLI_TOOL_PIPELINE,
  configSchema: [],
  installMethods: [
    {
      id: 'package-manager',
      label: 'Package Manager',
      executionMethod: 'package-manager',
      recommended: true,
      installCommands: ['htop'],
    },
    {
      id: 'binary',
      label: 'Build from Source',
      executionMethod: 'shell',
      installCommands: [
        'apt-get install -y libncursesw5-dev autotools-dev autoconf automake build-essential',
        'git clone https://github.com/htop-dev/htop.git /tmp/htop-build',
        'cd /tmp/htop-build && ./autogen.sh && ./configure && make && make install',
        'rm -rf /tmp/htop-build',
      ],
    },
  ],
  detection: [
    { method: 'command', value: 'htop --version', versionCommand: 'htop --version' },
    { method: 'file', value: '/usr/bin/htop' },
  ],
  version: '1.0.0',
  homepage: 'https://htop.dev',
  documentationUrl: 'https://htop.dev/docs',
};
