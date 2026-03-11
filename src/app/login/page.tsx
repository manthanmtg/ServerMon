'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Shield, Lock, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpToken, setTotpToken] = useState('');
    const router = useRouter();

    const handleVerifyCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setStep(2);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyTOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, totpToken }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }
            router.push('/dashboard');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6 bg-background">
            <div className="w-full max-w-sm animate-slide-up">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
                        <Activity className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">ServerMon</h1>
                    <p className="text-sm text-muted-foreground mt-1">Sign in to your server</p>
                </div>

                {/* Card */}
                <div className="rounded-xl border border-border bg-card p-6">
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleVerifyCredentials} className="space-y-4">
                            <Input
                                label="Username"
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="admin"
                                icon={<Shield className="w-4 h-4" />}
                                autoComplete="username"
                            />
                            <Input
                                label="Password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                icon={<Lock className="w-4 h-4" />}
                                autoComplete="current-password"
                            />
                            <Button type="submit" className="w-full" loading={loading}>
                                Continue
                            </Button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyTOTP} className="space-y-5 animate-fade-in">
                            <div className="text-center">
                                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-3">
                                    <Smartphone className="w-5 h-5 text-primary" />
                                </div>
                                <h2 className="text-base font-semibold text-foreground">Two-factor authentication</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Enter the 6-digit code from your authenticator app
                                </p>
                            </div>

                            <input
                                type="text"
                                required
                                value={totpToken}
                                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ''))}
                                className="flex h-12 w-full rounded-lg border border-input bg-background px-3 py-2 text-center text-xl tracking-[0.3em] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
                                placeholder="000000"
                                maxLength={6}
                                autoComplete="one-time-code"
                                inputMode="numeric"
                            />

                            <Button type="submit" className="w-full" loading={loading}>
                                Verify
                            </Button>

                            <button
                                type="button"
                                onClick={() => { setStep(1); setError(''); setTotpToken(''); }}
                                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
                            >
                                Back to login
                            </button>
                        </form>
                    )}
                </div>

                <p className="text-center text-xs text-muted-foreground mt-6">
                    Secured with Argon2 &amp; TOTP
                </p>
            </div>
        </main>
    );
}
