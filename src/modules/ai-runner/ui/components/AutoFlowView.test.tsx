import { describe, expect, it } from 'vitest';
import { getEnabledRunnerOptions } from './AutoFlowView';
import type { AIRunnerProfileDTO, AIRunnerWorkspaceDTO } from '../../types';

const baseProfile: AIRunnerProfileDTO = {
  _id: 'profile-1',
  name: 'Codex',
  slug: 'codex',
  agentType: 'codex',
  invocationTemplate: 'codex "$PROMPT"',
  defaultTimeout: 30,
  maxTimeout: 120,
  shell: '/bin/bash',
  requiresTTY: false,
  env: {},
  enabled: true,
  locked: false,
  createdAt: '2026-04-21T00:00:00.000Z',
  updatedAt: '2026-04-21T00:00:00.000Z',
};

const baseWorkspace: AIRunnerWorkspaceDTO = {
  _id: 'workspace-1',
  name: 'ServerMon',
  path: '/root/repos/ServerMon',
  blocking: true,
  enabled: true,
  createdAt: '2026-04-21T00:00:00.000Z',
  updatedAt: '2026-04-21T00:00:00.000Z',
};

describe('getEnabledRunnerOptions', () => {
  it('returns only enabled profiles and workspaces', () => {
    const options = getEnabledRunnerOptions({
      profiles: [
        baseProfile,
        { ...baseProfile, _id: 'profile-disabled', name: 'Disabled', enabled: false },
      ],
      workspaces: [
        baseWorkspace,
        { ...baseWorkspace, _id: 'workspace-disabled', name: 'Disabled', enabled: false },
      ],
    });

    expect(options.enabledProfiles.map((profile) => profile._id)).toEqual(['profile-1']);
    expect(options.enabledWorkspaces.map((workspace) => workspace._id)).toEqual(['workspace-1']);
  });
});
