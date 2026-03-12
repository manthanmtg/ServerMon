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
            title: 'Mastering ServerMon',
            description: 'Learn how to use ServerMon to its full potential.',
            sections: [
                {
                    title: 'Introduction',
                    content: 'ServerMon is a comprehensive monitoring solution for your infrastructure. This guide will help you navigate through various modules and understand key metrics.',
                    icon: 'Info',
                },
                {
                    title: 'Getting Started',
                    content: 'Explore the Dashboard for a high-level overview, or dive into specific modules like Terminal, Docker, and Processes for detailed monitoring.',
                    icon: 'Compass',
                },
            ],
        },
    },
    {
        id: 'docker-monitor',
        name: 'Docker Monitor',
        guide: {
            title: 'Docker Master Guide',
            description: 'Manage clusters, containers, and images with confidence.',
            sections: [
                {
                    title: 'Container Management',
                    content: 'View real-time status, CPU/Memory usage, and logs for all your containers. Start, stop, or restart containers with a single click.',
                    icon: 'Container',
                },
                {
                    title: 'Images & Volumes',
                    content: 'Prune unused images and manage persistent storage volumes effortlessly from the storage dashboard.',
                    icon: 'HardDrive',
                },
            ],
        },
    },
    {
        id: 'terminal',
        name: 'Terminal',
        guide: {
            title: 'Terminal Mastery',
            description: 'Secure, high-performance remote shell access.',
            sections: [
                {
                    title: 'Secure Access',
                    content: 'ServerMon uses encrypted PTY sessions to provide secure access to your server. Connect via SSH with automatic session recovery.',
                    icon: 'Terminal',
                },
                {
                    title: 'Keyboard Shortcuts',
                    content: 'Use standard keyboard shortcuts for copying, pasting, and navigating your shell history seamlessly.',
                    icon: 'Info',
                },
            ],
        },
    },
    {
        id: 'process-monitor',
        name: 'Process Monitor',
        guide: {
            title: 'Process Management',
            description: 'Keep your system lean and responsive.',
            sections: [
                {
                    title: 'Real-time Monitoring',
                    content: 'Track CPU, Memory, and Disk I/O for every running process. Identify resource hogs instantly.',
                    icon: 'Activity',
                },
                {
                    title: 'Process control',
                    content: 'Terminate unresponsive processes or adjust priorities directly from the interface.',
                    icon: 'Info',
                },
            ],
        },
    },
];
