export interface OSUser {
  username: string;
  uid: number;
  home: string;
  shell: string;
  groups: string[];
  hasSudo: boolean;
  sshKeysCount: number;
}

export interface WebUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLoginAt?: string | null;
}

export type UsersTab = 'os' | 'web';
export type UserRecord = OSUser | WebUser;
