'use client';

import React, { useState, useEffect } from 'react';
import ProShell from '@/components/layout/ProShell';
import { Key, ShieldCheck, Search, Trash2, UserPlus, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useCallback } from 'react';

interface OSUser {
    username: string;
    uid: number;
    home: string;
    shell: string;
    groups: string[];
    hasSudo: boolean;
    sshKeysCount: number;
}

interface WebUser {
    id: string;
    username: string;
    role: 'admin' | 'user';
    isActive: boolean;
    lastLoginAt?: string;
}

export default function UsersPage() {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<'os' | 'web'>('web');
    const [osUsers, setOsUsers] = useState<OSUser[]>([]);
    const [webUsers, setWebUsers] = useState<WebUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [osRes, webRes] = await Promise.all([
                fetch('/api/modules/users?type=os'),
                fetch('/api/modules/users?type=web')
            ]);
            
            if (osRes.ok) setOsUsers(await osRes.json());
            if (webRes.ok) setWebUsers(await webRes.json());
        } catch (_err: unknown) {
            toast({ title: 'Error', description: 'Failed to fetch users data', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDeleteUser = async (type: 'os' | 'web', identifier: string) => {
        if (!confirm(`Are you sure you want to delete this ${type} user?`)) return;

        try {
            const url = type === 'web' 
                ? `/api/modules/users?type=web&id=${identifier}`
                : `/api/modules/users?type=os&username=${identifier}`;

            const res = await fetch(url, { method: 'DELETE' });
            if (res.ok) {
                toast({ title: 'User Deleted', description: 'User has been removed successfully', variant: 'success' });
                fetchData();
            } else {
                const data = await res.json();
                throw new Error(data.error);
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            toast({ title: 'Action Failed', description: errorMessage, variant: 'destructive' });
        }
    };

    const handleToggleSudo = async (username: string, current: boolean) => {
        try {
            const res = await fetch('/api/modules/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'os', username, sudo: !current })
            });
            if (res.ok) {
                toast({ title: 'Success', description: `Sudo privileges ${!current ? 'granted' : 'revoked'}`, variant: 'success' });
                fetchData();
            }
        } catch (_err: unknown) {
            toast({ title: 'Error', description: 'Failed to update privileges', variant: 'destructive' });
        }
    };

    const handleUpdateRole = async (id: string, current: string) => {
        const newRole = current === 'admin' ? 'user' : 'admin';
        try {
            const res = await fetch('/api/modules/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'web', id, role: newRole })
            });
            if (res.ok) {
                toast({ title: 'Success', description: `Role updated to ${newRole}`, variant: 'success' });
                fetchData();
            }
        } catch (_err: unknown) {
            toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
        }
    };

    const filteredUsers = activeTab === 'web' 
        ? webUsers.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()))
        : osUsers.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <ProShell title="Users & Permissions" subtitle="System Access Control">
            <div className="space-y-6">
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex p-1 bg-accent/20 rounded-xl border border-border/50 max-w-fit">
                        <button 
                            onClick={() => setActiveTab('web')}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-semibold transition-all",
                                activeTab === 'web' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Web Access
                        </button>
                        <button 
                            onClick={() => setActiveTab('os')}
                            className={cn(
                                "px-6 py-2 rounded-lg text-sm font-semibold transition-all",
                                activeTab === 'os' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            OS Users
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Search users..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                            />
                        </div>
                        <button className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            Add User
                        </button>
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-card border border-border rounded-3xl shadow-md overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border/50 bg-accent/10">
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {activeTab === 'web' ? 'Role' : 'Home / Shell'}
                                    </th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {activeTab === 'web' ? 'Status' : 'Privileges'}
                                    </th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                                        {activeTab === 'web' ? 'Last Login' : 'SSH Keys'}
                                    </th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground animate-pulse">
                                            Scanning identity records...
                                        </td>
                                    </tr>
                                ) : filteredUsers.map((user) => (
                                    <tr key={'id' in user ? user.id : user.username} className="group hover:bg-accent/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                                                    activeTab === 'web' ? "bg-indigo-500/10 text-indigo-500" : "bg-primary/10 text-primary"
                                                )}>
                                                    {(user.username[0] || 'U').toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold">{user.username}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">
                                                        {'id' in user ? user.id.slice(-8) : `UID: ${user.uid}`}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {activeTab === 'web' ? (
                                                <button 
                                                    onClick={() => handleUpdateRole((user as WebUser).id, (user as WebUser).role)}
                                                    className={cn(
                                                        "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                                                        (user as WebUser).role === 'admin' 
                                                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                                            : "bg-accent/40 text-muted-foreground border-border/50"
                                                    )}
                                                >
                                                    {(user as WebUser).role}
                                                </button>
                                            ) : (
                                                <div className="space-y-1">
                                                    <div className="text-xs font-medium truncate max-w-[150px]">{(user as OSUser).home}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">{(user as OSUser).shell}</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {activeTab === 'web' ? (
                                                <div className="flex items-center gap-2">
                                                    <div className={cn("w-2 h-2 rounded-full", (user as WebUser).isActive ? "bg-emerald-500" : "bg-muted")} />
                                                    <span className="text-xs">{(user as WebUser).isActive ? 'Active' : 'Disabled'}</span>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleToggleSudo((user as OSUser).username, (user as OSUser).hasSudo)}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all",
                                                        (user as OSUser).hasSudo 
                                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm shadow-amber-500/5" 
                                                            : "bg-accent/20 text-muted-foreground border-border/30 grayscale opacity-60"
                                                    )}
                                                >
                                                    <ShieldAlert className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-bold uppercase">Sudo</span>
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {activeTab === 'web' ? (
                                                <div className="text-xs text-muted-foreground">
                                                    {(user as WebUser).lastLoginAt ? new Date((user as WebUser).lastLoginAt!).toLocaleDateString() : 'Never'}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <Key className="w-4 h-4 text-primary/60" />
                                                    <span className="text-xs font-bold">{(user as OSUser).sshKeysCount}</span>
                                                    <span className="text-[10px] text-muted-foreground">Keys</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button 
                                                    onClick={() => handleDeleteUser(activeTab, 'id' in user ? user.id : user.username)}
                                                    className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Security Advisory */}
                <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-indigo-500 mb-1">Identity Security Best Practices</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Always prefer SSH keys over password authentication for system users. 
                            Regularly audit users with <b>sudo</b> privileges. For ServerMon access, ensure 2FA is enabled via the Security module.
                        </p>
                    </div>
                </div>
            </div>
        </ProShell>
    );
}
