/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { EndpointTemplate } from '../../types';
import { buildTemplateCategoryCounts } from './TemplateGallery';

const template = (id: string, category: EndpointTemplate['category']): EndpointTemplate => ({
  id,
  name: id,
  description: `${id} template`,
  icon: 'sparkles',
  category,
  method: 'GET',
  endpointType: 'script',
  tags: [],
});

describe('buildTemplateCategoryCounts', () => {
  it('counts templates per category in one pass', () => {
    expect(
      buildTemplateCategoryCounts([
        template('cpu', 'monitoring'),
        template('audit', 'security'),
        template('deploy', 'devops'),
        template('latency', 'monitoring'),
      ])
    ).toEqual({
      monitoring: 2,
      security: 1,
      devops: 1,
    });
  });
});
