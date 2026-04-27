'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExposeForm, INITIAL_FORM } from './schema';
import { StepIdentity } from './StepIdentity';
import { StepTarget } from './StepTarget';
import { StepAccess } from './StepAccess';
import { StepPreview } from './StepPreview';
import { StepDns } from './StepDns';
import { StepCreate } from './StepCreate';

type StepKey = 'identity' | 'target' | 'access' | 'preview' | 'dns' | 'create';

const STEP_ORDER: StepKey[] = ['identity', 'target', 'access', 'preview', 'dns', 'create'];
const STEP_LABELS: Record<StepKey, string> = {
  identity: 'Identity',
  target: 'Target',
  access: 'Access',
  preview: 'Preview',
  dns: 'DNS',
  create: 'Create',
};

export interface ExposeServiceWizardProps {
  nodeId?: string;
  mode?: 'create' | 'edit';
  routeId?: string;
  initialForm?: ExposeForm;
  onCreated?: (route: { _id: string; name: string; domain: string }) => void;
  onSaved?: (route: { _id: string; name: string; domain: string }) => void;
  onCancel?: () => void;
}

export function ExposeServiceWizard({
  nodeId,
  mode = 'create',
  routeId,
  initialForm,
  onCreated,
  onSaved,
  onCancel,
}: ExposeServiceWizardProps) {
  const [form, setForm] = useState<ExposeForm>(() => ({
    ...(initialForm ?? INITIAL_FORM),
    nodeId: nodeId ?? '',
  }));
  const [step, setStep] = useState<StepKey>('identity');

  useEffect(() => {
    if (nodeId && nodeId !== form.nodeId) {
      setForm((prev) => ({ ...prev, nodeId }));
    }
    // Only react to an incoming nodeId prop change, not local form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const idx = STEP_ORDER.indexOf(step);
  const next = () => setStep(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  const back = () => setStep(STEP_ORDER[Math.max(idx - 1, 0)]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'edit' ? 'Edit route' : 'Expose service'}</CardTitle>
        <div className="flex flex-wrap gap-1 pt-2" aria-label="wizard steps">
          {STEP_ORDER.map((s, i) => (
            <Badge key={s} variant={s === step ? 'default' : i < idx ? 'success' : 'outline'}>
              {i + 1}. {STEP_LABELS[s]}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'identity' && (
          <StepIdentity form={form} setForm={setForm} next={next} onCancel={onCancel} />
        )}
        {step === 'target' && <StepTarget form={form} setForm={setForm} next={next} back={back} />}
        {step === 'access' && <StepAccess form={form} setForm={setForm} next={next} back={back} />}
        {step === 'preview' && (
          <StepPreview form={form} setForm={setForm} next={next} back={back} />
        )}
        {step === 'dns' && <StepDns form={form} setForm={setForm} next={next} back={back} />}
        {step === 'create' && (
          <StepCreate
            form={form}
            setForm={setForm}
            back={back}
            mode={mode}
            routeId={routeId}
            onCreated={onCreated}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        )}
      </CardContent>
    </Card>
  );
}
