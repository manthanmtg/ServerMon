'use client';

import React, { useState, useEffect } from 'react';
import { Users, Shield, Key, ArrowRight, ShieldCheck } from 'lucide-react';

interface UserStats {
  osCount: number;
  webCount: number;
  admins: number;
}

interface WebUserSummary {
  role?: unknown;
}

function toPayloadArray(payload: unknown): unknown[] {
  return Array.isArray(payload) ? payload : [];
}

function isAdminUser(user: unknown): user is WebUserSummary {
  return typeof user === 'object' && user !== null && 'role' in user && user.role === 'admin';
}

export default function UsersWidget() {
  const [stats, setStats] = useState<UserStats>({ osCount: 0, webCount: 0, admins: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [osRes, webRes] = await Promise.all([
          fetch('/api/modules/users?type=os'),
          fetch('/api/modules/users?type=web'),
        ]);

        if (osRes.ok && webRes.ok) {
          const osUsers = toPayloadArray(await osRes.json());
          const webUsers = toPayloadArray(await webRes.json());
          setStats({
            osCount: osUsers.length,
            webCount: webUsers.length,
            admins: webUsers.filter(isAdminUser).length,
          });
        }
      } catch (_err) {
        console.error('Failed to fetch user stats');
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col h-full gap-4">
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

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
          <div className="text-xl font-bold tracking-tight">{stats.webCount}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-medium text-muted-foreground uppercase">
              Web Users
            </span>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-accent/30 border border-border/50">
          <div className="text-xl font-bold tracking-tight">{stats.osCount}</div>
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
          <span className="text-xs font-bold text-emerald-600">{stats.admins}</span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium text-muted-foreground">Access Secure</span>
        </div>
        <a
          href="/users"
          className="text-[11px] font-bold text-indigo-500 flex items-center gap-1 hover:underline group"
        >
          Manage <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </div>
  );
}
