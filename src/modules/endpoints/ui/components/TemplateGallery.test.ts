/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { EndpointTemplate } from '../../types';
import { buildTemplateCategoryCounts, buildTemplateGalleryFacets } from './TemplateGallery';

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

describe('buildTemplateGalleryFacets', () => {
  it('derives category counts and available filters in one result', () => {
    expect(
      buildTemplateGalleryFacets([
        { ...template('cpu', 'monitoring'), method: 'GET', endpointType: 'script' },
        { ...template('audit', 'security'), method: 'POST', endpointType: 'webhook' },
        { ...template('query', 'data'), method: 'PATCH', endpointType: 'logic' },
        { ...template('latency', 'monitoring'), method: 'GET', endpointType: 'script' },
      ])
    ).toEqual({
      availableCategories: ['monitoring', 'security', 'data'],
      availableMethods: ['GET', 'POST', 'PATCH'],
      availableTypes: ['script', 'logic', 'webhook'],
      categoryCounts: {
        monitoring: 2,
        security: 1,
        data: 1,
      },
    });
  });
});
