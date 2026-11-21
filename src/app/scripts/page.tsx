import ProShell from '@/components/layout/ProShell';
import ScriptRunnerPage from '@/modules/script-runner/ui/ScriptRunnerPage';

export default function ScriptsRoute() {
  return (
    <ProShell title="Scripts">
      <ScriptRunnerPage />
    </ProShell>
  );
}
