import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import BrandSettings from '@/models/BrandSettings';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:settings:branding:icon');

const DEFAULT_ICON_PATH = '/icon.png';

interface BrandingIconSettings {
  logoBase64?: string | null;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function decodeLogo(logoBase64: string): { body: Buffer; contentType: string } | null {
  const logo = logoBase64.trim();
  if (!logo) return null;

  const dataUriMatch = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(logo);
  if (dataUriMatch) {
    const [, contentType, encoding, payload] = dataUriMatch;
    if (!contentType || !payload) return null;

    const body =
      encoding === ';base64'
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload));

    return body.length > 0 ? { body, contentType } : null;
  }

  const body = Buffer.from(logo, 'base64');
  return body.length > 0 ? { body, contentType: 'image/png' } : null;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const settings = (await BrandSettings.findById('brand-settings').lean()) as
      | BrandingIconSettings
      | null;
    const logo = settings?.logoBase64 ? decodeLogo(settings.logoBase64) : null;

    if (!logo) {
      return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, request.url), 307);
    }

    return new NextResponse(toArrayBuffer(logo.body), {
      headers: {
        'Content-Type': logo.contentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    log.error('Failed to load branding icon', error);
    return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, request.url), 307);
  }
}
