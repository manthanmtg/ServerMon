'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Activity, Shield, Lock, User, Smartphone, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const router = useRouter();

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
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
      setError(err instanceof Error ? err.message : 'Setup failed');
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
        body: JSON.stringify({ username, password, totpSecret, totpToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setStep(3);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { label: 'Account', done: step > 1 },
    { label: '2FA Setup', done: step > 2 },
    { label: 'Complete', done: step > 3 },
  ];

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Setup ServerMon</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your admin account to get started
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  step > i + 1
                    ? 'bg-success text-success-foreground'
                    : step === i + 1
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {step > i + 1 ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:inline ${
                  step === i + 1 ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px ${step > i + 1 ? 'bg-success' : 'bg-border'}`} />
              )}
            </div>
          ))}
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
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <Input
                label="Admin username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                icon={<User className="w-4 h-4" />}
              />
              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                icon={<Lock className="w-4 h-4" />}
              />
              <Input
                label="Confirm password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                icon={<CheckCircle className="w-4 h-4" />}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Continue
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleCompleteSetup} className="space-y-5 animate-fade-in">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-3">
                  <Smartphone className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground">Set up two-factor auth</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Scan this QR code with your authenticator app
                </p>
              </div>

              {qrCode && (
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-xl">
                    <Image
                      src={qrCode}
                      alt="TOTP QR Code"
                      width={160}
                      height={160}
                      className="w-40 h-40"
                    />
                  </div>
                </div>
              )}

              {totpSecret && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Or enter this key manually:</p>
                  <code className="text-xs font-mono bg-secondary px-3 py-1.5 rounded-md text-foreground select-all">
                    {totpSecret}
                  </code>
                </div>
              )}

              <Input
                label="Verification code"
                type="text"
                required
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-lg tracking-widest font-mono"
                autoComplete="one-time-code"
              />

              <Button type="submit" className="w-full" loading={loading}>
                Complete setup
              </Button>
            </form>
          )}

          {step === 3 && (
            <div className="text-center py-8 animate-fade-in">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/10 mb-4">
                <CheckCircle className="w-7 h-7 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Setup complete</h2>
              <p className="text-sm text-muted-foreground">Redirecting to login...</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
