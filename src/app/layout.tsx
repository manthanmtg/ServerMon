import type { CSSProperties } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeContext';
import { ToastProvider } from '@/components/ui/toast';

const fontVariables = {
    '--font-outfit': '"Avenir Next", "Segoe UI", sans-serif',
    '--font-inter': '"Helvetica Neue", "Arial Nova", sans-serif',
} as CSSProperties;

export const metadata: Metadata = {
    title: "ServerMon",
    description: "Secure, modular server monitoring platform.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning style={fontVariables}>
            <body className="antialiased" suppressHydrationWarning>
                <ThemeProvider>
                    <ToastProvider>
                        {children}
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
