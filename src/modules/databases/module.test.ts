import { describe, expect, it } from 'vitest';
import { databasesModule } from './module';

describe('databasesModule', () => {
  it('registers Databases with a widget and route', () => {
    expect(databasesModule.id).toBe('databases');
    expect(databasesModule.name).toBe('Databases');
    expect(databasesModule.widgets?.[0]).toMatchObject({
      id: 'databases-overview',
      component: 'DatabasesWidget',
    });
    expect(databasesModule.routes?.[0]).toMatchObject({
      path: '/databases',
      component: 'DatabasesPage',
    });
  });
});
