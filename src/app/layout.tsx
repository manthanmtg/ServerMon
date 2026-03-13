import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeContext";
import { ToastProvider } from "@/components/ui/toast";

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
                <ThemeProvider>
                    <ToastProvider>
                        {children}
                    </ToastProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
