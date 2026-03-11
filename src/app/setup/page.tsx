'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Shield, CheckCircle, Smartphone, User, Lock, Activity, ChevronRight } from 'lucide-react';

export default function SetupPage() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1: Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [totpSecret, setTotpSecret] = useState('');
    const [qrCode, setQrCode] = useState('');
    const [totpToken, setTotpToken] = useState('');

    const router = useRouter();

    const handleNextToTOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/setup/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setTotpSecret(data.secret);
            setQrCode(data.qrCode);
            setStep(2);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/setup/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    totpSecret,
                    totpToken
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            setStep(3);
            setTimeout(() => router.push('/login'), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6 sm:p-12 selection:bg-indigo-500/30">
            <div className="w-full max-w-[500px] animate-slide-up flex flex-col items-center">
                {/* Branding */}
                <div className="text-center mb-12 space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-2 animate-fade-in shadow-xl shadow-indigo-500/10 mx-auto">
                        <Activity className="w-10 h-10 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white font-['Outfit']">
                            Initial <span className="text-gradient">Provisioning</span>
                        </h1>
                        <p className="text-slate-500 font-bold tracking-[0.2em] text-[10px] uppercase mt-2">
                            Configuration Wizard v1.0
                        </p>
                    </div>
                </div>

                {/* Progress Tracker */}
                <div className="flex items-center justify-between mb-12 px-6 w-full relative">
                    <div className="absolute top-5 left-16 right-16 h-[2px] bg-slate-800 -z-10" />
                    <div
                        className="absolute top-5 left-16 h-[2px] bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)] -z-10 transition-all duration-1000 ease-in-out"
                        style={{ width: `${(step - 1) * 41.5}%` }}
                    />

                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-700 ${step >= s
                                ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40'
                                : 'bg-slate-900 border border-slate-800 text-slate-600'
                                }`}>
                                {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                            </div>
                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors duration-700 ${step >= s ? 'text-indigo-400' : 'text-slate-600'
                                }`}>
                                {s === 1 ? 'Core' : s === 2 ? 'Shield' : 'Ready'}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Glass Card */}
                <div className="glass w-full rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden min-h-[500px] flex flex-col justify-center">
                    {/* Inner highlight flair */}
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-pink-500/10 blur-[90px] rounded-full pointer-events-none" />

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest mb-8 flex items-center gap-3 animate-fade-in">
                            <Shield className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleNextToTOTP} className="flex flex-col gap-8 animate-fade-in">
                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Admin Identity</label>
                                    <div className="relative group/input">
                                        <input
                                            type="text"
                                            required
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className="w-full h-16 pl-16 pr-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 outline-none transition-all text-sm font-medium"
                                            placeholder="administrator"
                                        />
                                        <User className="w-5 h-5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within/input:text-indigo-400 transition-colors" />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Master Password</label>
                                    <div className="relative group/input">
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full h-16 pl-16 pr-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 outline-none transition-all text-sm font-medium"
                                            placeholder="••••••••"
                                        />
                                        <Lock className="w-5 h-5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within/input:text-indigo-400 transition-colors" />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block ml-1">Confirm Protocol</label>
                                    <div className="relative group/input">
                                        <input
                                            type="password"
                                            required
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full h-16 pl-16 pr-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 outline-none transition-all text-sm font-medium"
                                            placeholder="••••••••"
                                        />
                                        <CheckCircle className="w-5 h-5 text-slate-500 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within/input:text-indigo-400 transition-colors" />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl shadow-indigo-600/30 hover:shadow-indigo-600/50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group mt-2"
                            >
                                {loading ? 'Initializing Interface' : 'Establish Core'}
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleCompleteSetup} className="flex flex-col gap-10 animate-fade-in">
                            <div className="text-center space-y-4">
                                <div className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-[2.5rem] w-fit mx-auto shadow-inner">
                                    <Smartphone className="w-10 h-10 text-indigo-400" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-black text-white tracking-tight uppercase tracking-widest text-xs">Security Matrix (2FA)</h2>
                                    <p className="text-xs text-slate-500 max-w-[280px] mx-auto leading-relaxed font-bold">
                                        Scan the telemetry token to finalize your administrative identity.
                                    </p>
                                </div>
                            </div>

                            {qrCode && (
                                <div className="bg-white p-6 rounded-[2.5rem] flex justify-center shadow-2xl shadow-indigo-500/10 max-w-[220px] mx-auto group border-[8px] border-indigo-500/10">
                                    <div className="relative">
                                        <Image src={qrCode} alt="TOTP QR Code" width={176} height={176} className="w-40 h-40 group-hover:scale-105 transition-transform duration-700" />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6">
                                <div className="space-y-3 text-center">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] block">Entry Verification</label>
                                    <input
                                        type="text"
                                        required
                                        value={totpToken}
                                        onChange={(e) => setTotpToken(e.target.value)}
                                        className="w-full h-20 bg-slate-950/60 border border-slate-800 rounded-3xl text-center text-4xl tracking-[0.4em] font-['Outfit'] font-black text-white focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
                                        placeholder="000000"
                                        maxLength={6}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-2xl shadow-indigo-600/30 transition-all active:scale-[0.98] disabled:opacity-50"
                                >
                                    {loading ? 'Securing Subsystems' : 'Verify Identity Link'}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <div className="text-center py-12 space-y-8 animate-fade-in flex flex-col items-center">
                            <div className="flex justify-center">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-500 blur-[50px] opacity-20 animate-pulse" />
                                    <div className="bg-indigo-600/20 border border-indigo-500/30 p-8 rounded-full relative">
                                        <CheckCircle className="w-24 h-24 text-indigo-400" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-3xl font-black text-white font-['Outfit'] tracking-tight">Provisioning Complete</h2>
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">
                                    Handshaking with terminal. Redirecting...
                                </p>
                            </div>
                            <div className="flex justify-center gap-3">
                                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Visual Flair */}
                <div className="mt-16 text-center text-[10px] text-slate-600 font-black tracking-[0.4em] uppercase opacity-40">
                    Protocol Secured via Argon2id & TOTP-HMAC
                </div>
            </div>
        </main>
    );
}
