import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { getSession } from '@/lib/session';

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const json = await request.json();
  return schema.parse(json);
}

export function zodErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: error.issues.map((issue) => issue.message).join(', '),
      },
      { status: 400 }
    );
  }

  return null;
}
