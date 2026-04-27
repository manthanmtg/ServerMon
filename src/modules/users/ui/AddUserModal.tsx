'use client';

import React, { useState } from 'react';
import { X, UserPlus, Terminal as TerminalIcon, Loader2 } from 'lucide-react';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddUserModal({ isOpen, onClose, onSuccess }: AddUserModalProps) {
  const [username, setUsername] = useState('');
  const [shell, setShell] = useState('/bin/bash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/modules/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'os', username, shell }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-user-modal-title"
        aria-describedby="add-user-modal-description"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 id="add-user-modal-title" className="text-lg font-bold tracking-tight">
                Add OS User
              </h3>
              <p id="add-user-modal-description" className="text-sm text-muted-foreground">
                Create a new Linux system user
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="add-user-username"
                className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1"
              >
                Username
              </label>
              <input
                id="add-user-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. jdoe"
                required
                className="w-full h-11 px-4 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="add-user-shell"
                className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1"
              >
                Login Shell
              </label>
              <div className="relative">
                <TerminalIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <select
                  id="add-user-shell"
                  value={shell}
                  onChange={(e) => setShell(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                >
                  <option value="/bin/bash">/bin/bash</option>
                  <option value="/bin/zsh">/bin/zsh</option>
                  <option value="/bin/sh">/bin/sh</option>
                  <option value="/usr/sbin/nologin">/usr/sbin/nologin</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 h-11 rounded-xl font-bold text-sm bg-accent/20 hover:bg-accent/30 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
              </button>
            </div>
          </form>
        </div>

        <button
          type="button"
          aria-label="Close add user dialog"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
