export type EnvVarScope = 'user' | 'system' | 'session';
export type EnvVarPlatform = NodeJS.Platform;
export type EnvVarAction = 'add' | 'delete';

export interface EnvVarRecord {
  key: string;
  value: string;
  scope: EnvVarScope;
  source: string;
  writable: boolean;
  sensitive: boolean;
  inCurrentSession: boolean;
}

export interface SkippedEnvVar {
  key: string;
  source: string;
  reason: string;
}

export interface ParsedEnvFile {
  variables: EnvVarRecord[];
  skipped: SkippedEnvVar[];
}

export interface EnvVarTarget {
  platform: EnvVarPlatform;
  shell: string | null;
  home: string;
  userFile: string | null;
  writable: boolean;
  note: string;
}

export interface EnvVarInstruction {
  title: string;
  command: string;
  description: string;
  requiresAdmin: boolean;
}

export interface EnvVarsSnapshot {
  platform: EnvVarPlatform;
  shell: string | null;
  target: EnvVarTarget;
  persistent: EnvVarRecord[];
  session: EnvVarRecord[];
  skipped: SkippedEnvVar[];
  systemInstructions: {
    addTemplate: EnvVarInstruction;
    deleteTemplate: EnvVarInstruction;
  };
  guidance: string[];
  generatedAt: string;
}

export interface EnvVarMutationInput {
  key: string;
  value?: string;
  scope: 'user' | 'system';
}

export interface EnvVarMutationResult {
  applied: boolean;
  message: string;
  instruction?: EnvVarInstruction;
  target?: EnvVarTarget;
}
