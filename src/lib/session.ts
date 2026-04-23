import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt } from './session-core';
import { SESSION_TIMEOUT_MS } from './session-config';

export { encrypt, decrypt };

function getSessionExpiry() {
  return new Date(Date.now() + SESSION_TIMEOUT_MS);
}

export async function login(user: { id: string; username: string; role: string }) {
  const expires = getSessionExpiry();
  const session = await encrypt({ user, expires });

  (await cookies()).set('session', session, { expires, httpOnly: true });
}

export async function logout() {
  (await cookies()).set('session', '', { expires: new Date(0) });
}

export async function getSession() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function updateSession(request: NextRequest) {
  const session = request.cookies.get('session')?.value;
  if (!session) return;

  const payload = await decrypt(session);
  const expires = getSessionExpiry();

  const newPayload = { ...payload, expires };

  const res = NextResponse.next();
  res.cookies.set({
    name: 'session',
    value: await encrypt(newPayload as Record<string, unknown>),
    httpOnly: true,
    expires: expires,
  });
  return res;
}
