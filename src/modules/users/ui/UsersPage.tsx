'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ProShell from '@/components/layout/ProShell';
import { Search, ShieldCheck, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import AddUserModal from './AddUserModal';
import { UsersList } from './UsersList';
import type { OSUser, UsersTab, WebUser } from './types';

export default function UsersPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<UsersTab>('os');
  const [osUsers, setOsUsers] = useState<OSUser[]>([]);
  const [webUsers, setWebUsers] = useState<WebUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [osRes, webRes] = await Promise.all([
        fetch('/api/modules/users?type=os'),
        fetch('/api/modules/users?type=web'),
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

  const handleDeleteUser = useCallback(async (type: UsersTab, identifier: string) => {
    if (!confirm(`Are you sure you want to delete this ${type} user?`)) return;

    try {
      const url =
        type === 'web'
          ? `/api/modules/users?type=web&id=${identifier}`
          : `/api/modules/users?type=os&username=${identifier}`;

      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        toast({
          title: 'User Deleted',
          description: 'User has been removed successfully',
          variant: 'success',
        });
        fetchData();
      } else {
        const data = await res.json();
        throw new Error(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Action Failed', description: errorMessage, variant: 'destructive' });
    }
  }, [fetchData, toast]);

  const handleToggleSudo = useCallback(async (username: string, current: boolean) => {
    try {
      const res = await fetch('/api/modules/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'os', username, sudo: !current }),
      });
      if (res.ok) {
        toast({
          title: 'Success',
          description: `Sudo privileges ${!current ? 'granted' : 'revoked'}`,
          variant: 'success',
        });
        fetchData();
      }
    } catch (_err: unknown) {
      toast({ title: 'Error', description: 'Failed to update privileges', variant: 'destructive' });
    }
  }, [fetchData, toast]);

  const handleUpdateRole = useCallback(async (id: string, current: WebUser['role']) => {
    const newRole = current === 'admin' ? 'user' : 'admin';
    try {
      const res = await fetch('/api/modules/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'web', id, role: newRole }),
      });
      if (res.ok) {
        toast({ title: 'Success', description: `Role updated to ${newRole}`, variant: 'success' });
        fetchData();
      }
    } catch (_err: unknown) {
      toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
    }
  }, [fetchData, toast]);

  const normalizedSearchQuery = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const filteredUsers = useMemo(() => {
    const users = activeTab === 'web' ? webUsers : osUsers;

    return users.filter((user) => user.username.toLowerCase().includes(normalizedSearchQuery));
  }, [activeTab, normalizedSearchQuery, osUsers, webUsers]);

  return (
    <ProShell title="Users & Permissions" subtitle="System Access Control">
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex p-1 bg-accent/20 rounded-xl border border-border/50 max-w-fit">
            <button
              onClick={() => setActiveTab('os')}
              className={cn(
                'px-6 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === 'os'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              OS Users
            </button>
            <button
              onClick={() => setActiveTab('web')}
              className={cn(
                'px-6 py-2 rounded-lg text-sm font-semibold transition-all',
                activeTab === 'web'
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Web Access
            </button>
          </div>

          <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3">
            <div className="relative group flex-1 xs:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                aria-label="Search users"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
              />
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span className="xs:hidden sm:inline">Add User</span>
              <span className="hidden xs:inline sm:hidden">Add</span>
            </button>
          </div>
        </div>

        <UsersList
          activeTab={activeTab}
          users={filteredUsers}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onDeleteUser={handleDeleteUser}
          onToggleSudo={handleToggleSudo}
          onUpdateRole={handleUpdateRole}
        />

        {/* Security Advisory */}
        <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-indigo-500 mb-1">
              Identity Security Best Practices
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Always prefer SSH keys over password authentication for system users. Regularly audit
              users with <b>sudo</b> privileges. For ServerMon access, ensure 2FA is enabled via the
              Security module.
            </p>
          </div>
        </div>
      </div>

      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          toast({
            title: 'User Created',
            description: 'System user has been created successfully',
            variant: 'success',
          });
          fetchData();
        }}
      />
    </ProShell>
  );
}
