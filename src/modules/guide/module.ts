import { Module } from '@/types/module';

export const guideModule: Module = {
  id: 'guide',
  name: 'User Guide',
  version: '1.0.0',
  description: 'Centralized help and documentation for all modules.',
  routes: [
    {
      path: '/guide',
      component: 'UserGuidePage',
      name: 'User Guide',
    },
  ],
  guide: {
    title: 'Mastering ServerMon',
    description: 'Learn how to use ServerMon to its full potential.',
    sections: [
      {
        title: 'Introduction',
        content:
          'ServerMon is a comprehensive monitoring solution for your infrastructure. This guide will help you navigate through various modules and understand key metrics.',
        icon: 'Info',
      },
      {
        title: 'Getting Started',
        content:
          'Explore the Dashboard for a high-level overview, or dive into specific modules like Terminal, Docker, and Processes for detailed monitoring.',
        icon: 'Compass',
      },
    ],
  },
};
