'use client';
import { FRPC_PROTOCOLS } from '@/lib/fleet/enums';
import { Input } from '@/components/ui/input';
import type { OnboardingForm } from './schema';

type FrpcConfigValue = OnboardingForm['frpcConfig'];

interface FrpcConfigFormProps {
  value: FrpcConfigValue;
  onChange: (next: FrpcConfigValue) => void;
}

export function FrpcConfigForm({ value, onChange }: FrpcConfigFormProps) {
  const set = <K extends keyof FrpcConfigValue>(key: K, next: FrpcConfigValue[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <h4 className="font-medium">FRPC Transport</h4>

      <label className="block">
        <span className="text-sm text-muted-foreground">Protocol</span>
        <select
          value={value.protocol}
          onChange={(e) => set('protocol', e.target.value as FrpcConfigValue['protocol'])}
          aria-label="Protocol"
          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {FRPC_PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.tlsEnabled}
            onChange={(e) => set('tlsEnabled', e.target.checked)}
            aria-label="TLS enabled"
            className="h-4 w-4"
          />
          <span>Enable TLS</span>
        </label>

        <label
          className={`flex items-center gap-2 text-sm ${value.tlsEnabled ? '' : 'opacity-50'}`}
        >
          <input
            type="checkbox"
            checked={value.tlsVerify}
            disabled={!value.tlsEnabled}
            onChange={(e) => set('tlsVerify', e.target.checked)}
            aria-label="TLS verify"
            className="h-4 w-4"
          />
          <span>Verify TLS certificates</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.transportEncryptionEnabled}
            onChange={(e) => set('transportEncryptionEnabled', e.target.checked)}
            aria-label="Transport encryption"
            className="h-4 w-4"
          />
          <span>Transport encryption</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.compressionEnabled}
            onChange={(e) => set('compressionEnabled', e.target.checked)}
            aria-label="Compression"
            className="h-4 w-4"
          />
          <span>Compression</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label
            className="block text-sm text-muted-foreground"
            title="How often the agent sends a heartbeat to the hub (seconds)."
          >
            Heartbeat interval (s)
          </label>
          <Input
            type="number"
            min={5}
            max={3600}
            value={value.heartbeatInterval}
            onChange={(e) => set('heartbeatInterval', Number(e.target.value) || 0)}
            aria-label="Heartbeat interval"
          />
        </div>
        <div>
          <label
            className="block text-sm text-muted-foreground"
            title="Timeout before marking the tunnel as disconnected (seconds)."
          >
            Heartbeat timeout (s)
          </label>
          <Input
            type="number"
            min={10}
            max={3600}
            value={value.heartbeatTimeout}
            onChange={(e) => set('heartbeatTimeout', Number(e.target.value) || 0)}
            aria-label="Heartbeat timeout"
          />
        </div>
        <div>
          <label
            className="block text-sm text-muted-foreground"
            title="Number of pre-established connections to the hub."
          >
            Pool count
          </label>
          <Input
            type="number"
            min={0}
            max={50}
            value={value.poolCount}
            onChange={(e) => set('poolCount', Number(e.target.value) || 0)}
            aria-label="Pool count"
          />
        </div>
      </div>
    </div>
  );
}
