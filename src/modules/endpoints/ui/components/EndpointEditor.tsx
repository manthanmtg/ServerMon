'use client';

import { useState } from 'react';
import { LoaderCircle, X, Terminal, Link, Braces, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { LANGUAGES, METHODS } from './common/constants';
import {
  LOGIC_BOILERPLATES,
  SCRIPT_BOILERPLATES,
  WEBHOOK_BOILERPLATES,
} from './common/boilerplates';
import type { EndpointCreateRequest, HttpMethod, ScriptLanguage } from '../../types';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

const ScriptEditor = dynamic(() => import('./ScriptEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-2xl border border-border/40 bg-[#1e1e2e] flex items-center justify-center shadow-xl">
      <LoaderCircle className="w-6 h-6 animate-spin text-primary/40" />
    </div>
  ),
});

interface EndpointEditorProps {
  form: EndpointCreateRequest;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(
    key: K,
    value: EndpointCreateRequest[K]
  ) => void;
  onRun?: () => void;
  onSave: () => void;
}

export function EndpointEditor({ form, onUpdateForm, onRun, onSave }: EndpointEditorProps) {
  const [showBoilerplateConfirm, setShowBoilerplateConfirm] = useState(false);

  const handleLoadBoilerplate = () => {
    const lang = form.scriptLang || 'python';
    const method = (form.method as string) === 'POST' ? 'POST' : 'GET';
    const bp =
      SCRIPT_BOILERPLATES[lang as ScriptLanguage][method] ||
      SCRIPT_BOILERPLATES[lang as ScriptLanguage]['GET'];
    onUpdateForm('scriptContent', bp.content);
    setShowBoilerplateConfirm(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {form.endpointType === 'script' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-muted/20 p-2 sm:p-2 rounded-2xl border border-border/40 backdrop-blur-md gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-background/40 rounded-xl border border-border/20 overflow-x-auto scrollbar-none">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => onUpdateForm('scriptLang', lang as ScriptLanguage)}
                    className={cn(
                      'px-3 sm:px-4 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold capitalize transition-all duration-300 whitespace-nowrap',
                      form.scriptLang === lang
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (form.scriptContent) {
                    setShowBoilerplateConfirm(true);
                    return;
                  }
                  handleLoadBoilerplate();
                }}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-[9px] font-black text-primary uppercase tracking-widest hover:bg-primary/20 transition-all active:scale-95 animate-in slide-in-from-left-2"
              >
                <Sparkles className="w-3 h-3 animate-pulse" />
                <span>Load {form.scriptLang} Boilerplate</span>
              </button>
            </div>
            <div className="px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.2em] hidden sm:block">
              {form.scriptLang}/interpreter
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
            <div className="relative">
              <ScriptEditor
                value={form.scriptContent || ''}
                onChange={(val) => onUpdateForm('scriptContent', val)}
                language={form.scriptLang || 'python'}
                onRun={onRun}
                onSave={onSave}
              />
            </div>
          </div>

          {/* Env Vars */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  Environment Variables
                </label>
              </div>
              <button
                onClick={() => {
                  const vars = { ...(form.envVars || {}), '': '' };
                  onUpdateForm('envVars', vars);
                }}
                className="text-[10px] font-bold text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20 transition-all hover:scale-105 active:scale-95"
              >
                + ADD VARIABLE
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(form.envVars || {}).map(([key, value], i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 bg-muted/10 rounded-2xl border border-border/30 group/var transition-colors hover:border-border/60 animate-in slide-in-from-left-4 duration-300"
                >
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={key}
                      placeholder="KEY (e.g. API_KEY)"
                      onChange={(e) => {
                        const entries = Object.entries(form.envVars || {});
                        entries[i] = [e.target.value.toUpperCase(), value];
                        onUpdateForm('envVars', Object.fromEntries(entries));
                      }}
                      className="flex-1 h-10 px-4 rounded-xl border border-border/40 bg-background/50 text-[11px] font-mono font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                    />
                    <span className="text-muted-foreground/40 font-mono">=</span>
                    <input
                      type="text"
                      value={value}
                      placeholder="value"
                      onChange={(e) => {
                        const entries = Object.entries(form.envVars || {});
                        entries[i] = [key, e.target.value];
                        onUpdateForm('envVars', Object.fromEntries(entries));
                      }}
                      className="flex-1 h-10 px-4 rounded-xl border border-border/40 bg-background/50 text-[11px] font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const entries = Object.entries(form.envVars || {}).filter((_, j) => j !== i);
                      onUpdateForm('envVars', Object.fromEntries(entries));
                    }}
                    className="p-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                    title="Remove variable"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {Object.keys(form.envVars || {}).length === 0 && (
                <div className="text-center py-8 rounded-2xl border border-dashed border-border/40 text-muted-foreground/40 text-[10px] font-medium tracking-tight">
                  No custom environment variables defined
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {form.endpointType === 'webhook' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 ml-1">
                <Link className="w-4 h-4 text-primary" />
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  Target Upstream URL
                </label>
              </div>
              {!form.webhookConfig?.transformBody && (
                <button
                  onClick={() =>
                    onUpdateForm('webhookConfig', {
                      ...form.webhookConfig,
                      targetUrl: form.webhookConfig?.targetUrl || '',
                      transformBody: WEBHOOK_BOILERPLATES.transform,
                    })
                  }
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-tighter hover:bg-primary/10 transition-all active:scale-95"
                >
                  <Sparkles className="w-3 h-3" />
                  Magic Transform
                </button>
              )}
            </div>
            <input
              type="url"
              value={form.webhookConfig?.targetUrl || ''}
              onChange={(e) =>
                onUpdateForm('webhookConfig', {
                  ...form.webhookConfig,
                  targetUrl: e.target.value,
                })
              }
              placeholder="https://api.yourdomain.com/v1/webhooks/receive"
              className="w-full h-12 px-4 rounded-2xl border border-border/40 bg-background/30 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm hover:bg-background/50"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
              Upstream HTTP Method
            </label>
            <div className="flex flex-wrap gap-2">
              {['', ...METHODS].map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    onUpdateForm('webhookConfig', {
                      ...form.webhookConfig,
                      targetUrl: form.webhookConfig?.targetUrl || '',
                      method: (m || undefined) as HttpMethod | undefined,
                    })
                  }
                  className={cn(
                    'px-4 py-2 rounded-xl text-[10px] font-mono font-bold border transition-all min-h-[40px]',
                    (form.webhookConfig?.method || '') === m
                      ? 'bg-primary/10 text-primary border-primary/40 shadow-lg shadow-primary/5'
                      : 'border-border/40 text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {m || 'INHERIT'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-6 rounded-3xl bg-primary/2 border border-primary/10 transition-all hover:bg-primary/5">
            <div className="space-y-1">
              <div className="text-sm font-black text-foreground uppercase tracking-tight">
                Transparent Proxying
              </div>
              <div className="text-[11px] text-muted-foreground font-medium">
                Forward all incoming HTTP headers to the target upstream
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateForm('webhookConfig', {
                  ...form.webhookConfig,
                  targetUrl: form.webhookConfig?.targetUrl || '',
                  forwardHeaders: !form.webhookConfig?.forwardHeaders,
                })
              }
              className={cn(
                'w-14 h-8 rounded-full transition-all relative p-1',
                form.webhookConfig?.forwardHeaders ? 'bg-success' : 'bg-muted-foreground/20'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-full bg-white shadow-xl transition-all duration-300 transform',
                  form.webhookConfig?.forwardHeaders ? 'translate-x-6' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 ml-1">
              <Braces className="w-4 h-4 text-primary" />
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                Payload Transformer (JavaScript)
              </label>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border/40 bg-[#1e1e2e] shadow-xl">
              <textarea
                value={form.webhookConfig?.transformBody || ''}
                onChange={(e) =>
                  onUpdateForm('webhookConfig', {
                    ...form.webhookConfig,
                    targetUrl: form.webhookConfig?.targetUrl || '',
                    transformBody: e.target.value,
                  })
                }
                placeholder="// return { name: input.fullName };"
                rows={6}
                className="w-full px-5 py-4 bg-transparent text-[#cdd6f4] text-xs font-mono outline-none resize-y min-h-[160px]"
                spellCheck={false}
              />
            </div>
            <p className="px-1 text-[10px] text-muted-foreground/60 italic font-medium">
              Reference incoming payload as <code className="text-primary font-bold">input</code>.
              Returns a JSON object.
            </p>
          </div>
        </div>
      )}

      {form.endpointType === 'logic' && (
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between ml-1">
              <div className="flex items-center gap-2">
                <Braces className="w-4 h-4 text-primary" />
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  Contract Schema (JSON)
                </label>
              </div>
              {!form.logicConfig?.requestSchema && (
                <button
                  onClick={() =>
                    onUpdateForm('logicConfig', {
                      ...form.logicConfig,
                      requestSchema: LOGIC_BOILERPLATES.schema,
                      handlerCode: LOGIC_BOILERPLATES.handler,
                      responseMapping: LOGIC_BOILERPLATES.mapping,
                    })
                  }
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-tighter hover:bg-primary/10 transition-all"
                >
                  <Sparkles className="w-3 h-3" />
                  Apply Standard Logic Template
                </button>
              )}
            </div>
            <div className="rounded-2xl overflow-hidden border border-border/40 bg-[#1e1e2e] shadow-xl">
              <textarea
                value={form.logicConfig?.requestSchema || ''}
                onChange={(e) =>
                  onUpdateForm('logicConfig', {
                    ...form.logicConfig,
                    requestSchema: e.target.value,
                  })
                }
                placeholder='{ "type": "object", "required": ["user_id"] }'
                rows={5}
                className="w-full px-5 py-4 bg-transparent text-[#cdd6f4] text-xs font-mono outline-none resize-y min-h-[140px]"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 ml-1">
              <Terminal className="w-4 h-4 text-primary" />
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                Edge Handler Logic (JS)
              </label>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border/40 bg-[#1e1e2e] shadow-xl ring-1 ring-primary/10">
              <textarea
                value={form.logicConfig?.handlerCode || ''}
                onChange={(e) =>
                  onUpdateForm('logicConfig', {
                    ...form.logicConfig,
                    handlerCode: e.target.value,
                  })
                }
                placeholder="return { statusCode: 200, body: { status: 'ok' } };"
                rows={10}
                className="w-full px-5 py-4 bg-transparent text-[#cdd6f4] text-xs font-mono outline-none resize-y min-h-[240px]"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 ml-1">
              <Link className="w-4 h-4 text-primary" />
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                Response Mapping (JSON)
              </label>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border/40 bg-[#1e1e2e] shadow-xl">
              <textarea
                value={form.logicConfig?.responseMapping || ''}
                onChange={(e) =>
                  onUpdateForm('logicConfig', {
                    ...form.logicConfig,
                    responseMapping: e.target.value,
                  })
                }
                placeholder='{ "status": 200, "headers": { "X-Server-Mon": "active" } }'
                rows={4}
                className="w-full px-5 py-4 bg-transparent text-[#cdd6f4] text-xs font-mono outline-none resize-y min-h-[100px]"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={showBoilerplateConfirm}
        onConfirm={handleLoadBoilerplate}
        onCancel={() => setShowBoilerplateConfirm(false)}
        title="Overwriting Content"
        message="Loading this boilerplate will replace all existing code in the editor. Are you sure you want to proceed?"
        confirmLabel="Replace Code"
        cancelLabel="Keep Current"
        variant="warning"
      />
    </div>
  );
}
