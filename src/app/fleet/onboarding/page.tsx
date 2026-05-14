'use client';
import { useState, useEffect } from 'react';
import ProShell from '@/components/layout/ProShell';
import { OnboardingWizard } from '@/modules/fleet/ui/onboarding/OnboardingWizard';
import { Spinner } from '@/components/ui/spinner';
import { resilientFetch, safeJson } from '@/lib/fetch-utils';

export default function Page() {
  const [hubUrl, setHubUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await resilientFetch('/api/fleet/server', { timeout: 8000, retries: 1 });
        if (res.ok) {
          const data = await safeJson<{ envDefaults?: { hubPublicUrl?: string } }>(res);
          if (!data) throw new Error('Failed to parse hub config');
          // Use the public URL if set, otherwise fallback to current host
          const url =
            data.envDefaults?.hubPublicUrl ||
            (typeof window !== 'undefined'
              ? `${window.location.protocol}//${window.location.host}`
              : '');
          setHubUrl(url);
        }
      } catch (err) {
        console.error('Failed to load hub URL for onboarding', err);
        // Fallback
        if (typeof window !== 'undefined') {
          setHubUrl(`${window.location.protocol}//${window.location.host}`);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <ProShell title="Onboard Agent" subtitle="Loading...">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Spinner size="lg" />
        </div>
      </ProShell>
    );
  }

  return (
    <ProShell title="Onboard Agent" subtitle="Connect a new remote machine to the fleet">
      <div className="max-w-4xl">
        <OnboardingWizard hubUrl={hubUrl || ''} />
      </div>
    </ProShell>
  );
}
