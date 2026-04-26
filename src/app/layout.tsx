import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeContext';
import { BrandProvider } from '@/lib/BrandContext';
import { ToastProvider } from '@/components/ui/toast';
import SessionManager from '@/components/auth/SessionManager';

export const dynamic = 'force-dynamic';

const BRAND_ICON_PATH = '/api/settings/branding/icon';

export const metadata: Metadata = {
  title: 'ServerMon',
  description: 'Secure, modular server monitoring platform.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ServerMon',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: BRAND_ICON_PATH,
    apple: BRAND_ICON_PATH,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <BrandProvider>
            <ToastProvider>
              <SessionManager />
              {children}
            </ToastProvider>
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
