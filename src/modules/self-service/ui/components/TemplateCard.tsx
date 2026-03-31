'use client';

import {
  Workflow, Bot, GitBranch, BarChart3, HeartPulse, Monitor, Container, FileCode,
  Package, Terminal, Download, FileText, Server,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TemplateListItem } from '../../types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Workflow, Bot, GitBranch, BarChart3, HeartPulse, Monitor, Container, FileCode,
  Package, Terminal, Download, FileText, Server,
};

const CATEGORY_COLORS: Record<string, string> = {
  service: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'cli-tool': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  development: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  monitoring: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  database: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  service: 'Service',
  'cli-tool': 'CLI Tool',
  development: 'Development',
  monitoring: 'Monitoring',
  database: 'Database',
};

interface TemplateCardProps {
  template: TemplateListItem;
  onClick: (template: TemplateListItem) => void;
}

export function TemplateCard({ template, onClick }: TemplateCardProps) {
  const IconComponent = template.icon ? ICON_MAP[template.icon] : Package;
  const Icon = IconComponent || Package;
  const categoryColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.service;
  const categoryLabel = CATEGORY_LABELS[template.category] || template.category;
  const recommended = template.installMethods.find((m) => m.recommended);
  const methodCount = template.installMethods.length;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5',
        'group',
      )}
      onClick={() => onClick(template)}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">{template.name}</h3>
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', categoryColor)}>
                {categoryLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {template.description}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {recommended && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {recommended.label}
                </Badge>
              )}
              {methodCount > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  +{methodCount - 1} more {methodCount - 1 === 1 ? 'method' : 'methods'}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
