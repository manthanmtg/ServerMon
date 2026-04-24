import { InstallTemplate, TemplateCategory, TemplateListItem } from '../types';
import { n8nTemplate } from './services/n8n';
import { openwebuiTemplate } from './services/openwebui';
import { giteaTemplate } from './services/gitea';
import { plausibleTemplate } from './services/plausible';
import { uptimeKumaTemplate } from './services/uptime-kuma';
import { htopTemplate } from './cli-tools/htop';
import { lazydockerTemplate } from './cli-tools/lazydocker';
import { neovimTemplate } from './cli-tools/neovim';

const allTemplates: InstallTemplate[] = [
  n8nTemplate,
  openwebuiTemplate,
  giteaTemplate,
  plausibleTemplate,
  uptimeKumaTemplate,
  htopTemplate,
  lazydockerTemplate,
  neovimTemplate,
];

const templateMap = new Map<string, InstallTemplate>(allTemplates.map((t) => [t.id, t]));

export function getAllTemplates(): InstallTemplate[] {
  return allTemplates;
}

export function getTemplateById(id: string): InstallTemplate | undefined {
  return templateMap.get(id);
}

export function searchTemplates(opts: {
  query?: string;
  category?: TemplateCategory;
  tags?: string[];
}): InstallTemplate[] {
  let results = allTemplates;

  if (opts.category) {
    results = results.filter((t) => t.category === opts.category);
  }

  if (opts.tags && opts.tags.length > 0) {
    const tagsLower = opts.tags.map((tag) => tag.toLowerCase());
    results = results.filter((t) => tagsLower.some((tag) => t.tags.includes(tag)));
  }

  if (opts.query) {
    const q = opts.query.toLowerCase();
    results = results.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q))
    );
  }

  return results;
}

export function toListItem(template: InstallTemplate): TemplateListItem {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    icon: template.icon,
    tags: template.tags,
    installMethods: template.installMethods.map((m) => ({
      id: m.id,
      label: m.label,
      executionMethod: m.executionMethod,
      recommended: m.recommended,
    })),
    version: template.version,
  };
}
