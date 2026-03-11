import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeContext";
import { ToastProvider } from "@/components/ui/toast";

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
    weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

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
        <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
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
