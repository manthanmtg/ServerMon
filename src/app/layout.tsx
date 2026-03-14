import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: "ServerMon",
    description: "Secure, modular server monitoring platform.",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "ServerMon",
    },
    formatDetection: {
        telephone: false,
    },
    icons: {
        icon: "/icon.png",
        apple: "/icon.png",
    },
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
        <html lang="en" suppressHydrationWarning>
            <body className="antialiased" suppressHydrationWarning>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
