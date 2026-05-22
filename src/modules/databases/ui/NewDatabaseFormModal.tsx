'use client';

import { type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DatabaseTemplateId } from '../types';

interface DatabaseTemplateOption {
  id: DatabaseTemplateId;
  label: string;
  versions: string[];
  defaultVersion: string;
  defaultPort: string;
  defaultUsername: string;
  defaultDatabaseName: string;
  description: string;
}

export interface DatabaseFormState {
  templateId: DatabaseTemplateId;
  version: string;
  name: string;
  port: string;
  username: string;
  password: string;
  databaseName: string;
  publicRoute: boolean;
  publicHost: string;
  sslMode: 'disable' | 'prefer' | 'require';
  confirmedPublicExposure: boolean;
}

const templates: DatabaseTemplateOption[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    versions: ['15', '16', '17'],
    defaultVersion: '17',
    defaultPort: '5432',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
    description: 'Reliable SQL database for transactional application workloads.',
  },
  {
    id: 'mongo',
    label: 'MongoDB',
    versions: ['7', '8'],
    defaultVersion: '8',
    defaultPort: '27017',
    defaultUsername: 'root',
    defaultDatabaseName: 'appdb',
    description: 'Document database with simple JSON-style persistence.',
  },
  {
    id: 'mysql',
    label: 'MySQL',
    versions: ['8', '9'],
    defaultVersion: '8',
    defaultPort: '3306',
    defaultUsername: 'servermon',
    defaultDatabaseName: 'servermon',
    description: 'Popular relational database for web application stacks.',
  },
];

export const databaseTemplateMap = Object.fromEntries(
  templates.map((template) => [template.id, template])
) as Record<DatabaseTemplateId, DatabaseTemplateOption>;

export const initialDatabaseForm: DatabaseFormState = {
  templateId: 'postgres',
  version: '17',
  name: '',
  port: '5432',
  username: 'servermon',
  password: '',
  databaseName: 'servermon',
  publicRoute: false,
  publicHost: '',
  sslMode: 'disable',
  confirmedPublicExposure: false,
};

export function databaseFormToPayload(form: DatabaseFormState) {
  return {
    name: form.name,
    templateId: form.templateId,
    version: form.version,
    port: Number(form.port),
    username: form.username,
    password: form.password,
    databaseName: form.databaseName,
    publicRoute: form.publicRoute,
    publicHost: form.publicRoute && form.publicHost.trim() ? form.publicHost.trim() : undefined,
    sslMode: form.sslMode,
  };
}

function fieldClassName() {
  return 'min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20';
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>}
    </div>
  );
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

interface NewDatabaseFormModalProps {
  form: DatabaseFormState;
  submitting: boolean;
  revealedPassword: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateForm: <K extends keyof DatabaseFormState>(key: K, value: DatabaseFormState[K]) => void;
  onUpdateTemplate: (templateId: DatabaseTemplateId) => void;
  onTogglePassword: () => void;
}

export function NewDatabaseFormModal({
  form,
  submitting,
  revealedPassword,
  onClose,
  onSubmit,
  onUpdateForm,
  onUpdateTemplate,
  onTogglePassword,
}: NewDatabaseFormModalProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-database-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <h2 id="new-database-title" className="text-lg font-semibold">
              New Database
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a Docker deployment with data stored on this machine.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close new database dialog"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <Field id="database-template" label="Template">
              <select
                id="database-template"
                className={fieldClassName()}
                value={form.templateId}
                onChange={(event) => onUpdateTemplate(event.target.value as DatabaseTemplateId)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm text-muted-foreground">
              {databaseTemplateMap[form.templateId].description}
            </div>
            <Field id="database-version" label="Major version">
              <select
                id="database-version"
                className={fieldClassName()}
                value={form.version}
                onChange={(event) => onUpdateForm('version', event.target.value)}
              >
                {databaseTemplateMap[form.templateId].versions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="database-name" label="Database name">
              <input
                id="database-name"
                className={fieldClassName()}
                value={form.name}
                onChange={(event) => onUpdateForm('name', event.target.value)}
                placeholder="Main Postgres"
                required
              />
            </Field>
            <Field id="database-port" label="Host port">
              <input
                id="database-port"
                className={fieldClassName()}
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(event) => onUpdateForm('port', event.target.value)}
                required
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Field id="database-username" label="Username">
              <input
                id="database-username"
                className={fieldClassName()}
                value={form.username}
                onChange={(event) => onUpdateForm('username', event.target.value)}
                required
              />
            </Field>
            <Field id="database-password" label="Password">
              <div className="flex gap-2">
                <input
                  id="database-password"
                  className={fieldClassName()}
                  type={revealedPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => onUpdateForm('password', event.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={revealedPassword ? 'Hide password' : 'Show password'}
                  onClick={onTogglePassword}
                >
                  {revealedPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onUpdateForm('password', randomPassword())}
                >
                  Generate
                </Button>
              </div>
            </Field>
            <Field id="database-initial-db" label="Initial database">
              <input
                id="database-initial-db"
                className={fieldClassName()}
                value={form.databaseName}
                onChange={(event) => onUpdateForm('databaseName', event.target.value)}
                required
              />
            </Field>
            <Field id="database-ssl-mode" label="SSL mode">
              <select
                id="database-ssl-mode"
                className={fieldClassName()}
                value={form.sslMode}
                onChange={(event) =>
                  onUpdateForm('sslMode', event.target.value as DatabaseFormState['sslMode'])
                }
              >
                <option value="disable">Disable</option>
                <option value="prefer">Prefer</option>
                <option value="require">Require</option>
              </select>
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4 lg:col-span-2">
            <div>
              <h3 className="text-sm font-semibold">Exposure</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Public route binds the native database TCP port on all interfaces. Local only binds
                it to 127.0.0.1. The data lives on this machine under the managed databases
                directory.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="database-exposure"
                  checked={!form.publicRoute}
                  onChange={() => onUpdateForm('publicRoute', false)}
                />
                Local only
              </label>
              <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="database-exposure"
                  checked={form.publicRoute}
                  onChange={() => onUpdateForm('publicRoute', true)}
                />
                Public route
              </label>
            </div>
            {form.publicRoute && (
              <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <Field
                  id="database-public-host"
                  label="Public host"
                  hint="Optional. Leave blank to use SERVERMON_PUBLIC_HOST, SERVERMON_PUBLIC_IP, PUBLIC_IP, or a placeholder in connection details."
                >
                  <input
                    id="database-public-host"
                    className={fieldClassName()}
                    value={form.publicHost}
                    onChange={(event) => onUpdateForm('publicHost', event.target.value)}
                    placeholder="db.example.com"
                  />
                </Field>
                <p className="text-xs leading-5 text-warning">
                  If this machine is part of ServerMon Fleet with no public IP, do not use public
                  route here. Deploy the database first, then configure your public route once the
                  database is up with host 127.0.0.1 and port {form.port}.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.confirmedPublicExposure}
                    onChange={(event) =>
                      onUpdateForm('confirmedPublicExposure', event.target.checked)
                    }
                  />
                  I understand this exposes the database port
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create Database
          </Button>
        </div>
      </form>
    </div>
  );
}
