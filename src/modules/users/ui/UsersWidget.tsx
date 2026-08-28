'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Users, Shield, Key, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { summarizeUserStats, type UserStats } from './userStats';

function isUserListPayload(payload: unknown): payload is unknown[] {
  return Array.isArray(payload);
}

export default function UsersWidget() {
  const [stats, setStats] = useState<UserStats>({ osCount: 0, webCount: 0, admins: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchStats = async () => {
      try {
        const [osRes, webRes] = await Promise.all([
          fetch('/api/modules/users?type=os', { signal: controller.signal }),
          fetch('/api/modules/users?type=web', { signal: controller.signal }),
        ]);

        if (!osRes.ok || !webRes.ok) {
          throw new Error('Failed to fetch user statistics');
        }

        const [osPayload, webPayload]: unknown[] = await Promise.all([osRes.json(), webRes.json()]);

        if (!isUserListPayload(osPayload) || !isUserListPayload(webPayload)) {
          throw new Error('Received malformed user statistics');
        }

        if (!active) return;

        setStats(
          summarizeUserStats({
            osPayload,
            webPayload,
          })
        );
        setLoadError(false);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchStats();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
      {isLoading ? (
        <div role="status" aria-label="Loading user statistics" className="sr-only" />
      ) : null}

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Users & Access</h3>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Perms Overview
            </p>
          </div>
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-semibold text-destructive">User statistics unavailable</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                We couldn&apos;t load user counts. Open Users &amp; Permissions to retry.
              </p>
            </div>
          </div>
          <a
            href="/users"
            className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Open Users &amp; Permissions
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded-md" />
              ) : (
                <div className="text-xl font-bold tracking-tight">{stats.webCount}</div>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  Web Users
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
              {isLoading ? (
                <div className="h-7 w-12 bg-muted animate-pulse rounded-md" />
              ) : (
                <div className="text-xl font-bold tracking-tight">{stats.osCount}</div>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                <Key className="w-3 h-3 text-amber-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  OS Users
                </span>
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-medium">Active Admins</span>
              </div>
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              ) : (
                <span className="text-xs font-bold text-emerald-600">{stats.admins}</span>
              )}
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isLoading ? 'animate-pulse bg-muted-foreground' : 'bg-emerald-500'}`}
              />
              <span className="text-[11px] font-medium text-muted-foreground">
                {isLoading ? 'Loading user data' : 'User data loaded'}
              </span>
            </div>
            <a
              href="/users"
              className="text-[11px] font-bold text-indigo-500 flex items-center gap-1 hover:underline group"
            >
              Manage{' '}
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
