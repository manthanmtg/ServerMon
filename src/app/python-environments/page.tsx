import ProShell from '@/components/layout/ProShell';
import PythonEnvironmentsPage from '@/modules/python-environments/ui/PythonEnvironmentsPage';

export default function PythonEnvironmentsRoute() {
  return (
    <ProShell title="Python Environments">
      <PythonEnvironmentsPage />
    </ProShell>
  );
}
