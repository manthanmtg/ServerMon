import { describe, expect, it } from 'vitest';
import { appsModule } from './module';

describe('appsModule', () => {
  it('registers Apps with a widget and route', () => {
    expect(appsModule.id).toBe('apps');
    expect(appsModule.name).toBe('Apps');
    expect(appsModule.widgets?.[0]).toMatchObject({
      id: 'apps-overview',
      component: 'AppsWidget',
    });
    expect(appsModule.routes?.[0]).toMatchObject({
      path: '/apps',
      component: 'AppsPage',
    });
  });
});
