'use client';

import { useState, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, Play, Shield, Globe, Terminal, Container, Package, FileText, Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { InstallTemplate, InstallMethod, ConfigField } from '../../types';
import { PROVISION_STEP_LABELS } from '../../types';
import { renderTemplate } from '../../engine/executor';

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'docker-compose': Container,
  shell: Terminal,
  'package-manager': Package,
  'binary-download': Download,
  script: FileText,
};

type WizardStep = 'configure' | 'ssl' | 'review';

interface InstallWizardProps {
  template: InstallTemplate;
  method: InstallMethod;
  onBack: () => void;
  onStart: (config: Record<string, string | number | boolean>) => void;
}

export function InstallWizard({ template, method, onBack, onStart }: InstallWizardProps) {
  const allFields = [
    ...template.configSchema,
    ...(method.configOverrides || []),
  ];

  const initialConfig: Record<string, string | number | boolean> = {};
  for (const field of allFields) {
    initialConfig[field.key] = field.default;
  }

  const [config, setConfig] = useState(initialConfig);
  const [sslMode, setSslMode] = useState<string>('letsencrypt');
  const [step, setStep] = useState<WizardStep>('configure');

  const pipeline = method.pipeline ?? template.defaultPipeline;
  const hasSslStep = pipeline.includes('ssl-cert');
  const hasDomain = allFields.some((f) => f.key === 'domain');

  const updateField = useCallback((key: string, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const fullConfig = { ...config, sslMode };

  const canProceedConfigure = allFields
    .filter((f) => f.required)
    .every((f) => {
      const val = config[f.key];
      if (typeof val === 'string') return val.trim().length > 0;
      return val !== undefined && val !== null;
    });

  const steps: WizardStep[] = ['configure'];
  if (hasSslStep && hasDomain) steps.push('ssl');
  steps.push('review');

  const currentIdx = steps.indexOf(step);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === steps.length - 1;

  const goNext = () => {
    if (!isLast) setStep(steps[currentIdx + 1]);
  };
  const goPrev = () => {
    if (!isFirst) setStep(steps[currentIdx - 1]);
  };

  const MethodIcon = METHOD_ICONS[method.executionMethod] || Terminal;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {template.name}
      </button>

      <div className="flex items-center gap-3 mb-4">
        <MethodIcon className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold">Install {template.name}</h2>
          <p className="text-xs text-muted-foreground">via {method.label}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                i <= currentIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </div>
            <span className={cn('text-xs capitalize', i <= currentIdx ? 'text-foreground' : 'text-muted-foreground')}>
              {s === 'ssl' ? 'Domain & SSL' : s}
            </span>
            {i < steps.length - 1 && (
              <div className={cn('w-8 h-px', i < currentIdx ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      {step === 'configure' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No configuration required.</p>
            ) : (
              allFields.map((field) => (
                <ConfigFieldInput
                  key={field.key}
                  field={field}
                  value={config[field.key]}
                  onChange={(val) => updateField(field.key, val)}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {step === 'ssl' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Domain & SSL Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Domain: <strong>{String(config.domain || 'not set')}</strong></span>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">SSL Mode</label>
              {[
                { value: 'letsencrypt', label: "Let's Encrypt", desc: 'Free, auto-renewing SSL certificate (requires public DNS)' },
                { value: 'self-signed', label: 'Self-Signed', desc: 'Generate a self-signed certificate (for internal/development use)' },
                { value: 'none', label: 'No SSL', desc: 'HTTP only (not recommended for production)' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    sslMode === opt.value ? 'border-primary bg-primary/5' : 'hover:border-primary/30',
                  )}
                >
                  <input
                    type="radio"
                    name="sslMode"
                    value={opt.value}
                    checked={sslMode === opt.value}
                    onChange={(e) => setSslMode(e.target.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Review Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(fullConfig).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pipeline Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {pipeline.map((ps, i) => (
                  <div key={ps} className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                      {i + 1}
                    </div>
                    <span>{PROVISION_STEP_LABELS[ps]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {template.nginxTemplate && config.domain && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Nginx Config Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-[11px] bg-muted/50 p-3 rounded-lg overflow-x-auto font-mono">
                  {renderTemplate(template.nginxTemplate, fullConfig)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={isFirst ? onBack : goPrev}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {isFirst ? 'Cancel' : 'Back'}
        </button>

        {isLast ? (
          <button
            onClick={() => onStart(fullConfig)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Start Installation
          </button>
        ) : (
          <button
            onClick={goNext}
            disabled={step === 'configure' && !canProceedConfigure}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              step === 'configure' && !canProceedConfigure
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            Next
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded"
        />
        <div>
          <span className="text-sm font-medium">{field.label}</span>
          {field.description && (
            <p className="text-[11px] text-muted-foreground">{field.description}</p>
          )}
        </div>
      </label>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div>
        <label className="block text-xs font-medium mb-1">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {field.description && <p className="text-[11px] text-muted-foreground mb-1.5">{field.description}</p>}
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium mb-1">
        {field.label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {field.description && <p className="text-[11px] text-muted-foreground mb-1.5">{field.description}</p>}
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={String(value)}
        placeholder={field.placeholder}
        onChange={(e) => {
          onChange(field.type === 'number' ? Number(e.target.value) : e.target.value);
        }}
        min={field.validation?.min}
        max={field.validation?.max}
        className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
