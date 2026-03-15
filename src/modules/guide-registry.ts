import { ModuleGuide } from '@/types/module';

export interface ModuleGuideItem {
  id: string;
  name: string;
  guide: ModuleGuide;
}

export const moduleGuides: ModuleGuideItem[] = [
  {
    id: 'guide',
    name: 'User Guide',
    guide: {
      title: 'ServerMon Knowledge Center',
      description:
        'Everything you need to monitor and manage your infrastructure: real-time metrics, web terminal, Docker, file browser, services, and more.',
      sections: [
        {
          title: 'What is ServerMon?',
          content:
            'ServerMon is a secure, self-hosted server monitoring and management platform. It provides a single web interface for real-time metrics, a web terminal, process management, Docker, disk and network monitoring, file browsing, systemd services, cron jobs, and more. All routes are protected by default; only /login and /setup are public.',
          icon: 'Info',
        },
        {
          title: 'Getting Started',
          content:
            'Start with the Dashboard for a high-level overview of CPU, memory, and system health. Use the sidebar to open any module: Terminal for a shell, Processes for running processes, File Browser for the filesystem, Docker for containers and images, and so on. Switch themes and settings from the Settings page.',
          icon: 'Compass',
        },
        {
          title: 'Managing the Service',
          content:
            'On a production install, ServerMon runs as a systemd service. Check status: sudo systemctl status servermon. View logs: sudo journalctl -u servermon -f. Restart after config changes: sudo systemctl restart servermon. Uninstall: sudo ./scripts/install.sh --uninstall.',
          icon: 'Activity',
        },
        {
          title: 'Configuration',
          content:
            'Runtime config is in /etc/servermon/env (production) or .env.local (development). Key variables: MONGO_URI (required), JWT_SECRET (required), PORT (default 8912), NODE_ENV, LOG_LEVEL. Restart the service after editing env.',
          icon: 'LayoutDashboard',
        },
        {
          title: 'Upgrading',
          content:
            'To upgrade an existing install: pull the latest code, then run sudo ./scripts/install.sh again. Your env and data are preserved. For scripted upgrades, use --use-existing-values to skip prompts. Optional: use /opt/servermon/scripts/update-servermon.sh for automated updates (e.g. from cron).',
          icon: 'Compass',
        },
        {
          title: 'More help',
          content:
            'See DEPLOY.md in the repo for full deployment options, SSL, remote MongoDB, troubleshooting, and logging. For development and contribution rules, see AGENTS.md.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    guide: {
      title: 'Dashboard',
      description: 'Your at-a-glance view of system health and live metrics.',
      sections: [
        {
          title: 'Overview',
          content:
            'The dashboard shows real-time CPU and memory usage, system health, and other widgets. Data is streamed via a single Server-Sent Events (SSE) connection shared by all widgets—no need to open multiple connections.',
          icon: 'LayoutDashboard',
        },
        {
          title: 'Widgets',
          content:
            'Each widget is wrapped in an error boundary, so one failing module does not take down the page. If a widget shows an error, check the browser console and server logs (e.g. journalctl -u servermon) for details.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    guide: {
      title: 'Terminal',
      description: 'Secure, interactive web shell powered by xterm.js and node-pty.',
      sections: [
        {
          title: 'Usage',
          content:
            'The terminal gives you a full PTY session on the server. Use it like a local terminal: run commands, edit files with nano/vim, and manage services. Sessions are authenticated; only logged-in users can access the terminal.',
          icon: 'Terminal',
        },
        {
          title: 'Shortcuts & Behavior',
          content:
            'Use standard keyboard shortcuts for copy and paste. The terminal supports resizing and scrollback. Connection is over the same HTTPS (or HTTP) as the rest of the app; no separate SSH port is required.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'processes',
    name: 'Processes',
    guide: {
      title: 'Processes',
      description: 'View, search, and manage running processes.',
      sections: [
        {
          title: 'Process List',
          content:
            'See CPU, memory, and other metrics per process. Search and filter to find specific processes. Data is refreshed from the server on an interval.',
          icon: 'Activity',
        },
        {
          title: 'Process Control',
          content:
            'You can terminate or manage processes from the interface when supported. Use with care: stopping critical system processes can affect stability.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'logs',
    name: 'Audit Logs',
    guide: {
      title: 'Audit Logs',
      description: 'Filterable, searchable event history for system actions.',
      sections: [
        {
          title: 'What is Logged',
          content:
            'Audit logs record key actions across ServerMon: logins, configuration changes, and other events. Use them to troubleshoot and comply with accountability requirements.',
          icon: 'Activity',
        },
        {
          title: 'Filtering and Search',
          content:
            'Use the filters and search on the Audit Logs page to find events by time range, type, or keyword. Results are paginated; adjust the limit as needed.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    guide: {
      title: 'File Browser',
      description: 'Browse the filesystem, preview files, and edit with the built-in editor.',
      sections: [
        {
          title: 'Navigation',
          content:
            'Navigate directories and open files from the web UI. Preview is available for many text and image types. The browser runs with the same privileges as the ServerMon process (typically the servermon user).',
          icon: 'FolderTree',
        },
        {
          title: 'Editing',
          content:
            'The built-in editor uses CodeMirror 6 with support for many languages. Save changes back to the server from the editor. Be careful when editing system or config files.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'disk',
    name: 'Disk',
    guide: {
      title: 'Disk',
      description: 'Disk usage, I/O, and storage health.',
      sections: [
        {
          title: 'Usage and I/O',
          content:
            'View disk usage by mount point and filesystem. Monitor I/O and storage health so you can spot full disks or performance issues before they cause outages.',
          icon: 'HardDrive',
        },
      ],
    },
  },
  {
    id: 'network',
    name: 'Network',
    guide: {
      title: 'Network',
      description: 'Real-time bandwidth, interface stats, and connection monitoring.',
      sections: [
        {
          title: 'Interfaces and Traffic',
          content:
            'See per-interface statistics and traffic. Use this to verify network configuration and identify bandwidth usage by interface.',
          icon: 'Activity',
        },
      ],
    },
  },
  {
    id: 'updates',
    name: 'Updates',
    guide: {
      title: 'Updates',
      description: 'Track available system and package updates.',
      sections: [
        {
          title: 'Available Updates',
          content:
            'The Updates module shows pending system and package updates (e.g. apt). Apply updates using your normal OS procedures (e.g. apt update && apt upgrade) or via the terminal.',
          icon: 'Package',
        },
      ],
    },
  },
  {
    id: 'docker',
    name: 'Docker',
    guide: {
      title: 'Docker',
      description: 'Manage containers, images, volumes, and networks.',
      sections: [
        {
          title: 'Containers',
          content:
            'View status, resource usage, and logs for containers. Start, stop, or restart containers from the UI. Ensure the ServerMon process can access the Docker socket.',
          icon: 'Container',
        },
        {
          title: 'Images and Volumes',
          content:
            'List images and volumes, and prune unused images when needed. Volume management helps you free space and keep the host tidy.',
          icon: 'HardDrive',
        },
      ],
    },
  },
  {
    id: 'services',
    name: 'Services',
    guide: {
      title: 'Services',
      description: 'Monitor and manage systemd services.',
      sections: [
        {
          title: 'Service List',
          content:
            'See status of systemd units (active, failed, etc.). Start, stop, or restart services from the UI when the app has the required permissions.',
          icon: 'Cog',
        },
        {
          title: 'Safety',
          content:
            'Stopping critical system services (e.g. systemd itself, SSH, or the ServerMon service) can lock you out or take down the server. Use with care.',
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'ai-agents',
    name: 'AI Agents',
    guide: {
      title: 'AI Agents',
      description: 'Monitor AI coding agent sessions on the server.',
      sections: [
        {
          title: 'What You See',
          content:
            'When AI coding agents (e.g. Cursor, Codex) run on the same host, this module can show active sessions and activity. Use it to see who or what is using agent resources.',
          icon: 'Bot',
        },
      ],
    },
  },
  {
    id: 'crons',
    name: 'Crons',
    guide: {
      title: 'Crons',
      description: 'View and manage cron schedules and execution history.',
      sections: [
        {
          title: 'Schedule Builder',
          content:
            'Create and edit cron jobs with a visual schedule builder. Presets for common intervals and human-readable descriptions help you set up jobs correctly.',
          icon: 'Clock',
        },
        {
          title: 'Jobs and History',
          content:
            'View user and system cron jobs in one place. Enable, disable, edit, or delete jobs as needed. Execution history from journal logs helps you confirm runs and debug failures.',
          icon: 'Activity',
        },
      ],
    },
  },
  {
    id: 'ports',
    name: 'Ports',
    guide: {
      title: 'Ports',
      description: 'Monitor listening ports and connections.',
      sections: [
        {
          title: 'Listening Ports',
          content:
            'See which processes are listening on which ports. Useful for verifying that services are bound correctly and for security review.',
          icon: 'Activity',
        },
      ],
    },
  },
  {
    id: 'hardware',
    name: 'Hardware',
    guide: {
      title: 'Hardware',
      description: 'CPU, memory, and hardware information.',
      sections: [
        {
          title: 'System Info',
          content:
            'View detailed hardware information: CPU model, cores, memory layout, and other system data. Helps with capacity planning and troubleshooting.',
          icon: 'Activity',
        },
      ],
    },
  },
  {
    id: 'certificates',
    name: 'Certificates',
    guide: {
      title: 'Certificates',
      description: 'View and manage TLS/SSL certificates.',
      sections: [
        {
          title: 'Certificate List',
          content:
            "See certificates installed or used by the system (e.g. Let's Encrypt). Check expiry dates and take action before certificates expire.",
          icon: 'Info',
        },
      ],
    },
  },
  {
    id: 'nginx',
    name: 'Nginx',
    guide: {
      title: 'Nginx',
      description: 'Nginx configuration and status.',
      sections: [
        {
          title: 'Configuration',
          content:
            'When ServerMon is deployed behind Nginx (e.g. via install.sh --domain), you can view and manage Nginx config and status from this module.',
          icon: 'Server',
        },
      ],
    },
  },
  {
    id: 'security',
    name: 'Security',
    guide: {
      title: 'Security',
      description: 'Security overview and hardening.',
      sections: [
        {
          title: 'Security Status',
          content:
            'Get a summary of security-related state: auth, firewall, and other checks. Use it to harden the server and stay compliant with your policies.',
          icon: 'Shield',
        },
      ],
    },
  },
];
