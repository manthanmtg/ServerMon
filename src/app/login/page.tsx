'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Smartphone, LogIn, ChevronRight, Activity } from 'lucide-react';

export default function LoginPage() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1: Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // Step 2: TOTP
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
            setError(err instanceof Error ? err.message : 'Unknown error');
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
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6 sm:p-12 selection:bg-indigo-500/30">
            <div className="w-full max-w-[440px] animate-slide-up flex flex-col items-center">
                {/* Brand Header */}
                <div className="text-center mb-12 space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-600 to-pink-500 shadow-xl shadow-indigo-500/20 mb-2 animate-fade-in mx-auto">
                        <Activity className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h1 className="text-5xl font-extrabold tracking-tight text-white font-['Outfit']">
                            Server<span className="text-gradient">Mon</span>
                        </h1>
                        <p className="text-slate-400 font-bold tracking-[0.2em] text-[10px] uppercase mt-2">
                            Secure Pro-Management Portal
                        </p>
                    </div>
                </div>

                {/* Glass Card */}
                <div className="glass w-full rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden group min-h-[460px] flex flex-col justify-center">
                    {/* Inner highlight flair */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 blur-[90px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-colors duration-1000" />

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest mb-8 flex items-center gap-3 animate-fade-in">
                            <Shield className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleVerifyCredentials} className="flex flex-col gap-8">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Access Identity</label>
                                <div className="relative group/input">
                                    <input
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full h-16 pl-16 pr-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all outline-none text-sm font-medium"
                                        placeholder="Username"
                                    />
                                    <Shield className="w-5 h-5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within/input:text-indigo-400 transition-colors" />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Secret Key</label>
                                <div className="relative group/input">
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-16 pl-16 pr-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all outline-none text-sm font-medium"
                                        placeholder="••••••••"
                                    />
                                    <Lock className="w-5 h-5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within/input:text-indigo-400 transition-colors" />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl shadow-indigo-600/30 hover:shadow-indigo-600/50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group/btn mt-2"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Authenticating
                                    </span>
                                ) : (
                                    <>
                                        Sign In
                                        <LogIn className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyTOTP} className="flex flex-col gap-10 animate-fade-in">
                            <div className="text-center space-y-4">
                                <div className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-[2rem] w-fit mx-auto shadow-inner">
                                    <Smartphone className="w-10 h-10 text-indigo-400" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black text-white tracking-tight uppercase tracking-widest text-xs">Security Verification</h2>
                                    <p className="text-xs text-slate-500 max-w-[280px] mx-auto leading-relaxed font-bold">
                                        Enter the 6-digit dynamic token generated by your device.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <input
                                    type="text"
                                    required
                                    value={totpToken}
                                    onChange={(e) => setTotpToken(e.target.value)}
                                    className="w-full h-20 bg-slate-950/60 border border-slate-800 rounded-3xl text-center text-4xl tracking-[0.4em] font-['Outfit'] font-black text-white focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all outline-none"
                                    placeholder="000000"
                                    maxLength={6}
                                />
                            </div>

                            <div className="space-y-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs py-5 rounded-2xl shadow-2xl shadow-indigo-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {loading ? 'Verifying Baseline' : 'System Access'}
                                    <ChevronRight className="w-4 h-4" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="w-full py-2 text-[10px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors"
                                    disabled={loading}
                                >
                                    Back to identity
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer Flair */}
                <div className="mt-16 text-center text-slate-600 text-[10px] font-black tracking-[0.3em] uppercase opacity-40 hover:opacity-100 transition-opacity">
                    &copy; 2026 ServerMon • Deep-Space Terminal V1.0
                </div>
            </div>
        </main>
    );
}
