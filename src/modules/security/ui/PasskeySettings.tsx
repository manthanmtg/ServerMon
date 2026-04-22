'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Fingerprint, Trash2, Plus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { createLogger } from '@/lib/logger';

const logger = createLogger('security:passkeys');

interface Passkey {
  id: string;
  createdAt: string;
}

export default function PasskeySettings() {
  const { toast } = useToast();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/passkey/list');
      if (res.ok) {
        const data = await res.json();
        setPasskeys(data.passkeys || []);
      }
    } catch (err) {
      logger.error('Failed to load passkeys', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      // 1. Get options from server
      const optionsRes = await fetch('/api/auth/passkey/register/options');
      if (!optionsRes.ok) throw new Error('Failed to get registration options');
      const options = await optionsRes.json();

      // 2. Start registration in browser
      const attResp = await startRegistration({ optionsJSON: options });

      // 3. Verify with server
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      });

      if (!verifyRes.ok) throw new Error('Failed to verify registration');

      toast({
        title: 'Passkey added',
        description: 'Your passkey has been registered successfully.',
        variant: 'success',
      });
      await loadPasskeys();
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'NotAllowedError') {
        // Ignore user cancellation
        setError(err.message || 'Registration failed');
      } else if (!(err instanceof Error)) {
        setError('Registration failed');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (credentialID: string) => {
    if (!confirm('Are you sure you want to remove this passkey?')) return;

    try {
      const res = await fetch('/api/auth/passkey/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialID }),
      });

      if (res.ok) {
        toast({
          title: 'Passkey removed',
          description: 'The passkey has been removed from your account.',
          variant: 'success',
        });
        await loadPasskeys();
      } else {
        const data = await res.json();
        toast({
          title: 'Deletion failed',
          description: data.error || 'Failed to delete passkey',
          variant: 'destructive',
        });
      }
    } catch (err) {
      logger.error('Failed to delete passkey', err);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while deleting the passkey.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Fingerprint className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Passkeys</CardTitle>
              <CardDescription>Use Face ID, Touch ID, or security keys for 2FA</CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={handleRegister}
            disabled={registering}
            className="gap-2 shrink-0"
          >
            {registering ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add Passkey
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="p-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}

        {loading ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle
              className="h-5 w-5 animate-spin text-muted-foreground/50"
              aria-hidden="true"
            />
            <span>Loading registered passkeys...</span>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-3">
              <Fingerprint className="w-6 h-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground">No passkeys registered</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              Register a biometric key for faster and more secure sign-ins.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {passkeys.map((pk) => (
              <div
                key={pk.id}
                className="flex items-center justify-between p-4 hover:bg-accent/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-success" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate max-w-[180px] sm:max-w-none">
                      Registered Passkey
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
                        ID: {pk.id.slice(0, 8)}...
                      </p>
                      <span className="text-[10px] text-muted-foreground/40">•</span>
                      <p className="text-[11px] text-muted-foreground">
                        Added {new Date(pk.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-[10px] py-0 hidden sm:inline-flex">
                    Active
                  </Badge>
                  <Button
                    variant="ghost"
                    size="lg"
                    type="button"
                    onClick={() => handleDelete(pk.id)}
                    aria-label={`Remove passkey added ${new Date(pk.createdAt).toLocaleDateString()}`}
                    className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-95"
                    title="Remove passkey"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
