import { NextResponse } from 'next/server';
import { moduleRegistry } from '@/lib/modules/ModuleRegistry';
import { initializeModules } from '@/lib/modules/ModuleLoader';

export async function GET() {
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
