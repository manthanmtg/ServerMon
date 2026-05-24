import { describe, expect, it } from 'vitest';

import {
  getAllTemplates,
  getTemplateById,
  searchTemplates,
  toListItem,
} from './templates/index';

describe('self-service templates index', () => {
  it('returns all templates through getAllTemplates', () => {
    const templates = getAllTemplates();

    expect(templates).toHaveLength(8);
    expect(templates[0]).toHaveProperty('id');
  });

  it('finds template by id', () => {
    const [firstTemplate] = getAllTemplates();

    expect(getTemplateById(firstTemplate.id)).toBe(firstTemplate);
    expect(getTemplateById('does-not-exist')).toBeUndefined();
  });

  it('returns all templates when no search options are provided', () => {
    const templates = getAllTemplates();

    expect(searchTemplates()).toEqual(templates);
    expect(searchTemplates({})).toEqual(templates);
  });

  it('filters templates by category', () => {
    const categories = Array.from(new Set(getAllTemplates().map((template) => template.category)));

    for (const category of categories) {
      const expected = getAllTemplates().filter((template) => template.category === category);
      expect(searchTemplates({ category })).toEqual(expected);
    }
  });

  it('filters templates by tags with case-insensitive matching', () => {
    const template = getAllTemplates().find((entry) => entry.tags.length > 0);
    if (!template) {
      throw new Error('Expected at least one template with tags.');
    }

    const mixedCaseTag = template.tags[0].toUpperCase();
    const results = searchTemplates({ tags: [mixedCaseTag] });

    expect(results).toContain(template);
  });

  it('searches templates by name, description, or tags', () => {
    const firstTemplate = getAllTemplates().find((template) => template.name.length > 0);
    if (!firstTemplate) {
      throw new Error('Expected at least one template with a name.');
    }

    const byName = searchTemplates({ query: firstTemplate.name.slice(0, 4) });
    const byDescription = searchTemplates({ query: firstTemplate.description.slice(0, 8) });
    const byTag = searchTemplates({ query: firstTemplate.tags[0]?.toLowerCase() });

    expect(byName).toContain(firstTemplate);
    expect(byDescription).toContain(firstTemplate);
    expect(byTag).toContain(firstTemplate);
  });

  it('ignores whitespace-only query to avoid accidental filtering', () => {
    const templates = getAllTemplates();

    expect(searchTemplates({ query: '   ' })).toEqual(templates);
  });

  it('intersects multiple filters consistently', () => {
    const firstTemplate = getAllTemplates().find((template) => template.tags.length > 0);
    if (!firstTemplate) {
      throw new Error('Expected at least one template with tags.');
    }

    const filtered = searchTemplates({
      category: firstTemplate.category,
      tags: [firstTemplate.tags[0]],
      query: firstTemplate.name,
    });

    expect(filtered).toContain(firstTemplate);
    expect(filtered.every((entry) => entry.id === firstTemplate.id)).toBe(true);
  });

  it('converts template to list item with normalized install method payload', () => {
    const template = getAllTemplates()[0];
    const listItem = toListItem(template);

    expect(listItem).toEqual(
      expect.objectContaining({
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        version: template.version,
      })
    );
    expect(listItem.installMethods).toEqual(
      template.installMethods.map((method) => ({
        id: method.id,
        label: method.label,
        executionMethod: method.executionMethod,
        recommended: method.recommended,
      }))
    );
  });

  it('returns a brand-new list reference from toListItem while preserving install method shape', () => {
    const template = getAllTemplates()[0];
    const initialMethodCount = template.installMethods.length;
    const listItem = toListItem(template);

    listItem.installMethods.push({
      id: 'custom',
      label: 'Custom',
      executionMethod: 'script',
    });

    expect(template.installMethods).toHaveLength(initialMethodCount);
    expect(listItem.installMethods).not.toBe(template.installMethods);
  });
});
