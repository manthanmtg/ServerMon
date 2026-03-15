import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { encrypt, decrypt } from './session-core';

export { encrypt, decrypt };

export async function login(user: { id: string; username: string; role: string }) {
  // Create the session
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
  const session = await encrypt({ user, expires });

  // Save the session in a cookie
  (await cookies()).set('session', session, { expires, httpOnly: true });
}

export async function logout() {
  // Destroy the session
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

  // Refresh the session so it doesn't expire
  const payload = await decrypt(session);
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);

  // Create new payload with updated expiry
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
