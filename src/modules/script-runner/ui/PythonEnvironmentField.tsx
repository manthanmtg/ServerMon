import Link from 'next/link';
import { Boxes } from 'lucide-react';
import type {
  PythonEnvironmentOption,
  PythonEnvironmentSelection,
} from '@/modules/python-environments/types';

export default function PythonEnvironmentField({
  options,
  value,
  onChange,
  replay,
  recorded,
}: {
  options: PythonEnvironmentOption[];
  value?: string | null;
  onChange: (value: string | null) => void;
  replay?: boolean;
  recorded?: PythonEnvironmentSelection;
}) {
  if (replay) {
    return (
      <fieldset className="sr-config-group">
        <legend>
          <Boxes size={16} /> Recorded Python environment
        </legend>
        <p className="sr-muted">
          {recorded
            ? `${recorded.name} · Python ${recorded.pythonVersion} · Revision ${recorded.revisionId.slice(0, 8)}`
            : 'Host Python'}
        </p>
      </fieldset>
    );
  }
  return (
    <div className="sr-config-group">
      <label className="sr-field">
        <span>Python environment</span>
        <select
          className="sr-input"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">Host Python</option>
          {value && !options.some(({ id }) => id === value) && (
            <option value={value}>Unavailable environment</option>
          )}
          {options.map(({ id, name, pythonVersion }) => (
            <option key={id} value={id}>
              {name} · Python {pythonVersion}
            </option>
          ))}
        </select>
      </label>
      <Link
        href="/python-environments"
        className="w-fit text-sm text-primary underline underline-offset-4"
      >
        Manage Python environments
      </Link>
    </div>
  );
}
