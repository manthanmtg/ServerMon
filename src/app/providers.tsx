'use client';

import { ThemeProvider } from "@/lib/ThemeContext";
import { BrandProvider } from "@/lib/BrandContext";
import { ToastProvider } from "@/components/ui/toast";

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <BrandProvider>
                <ToastProvider>
                    {children}
                </ToastProvider>
            </BrandProvider>
        </ThemeProvider>
    );
}
