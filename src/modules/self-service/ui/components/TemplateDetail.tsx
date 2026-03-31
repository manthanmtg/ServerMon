'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Workflow, Bot, GitBranch, BarChart3, HeartPulse, Monitor, Container, FileCode,
  Package, Terminal, Download, FileText, Server,
  ArrowLeft, ExternalLink, CheckCircle2, XCircle, AlertCircle, Star,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InstallTemplate, DetectionResult, InstallMethod } from '../../types';
import { PROVISION_STEP_LABELS } from '../../types';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Workflow, Bot, GitBranch, BarChart3, HeartPulse, Monitor, Container, FileCode,
  Package, Terminal, Download, FileText, Server,
};

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'docker-compose': Container,
  shell: Terminal,
  'package-manager': Package,
  'binary-download': Download,
  script: FileText,
};

interface TemplateDetailProps {
  templateId: string;
  onBack: () => void;
  onInstall: (template: InstallTemplate, method: InstallMethod) => void;
}

interface TemplateDetailData {
  template: InstallTemplate;
  detection: DetectionResult[];
}

export function TemplateDetail({ templateId, onBack, onInstall }: TemplateDetailProps) {
  const [data, setData] = useState<TemplateDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/modules/self-service/templates/${templateId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load template');
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive">{error || 'Template not found'}</p>
        <button onClick={onBack} className="text-sm text-primary mt-2 hover:underline">Go back</button>
      </div>
    );
  }

  const { template, detection } = data;
  const IconComponent = template.icon ? ICON_MAP[template.icon] : Package;
  const Icon = IconComponent || Package;
  const isInstalled = detection.some((d) => d.installed);
  const installedVersion = detection.find((d) => d.installed && d.version)?.version;
  const pipeline = template.defaultPipeline;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to catalog
      </button>

      <div className="flex items-start gap-5">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold">{template.name}</h1>
            {isInstalled ? (
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Installed{installedVersion ? ` (${installedVersion})` : ''}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not installed
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {template.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
            ))}
            {template.homepage && (
              <a
                href={template.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Website
              </a>
            )}
            {template.documentationUrl && (
              <a
                href={template.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Docs
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Install Methods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {template.installMethods.map((method) => {
                const MethodIcon = METHOD_ICONS[method.executionMethod] || Terminal;
                return (
                  <div
                    key={method.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border transition-colors',
                      'hover:border-primary/40 hover:bg-accent/50',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <MethodIcon className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{method.label}</span>
                          {method.recommended && (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                              <Star className="w-2.5 h-2.5 mr-0.5" />
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {method.executionMethod.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onInstall(template, method)}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Install
                    </button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {template.longDescription && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">About</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {template.longDescription.replace(/^#.*\n/gm, '').replace(/##\s*/g, '').trim()}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Detection Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {detection.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {d.installed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn(d.installed ? 'text-foreground' : 'text-muted-foreground')}>
                    {d.method}: {d.details || template.detection[i]?.value}
                  </span>
                  {d.version && (
                    <Badge variant="secondary" className="text-[9px] ml-auto">{d.version}</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Provisioning Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {pipeline.map((step, i) => (
                  <div key={step} className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-muted-foreground">{PROVISION_STEP_LABELS[step]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {template.configSchema.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {template.configSchema.map((field) => (
                  <div key={field.key} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{field.label}</span>
                      {field.required && (
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                      )}
                    </div>
                    {field.description && (
                      <p className="text-muted-foreground mt-0.5">{field.description}</p>
                    )}
                    <p className="text-muted-foreground/70 mt-0.5">
                      Default: <code className="text-[10px] bg-muted px-1 rounded">{String(field.default)}</code>
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
