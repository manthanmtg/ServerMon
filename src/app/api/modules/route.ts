import { NextResponse } from 'next/server';
import { moduleRegistry } from '@/lib/modules/ModuleRegistry';
import { initializeModules } from '@/lib/modules/ModuleLoader';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Ensure modules are initialized for this request (in dev this is helpful)
  await initializeModules();

  const modules = moduleRegistry.getAllModules().map((m) => ({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    isEnabled: true, // For now all are enabled
  }));

  return NextResponse.json({ modules });
}
