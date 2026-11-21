import type { Module } from '@/types/module';

export const pythonEnvironmentsModule: Module = {
  id: 'python-environments',
  name: 'Python Environments',
  version: '0.1.0',
  description: 'Build and manage Python environments for saved scripts.',
  widgets: [
    {
      id: 'python-environments-overview',
      name: 'Python Environments',
      component: 'PythonEnvironmentsWidget',
    },
  ],
  routes: [
    {
      path: '/python-environments',
      component: 'PythonEnvironmentsPage',
      name: 'Python Environments',
    },
  ],
};
