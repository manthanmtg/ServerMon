import type { Module } from '@/types/module';

export const scriptRunnerModule: Module = {
  id: 'script-runner',
  name: 'Script Runner',
  version: '0.1.0',
  description: 'Save and run Bash, Python, and Node.js scripts in the background.',
  widgets: [
    { id: 'script-runner-overview', name: 'Script Runner', component: 'ScriptRunnerWidget' },
  ],
  routes: [{ path: '/scripts', component: 'ScriptRunnerPage', name: 'Scripts' }],
};
