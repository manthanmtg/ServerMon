'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Key, CheckCircle, Smartphone } from 'lucide-react';

export default function SetupPage() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1: Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Step 2: TOTP
    const [totpSecret, setTotpSecret] = useState('');
    const [qrCode, setQrCode] = useState('');
    const [totpToken, setTotpToken] = useState('');

    const router = useRouter();

    // Validate credentials and move to TOTP
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
        } catch (err: any) {
            setError(err.message);
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
                        <p className="text-blue-100 text-sm">System Setup Wizard</p>
                    </div>
                    <Shield className="w-8 h-8 opacity-50" />
                </div>

                <div className="p-8">
                    {/* Stepper Header */}
                    <div className="flex items-center justify-between mb-8">
                        <div className={`flex flex-col items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mb-1 ${step >= 1 ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>1</div>
                            <span className="text-xs font-medium">Account</span>
                        </div>
                        <div className={`h-0.5 flex-1 mx-2 mb-4 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
                        <div className={`flex flex-col items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mb-1 ${step >= 2 ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>2</div>
                            <span className="text-xs font-medium">Security</span>
                        </div>
                        <div className={`h-0.5 flex-1 mx-2 mb-4 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`} />
                        <div className={`flex flex-col items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
                            <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mb-1 ${step >= 3 ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>3</div>
                            <span className="text-xs font-medium">Finish</span>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100 italic">
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleNextToTOTP} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Administrator Username</label>
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                    placeholder="admin"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Password</label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700">Confirm Password</label>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Processing...' : 'Next: Setup 2FA'}
                                <Key className="w-4 h-4" />
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleCompleteSetup} className="space-y-6">
                            <div className="text-center space-y-2">
                                <div className="p-3 bg-blue-50 rounded-full w-fit mx-auto">
                                    <Smartphone className="w-8 h-8 text-blue-600" />
                                </div>
                                <h2 className="font-bold text-gray-800">Two-Factor Authentication</h2>
                                <p className="text-sm text-gray-500 px-4">
                                    Scan this QR code with Google Authenticator or any TOTP app to protect your account.
                                </p>
                            </div>

                            {qrCode && (
                                <div className="bg-white p-4 border rounded-2xl flex justify-center shadow-inner">
                                    <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48" />
                                </div>
                            )}

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
                                {loading ? 'Finalizing...' : 'Complete System Setup'}
                            </button>
                        </form>
                    )}

                    {step === 3 && (
                        <div className="text-center py-8 space-y-4">
                            <div className="flex justify-center">
                                <div className="bg-green-100 p-4 rounded-full animate-bounce">
                                    <CheckCircle className="w-16 h-16 text-green-600" />
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800">Setup Complete!</h2>
                            <p className="text-gray-500">
                                The primary administrator account has been created. Redirecting to login...
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
