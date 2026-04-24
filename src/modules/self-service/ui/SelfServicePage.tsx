'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import type { TemplateListItem, InstallTemplate, InstallMethod } from '../types';
import { TemplateCatalog } from './components/TemplateCatalog';
import { TemplateDetail } from './components/TemplateDetail';
import { InstallWizard } from './components/InstallWizard';
import { InstallProgress } from './components/InstallProgress';
import { InstallHistory } from './components/InstallHistory';

type View =
  | { kind: 'catalog' }
  | { kind: 'detail'; templateId: string }
  | { kind: 'wizard'; template: InstallTemplate; method: InstallMethod }
  | { kind: 'progress'; jobId: string }
  | { kind: 'history' }
  | { kind: 'history-job'; jobId: string };

export default function SelfServicePage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'catalog' });
  const [activeTab, setActiveTab] = useState<'catalog' | 'history'>('catalog');

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/self-service/templates', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast({
        title: 'Failed to load templates',
        description: e.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSelectTemplate = useCallback((template: TemplateListItem) => {
    setView({ kind: 'detail', templateId: template.id });
  }, []);

  const handleInstall = useCallback((template: InstallTemplate, method: InstallMethod) => {
    setView({ kind: 'wizard', template, method });
  }, []);

  const handleStartInstall = useCallback(
    async (
      template: InstallTemplate,
      method: InstallMethod,
      config: Record<string, string | number | boolean>
    ) => {
      try {
        const res = await fetch('/api/modules/self-service/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: template.id,
            methodId: method.id,
            config,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start install');
        }

        const data = await res.json();
        setView({ kind: 'progress', jobId: data.job.id });

        toast({
          title: 'Installation started',
          description: `Installing ${template.name} via ${method.label}`,
          variant: 'default',
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        toast({
          title: 'Install failed',
          description: e.message || 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleRollback = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/modules/self-service/install/${jobId}/rollback`, {
          method: 'POST',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Rollback failed');
        }
        toast({
          title: 'Rollback initiated',
          description: 'Rolling back installation...',
          variant: 'default',
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        toast({
          title: 'Rollback failed',
          description: e.message || 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const handleViewJob = useCallback((jobId: string) => {
    setView({ kind: 'history-job', jobId });
  }, []);

  const showingMainView = view.kind === 'catalog' || view.kind === 'history';

  return (
    <div className="space-y-6">
      {showingMainView && (
        <div className="flex items-center gap-1 border-b border-border pb-0">
          <button
            onClick={() => {
              setActiveTab('catalog');
              setView({ kind: 'catalog' });
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'catalog'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Catalog
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              setView({ kind: 'history' });
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'history'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
        </div>
      )}

      {view.kind === 'catalog' &&
        (loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <TemplateCatalog templates={templates} onSelectTemplate={handleSelectTemplate} />
        ))}

      {view.kind === 'history' && (
        <InstallHistory onViewJob={handleViewJob} onRollback={handleRollback} />
      )}

      {view.kind === 'detail' && (
        <TemplateDetail
          templateId={view.templateId}
          onBack={() => setView({ kind: 'catalog' })}
          onInstall={handleInstall}
        />
      )}

      {view.kind === 'wizard' && (
        <InstallWizard
          template={view.template}
          method={view.method}
          onBack={() => setView({ kind: 'detail', templateId: view.template.id })}
          onStart={(config) => handleStartInstall(view.template, view.method, config)}
        />
      )}

      {(view.kind === 'progress' || view.kind === 'history-job') && (
        <InstallProgress
          jobId={view.kind === 'progress' ? view.jobId : view.jobId}
          onDone={() => {
            setActiveTab('catalog');
            setView({ kind: 'catalog' });
          }}
          onRollback={handleRollback}
        />
      )}
    </div>
  );
}
