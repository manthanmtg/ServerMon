import { MetadataRoute } from 'next';

const BRAND_ICON_PATH = '/api/settings/branding/icon';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ServerMon',
    short_name: 'ServerMon',
    description: 'Secure, modular server monitoring platform.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: BRAND_ICON_PATH,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: BRAND_ICON_PATH,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    scope: '/',
  };
}
