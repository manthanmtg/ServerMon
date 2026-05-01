import { describe, expect, it } from 'vitest';
import { getAutoflowCompletionCounts, getEnabledRunnerOptions } from './AutoFlowView';
import type { AIRunnerAutoflowDTO, AIRunnerProfileDTO, AIRunnerWorkspaceDTO } from '../../types';

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

describe('getAutoflowCompletionCounts', () => {
  it('counts completed items once per autoflow id', () => {
    const autoflows: AIRunnerAutoflowDTO[] = [
      {
        _id: 'flow-1',
        name: 'Cleanup',
        mode: 'sequential',
        status: 'running',
        continueOnFailure: false,
        currentIndex: 1,
        items: [
          {
            _id: 'item-1',
            name: 'First',
            promptContent: 'Run first prompt',
            promptType: 'inline',
            agentProfileId: 'profile-1',
            workingDirectory: '/root/repos/ServerMon',
            timeout: 30,
            status: 'completed',
          },
          {
            _id: 'item-2',
            name: 'Second',
            promptContent: 'Run second prompt',
            promptType: 'inline',
            agentProfileId: 'profile-1',
            workingDirectory: '/root/repos/ServerMon',
            timeout: 30,
            status: 'failed',
          },
        ],
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      },
      {
        _id: 'flow-2',
        name: 'Docs',
        mode: 'parallel',
        status: 'draft',
        continueOnFailure: true,
        currentIndex: 0,
        items: [],
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      },
    ];

    expect(getAutoflowCompletionCounts(autoflows)).toEqual({
      'flow-1': 1,
      'flow-2': 0,
    });
  });
});
