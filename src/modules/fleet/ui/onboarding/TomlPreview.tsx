'use client';
import { renderFrpcToml } from '@/lib/fleet/toml';
import type { OnboardingForm } from './schema';

export function TomlPreview({ form }: { form: OnboardingForm }) {
  let toml: string;
  try {
    toml = renderFrpcToml({
      serverAddr: '<hub-configured-on-save>',
      serverPort: 7000,
      authToken: '<hub-auth-token>',
      node: {
        slug: form.slug || 'pending',
        frpcConfig: { ...form.frpcConfig, advanced: {} },
        capabilities: {
          terminal: true,
          endpointRuns: true,
          processes: true,
          metrics: true,
          publishRoutes: true,
          tcpForward: true,
          fileOps: false,
          updates: true,
        },
        proxyRules: (form.proxyRules ?? []).map((p) => ({
          ...p,
          status: 'disabled' as const,
        })),
      },
    });
  } catch (e) {
    toml = `# Error: ${(e as Error).message}`;
  }
  return (
    <pre className="rounded-lg border border-border bg-card/50 p-3 text-xs overflow-auto max-h-96 font-mono whitespace-pre">
      {toml}
    </pre>
  );
}
