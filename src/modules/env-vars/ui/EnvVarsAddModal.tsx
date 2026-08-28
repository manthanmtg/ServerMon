import { useRef } from 'react';
import { Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ScopeChoice = 'user' | 'system';

interface EnvVarsAddModalProps {
  keyName: string;
  onKeyNameChange: (val: string) => void;
  value: string;
  onValueChange: (val: string) => void;
  scope: ScopeChoice;
  onScopeChange: (val: ScopeChoice) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function scopeText(scope: ScopeChoice) {
  if (scope === 'user') {
    return 'User scope is written to the OS user environment so a fresh terminal can see it with env.';
  }
  return 'System scope affects the whole machine and is shown as an admin command to run manually.';
}

export function EnvVarsAddModal({
  keyName,
  onKeyNameChange,
  value,
  onValueChange,
  scope,
  onScopeChange,
  saving,
  onSave,
  onCancel,
}: EnvVarsAddModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Add variable"
      description={scopeText(scope)}
      size="sm"
      closeLabel="Close add variable dialog"
      initialFocusRef={nameInputRef}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} loading={saving}>
            <Terminal className="h-4 w-4" />
            Save variable
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          ref={nameInputRef}
          id="env-var-name"
          label="Name"
          value={keyName}
          onChange={(event) => onKeyNameChange(event.target.value)}
        />
        <Input
          id="env-var-value"
          label="Value"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <div role="group" aria-label="Variable scope" className="grid grid-cols-2 gap-2">
          {(['user', 'system'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={scope === choice}
              onClick={() => onScopeChange(choice)}
              className={cn(
                'min-h-[44px] rounded-lg border px-3 text-sm font-semibold capitalize',
                scope === choice
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border'
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
