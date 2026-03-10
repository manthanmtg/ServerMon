'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Smartphone, LogIn } from 'lucide-react';

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
        } catch (err: any) {
            setError(err.message);
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
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-blue-600 p-8 text-white flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold italic">ServerMon</h1>
                        <p className="text-blue-100 text-sm">Secure Authentication</p>
                    </div>
                    <Shield className="w-8 h-8 opacity-50" />
                </div>

                <div className="p-8">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100 italic">
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleVerifyCredentials} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Username</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                        placeholder="Enter your username"
                                    />
                                    <Shield className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Password</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                        placeholder="••••••••"
                                    />
                                    <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Authenticating...' : 'Sign In'}
                                <LogIn className="w-4 h-4" />
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyTOTP} className="space-y-6">
                            <div className="text-center space-y-2">
                                <div className="p-3 bg-blue-50 rounded-full w-fit mx-auto">
                                    <Smartphone className="w-8 h-8 text-blue-600" />
                                </div>
                                <h2 className="font-bold text-gray-800">Two-Factor Authentication</h2>
                                <p className="text-sm text-gray-500 px-4">
                                    Please enter the 6-digit code from your authentication app.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 block text-center">Verification Code</label>
                                <input
                                    type="text"
                                    required
                                    value={totpToken}
                                    onChange={(e) => setTotpToken(e.target.value)}
                                    className="w-full px-4 py-3 border rounded-xl text-center text-2xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                    placeholder="000000"
                                    maxLength={6}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Verifying...' : 'Verify & Continue'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="w-full text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors"
                                disabled={loading}
                            >
                                Back to Sign In
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
