'use client';
import ProShell from '@/components/layout/ProShell';
import { OnboardingWizard } from '@/modules/fleet/ui/onboarding/OnboardingWizard';

export default function Page() {
  const hubUrl = typeof window !== 'undefined' ? window.location.host : 'hub';
  return (
    <ProShell title="Onboard Agent" subtitle="Connect a new remote machine to the fleet">
      <div className="max-w-4xl">
        <OnboardingWizard hubUrl={hubUrl} />
      </div>
    </ProShell>
  );
}
