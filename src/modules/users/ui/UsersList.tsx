import { Key, ShieldAlert, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OSUser, UserRecord, UsersTab, WebUser } from './types';

interface UsersListProps {
  activeTab: UsersTab;
  users: UserRecord[];
  isLoading: boolean;
  searchQuery: string;
  onDeleteUser: (type: UsersTab, identifier: string) => void;
  onToggleSudo: (username: string, current: boolean) => void;
  onUpdateRole: (id: string, current: WebUser['role']) => void;
}

function getUserKey(user: UserRecord): string {
  return 'id' in user ? user.id : user.username;
}

function getUserIdentity(user: UserRecord): string {
  return 'id' in user ? user.id.slice(-8) : `UID: ${user.uid}`;
}

function formatLastLogin(user: WebUser): string {
  return user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never';
}

export function UsersList({
  activeTab,
  users,
  isLoading,
  searchQuery,
  onDeleteUser,
  onToggleSudo,
  onUpdateRole,
}: UsersListProps) {
  return (
    <div className="bg-card border border-border rounded-3xl shadow-md overflow-hidden">
      <div className="sm:hidden divide-y divide-border/30">
        {isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground animate-pulse">
            Scanning identity records...
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No users found matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          users.map((user) => (
            <div key={getUserKey(user)} className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <UserIdentity activeTab={activeTab} user={user} />
                <button
                  aria-label={`Delete user ${user.username}`}
                  onClick={() => onDeleteUser(activeTab, getUserKey(user))}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {activeTab === 'web' ? 'Role' : 'Home'}
                  </div>
                  {activeTab === 'web' && 'id' in user ? (
                    <RoleButton user={user} onUpdateRole={onUpdateRole} size="compact" />
                  ) : (
                    <div className="text-xs font-medium truncate">{(user as OSUser).home}</div>
                  )}
                </div>

                <div className="space-y-1 text-right">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {activeTab === 'web' ? 'Status' : 'Privileges'}
                  </div>
                  {activeTab === 'web' && 'id' in user ? (
                    <WebStatus user={user} align="right" />
                  ) : (
                    <div className="flex justify-end">
                      <SudoButton user={user as OSUser} onToggleSudo={onToggleSudo} />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {activeTab === 'web' ? 'Last Login' : 'SSH Keys'}
                  </div>
                  {activeTab === 'web' && 'id' in user ? (
                    <div className="text-xs text-muted-foreground">{formatLastLogin(user)}</div>
                  ) : (
                    <SshKeyCount user={user as OSUser} compact />
                  )}
                </div>

                {activeTab === 'os' && (
                  <div className="space-y-1 text-right">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Shell
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {(user as OSUser).shell}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-accent/10">
              <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {activeTab === 'web' ? 'Role' : 'Home / Shell'}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {activeTab === 'web' ? 'Status' : 'Privileges'}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {activeTab === 'web' ? 'Last Login' : 'SSH Keys'}
              </th>
              <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-sm text-muted-foreground animate-pulse"
                >
                  Scanning identity records...
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={getUserKey(user)} className="group hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-4">
                    <UserIdentity activeTab={activeTab} user={user} />
                  </td>
                  <td className="px-6 py-4">
                    {activeTab === 'web' && 'id' in user ? (
                      <RoleButton user={user} onUpdateRole={onUpdateRole} />
                    ) : (
                      <div className="space-y-1">
                        <div className="text-xs font-medium truncate max-w-[150px]">
                          {(user as OSUser).home}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {(user as OSUser).shell}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {activeTab === 'web' && 'id' in user ? (
                      <WebStatus user={user} />
                    ) : (
                      <SudoButton user={user as OSUser} onToggleSudo={onToggleSudo} withTestId />
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {activeTab === 'web' && 'id' in user ? (
                      <div className="text-xs text-muted-foreground">{formatLastLogin(user)}</div>
                    ) : (
                      <SshKeyCount user={user as OSUser} />
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        data-testid="delete-user-btn"
                        aria-label={`Delete user ${user.username}`}
                        onClick={() => onDeleteUser(activeTab, getUserKey(user))}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserIdentity({ activeTab, user }: { activeTab: UsersTab; user: UserRecord }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm',
          activeTab === 'web' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-primary/10 text-primary'
        )}
      >
        {(user.username[0] || 'U').toUpperCase()}
      </div>
      <div>
        <div className="text-sm font-bold">{user.username}</div>
        <div className="text-[10px] text-muted-foreground font-mono">{getUserIdentity(user)}</div>
      </div>
    </div>
  );
}

function RoleButton({
  user,
  onUpdateRole,
  size = 'default',
}: {
  user: WebUser;
  onUpdateRole: (id: string, current: WebUser['role']) => void;
  size?: 'compact' | 'default';
}) {
  return (
    <button
      aria-label={`Toggle role for ${user.username}`}
      onClick={() => onUpdateRole(user.id, user.role)}
      className={cn(
        'rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
        size === 'compact' ? 'px-2 py-0.5' : 'px-2.5 py-1',
        user.role === 'admin'
          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
          : 'bg-accent/40 text-muted-foreground border-border/50'
      )}
    >
      {user.role}
    </button>
  );
}

function WebStatus({ user, align = 'left' }: { user: WebUser; align?: 'left' | 'right' }) {
  return (
    <div className={cn('flex items-center gap-2', align === 'right' && 'justify-end')}>
      <div className={cn('w-2 h-2 rounded-full', user.isActive ? 'bg-emerald-500' : 'bg-muted')} />
      <span className="text-xs">{user.isActive ? 'Active' : 'Disabled'}</span>
    </div>
  );
}

function SudoButton({
  user,
  onToggleSudo,
  withTestId = false,
}: {
  user: OSUser;
  onToggleSudo: (username: string, current: boolean) => void;
  withTestId?: boolean;
}) {
  return (
    <button
      data-testid={withTestId ? 'toggle-sudo-btn' : undefined}
      aria-label={`Toggle sudo privileges for ${user.username}`}
      onClick={() => onToggleSudo(user.username, user.hasSudo)}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all',
        user.hasSudo
          ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-sm shadow-amber-500/5'
          : 'bg-accent/20 text-muted-foreground border-border/30 grayscale opacity-60'
      )}
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      <span className="text-[10px] font-bold uppercase">Sudo</span>
    </button>
  );
}

function SshKeyCount({ user, compact = false }: { user: OSUser; compact?: boolean }) {
  return (
    <div className={cn('flex items-center', compact ? 'gap-1.5' : 'gap-2')}>
      <Key className={compact ? 'w-3.5 h-3.5 text-primary/60' : 'w-4 h-4 text-primary/60'} />
      <span className="text-xs font-bold">{user.sshKeysCount}</span>
      {!compact && <span className="text-[10px] text-muted-foreground">Keys</span>}
    </div>
  );
}
