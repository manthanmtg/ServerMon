'use client';

import { 
  ChevronRight, 
  Check, 
  Copy, 
  Play, 
  LoaderCircle, 
  X, 
  Settings, 
  Key, 
  FileText 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TYPE_ICONS } from './common/constants';
import type { EndpointCreateRequest, DetailTab } from '../../types';

interface EndpointDetailProps {
  form: EndpointCreateRequest;
  initialForm: EndpointCreateRequest | null;
  selectedId: string | null;
  isCreating: boolean;
  isDirty: boolean;
  saving: boolean;
  testLoading: boolean;
  detailTab: DetailTab;
  copiedSlug: boolean;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => void;
  onCopySlug: () => void;
  onCloseDetail: () => void;
  onSave: () => void;
  onTest: () => void;
  onTabChange: (tab: DetailTab) => void;
  showTestConsole: boolean;
  children: React.ReactNode;
}

export function EndpointDetail({
  form,
  initialForm,
  selectedId,
  isCreating,
  isDirty,
  saving,
  testLoading,
  detailTab,
  copiedSlug,
  onUpdateForm,
  onCopySlug,
  onCloseDetail,
  onSave,
  onTest,
  onTabChange,
  showTestConsole,
  children,
}: EndpointDetailProps) {
  const tabs = [
    { id: 'configure' as const, label: 'Configure', shortLabel: 'Config', icon: Settings },
    {
      id: 'code' as const,
      label:
        form.endpointType === 'webhook'
          ? 'Webhook'
          : form.endpointType === 'logic'
            ? 'Logic'
            : 'Code',
      shortLabel:
        form.endpointType === 'webhook'
          ? 'Hook'
          : form.endpointType === 'logic'
            ? 'Logic'
            : 'Code',
      icon: TYPE_ICONS[form.endpointType || 'script'],
    },
    { id: 'auth' as const, label: 'Auth & Tokens', shortLabel: 'Auth', icon: Key },
    !isCreating && { id: 'logs' as const, label: 'Logs', shortLabel: 'Logs', icon: FileText },
    { id: 'settings' as const, label: 'Settings', shortLabel: 'Settings', icon: Settings },
  ].filter(Boolean) as { id: DetailTab; label: string; shortLabel: string; icon: any }[];

  return (
    <div
      className={cn(
        'flex flex-col min-w-0 flex-1 bg-card/40 rounded-3xl border border-border/40 overflow-hidden shadow-2xl backdrop-blur-md',
        'animate-in slide-in-from-right-4 fade-in duration-500'
      )}
      data-testid="endpoint-detail"
    >
      {/* Detail Header */}
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b border-border/40 bg-card/60 backdrop-blur-xl">
        <button
          onClick={onCloseDetail}
          className="lg:hidden p-2 rounded-xl hover:bg-accent text-muted-foreground shrink-0 transition-colors"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={form.name}
            onChange={(e) => onUpdateForm('name', e.target.value)}
            placeholder="Endpoint name..."
            className="text-lg sm:text-xl font-bold text-foreground bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/30 focus:ring-0"
          />
          {form.slug && (
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[11px] sm:text-xs font-mono text-primary/70 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10 truncate">
                /api/endpoints/{form.slug}
              </code>
              <button
                onClick={onCopySlug}
                className="shrink-0 text-muted-foreground hover:text-primary transition-colors p-1"
                title="Copy full URL"
              >
                {copiedSlug ? (
                  <Check className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {!isCreating && selectedId && (
            <Button
              variant="outline"
              size="sm"
              data-testid="test-endpoint-button"
              onClick={onTest}
              disabled={testLoading}
              className="h-10 w-10 sm:w-auto p-0 sm:px-4 sm:gap-2 rounded-2xl border-border/40 hover:bg-accent/50 text-foreground transition-all active:scale-95"
            >
              {testLoading ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span className="hidden sm:inline font-bold text-xs uppercase tracking-wider">Test</span>
            </Button>
          )}
          <Button
            size="sm"
            data-testid="save-endpoint-button"
            onClick={onSave}
            disabled={saving || !form.name || (!isCreating && !isDirty)}
            className="h-10 w-10 sm:w-auto p-0 sm:px-5 sm:gap-2 rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {saving ? (
              <LoaderCircle className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span className="hidden sm:inline text-xs uppercase tracking-wider">{isCreating ? 'Create' : 'Save'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCloseDetail}
            className="h-10 w-10 p-0 rounded-2xl border-border/40 hover:bg-accent/50 hidden sm:flex sm:w-auto sm:px-4 sm:gap-2 text-muted-foreground transition-all active:scale-95"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline font-bold text-xs uppercase tracking-wider">Close</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 sm:px-6 pt-3 border-b border-border/40 bg-card/30 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            data-testid={`tab-${tab.id}`}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-t-2xl transition-all border-b-2 whitespace-nowrap shrink-0 relative group',
              detailTab === tab.id
                ? 'text-primary border-primary bg-primary/5 shadow-[0_-4px_12px_rgba(var(--primary-rgb),0.05)]'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/5'
            )}
          >
            <tab.icon className={cn('w-4 h-4 transition-transform group-hover:scale-110', detailTab === tab.id && 'scale-110')} />
            <span className="hidden sm:inline tracking-tight">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
            {detailTab === tab.id && (
               <div className="absolute inset-x-0 -bottom-[2px] h-[2px] bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div 
        className={cn(
          "flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 custom-scrollbar transition-all",
          showTestConsole && "pb-60 sm:pb-96"
        )}
      >
        {children}
      </div>
    </div>
  );
}
