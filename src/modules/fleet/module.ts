import { Module, ModuleContext } from '@/types/module';

export const fleetModule: Module = {
  id: 'fleet-management',
  name: 'Fleet Management',
  version: '1.0.0',
  description:
    'Orchestrate remote Agents via FRP tunnels with managed Nginx ingress, diagnostics, and fleet-wide operations.',
  widgets: [{ id: 'fleet-overview', name: 'Fleet Overview', component: 'FleetWidget' }],
  routes: [
    { path: '/fleet', component: 'FleetPage', name: 'Fleet' },
    { path: '/fleet/onboarding', component: 'FleetOnboardingPage', name: 'Onboard Agent' },
    { path: '/fleet/routes', component: 'FleetRoutesPage', name: 'Public Routes' },
    { path: '/fleet/logs', component: 'FleetLogsPage', name: 'Fleet Logs' },
    { path: '/fleet/server', component: 'FleetServerPage', name: 'FRP Server' },
    { path: '/fleet/nginx', component: 'FleetNginxPage', name: 'Nginx' },
    { path: '/fleet/updates', component: 'FleetUpdatesPage', name: 'Agent Updates' },
    { path: '/fleet/backups', component: 'FleetBackupsPage', name: 'Backups' },
    { path: '/fleet/diagnostics', component: 'FleetDiagnosticsPage', name: 'Diagnostics' },
    { path: '/fleet/templates', component: 'FleetTemplatesPage', name: 'Route Templates' },
    { path: '/fleet/policies', component: 'FleetPoliciesPage', name: 'Policies' },
    { path: '/fleet/emergency', component: 'FleetEmergencyPage', name: 'Emergency' },
    { path: '/fleet/import', component: 'FleetImportPage', name: 'Import' },
  ],
  init: (ctx: ModuleContext) => ctx.logger.info('Initializing Fleet Management...'),
  start: (ctx: ModuleContext) => ctx.logger.info('Fleet Management started.'),
  stop: (ctx: ModuleContext) => ctx.logger.info('Fleet Management stopped.'),
};
