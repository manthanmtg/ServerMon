import { describe, expect, it } from 'vitest';
import type { AgentToolStatus } from '@/modules/ai-agents/types';
import { getAgentToolDefinition, sortAgentToolCards } from './tool-catalog';

const baseStatus = {
  displayName: 'Tool',
  command: 'tool',
  installed: false,
  checkedAt: '2026-04-26T12:00:00.000Z',
} satisfies Omit<AgentToolStatus, 'type'>;

describe('AI agent tool catalog', () => {
  it('keeps enabled installed tools ahead of not-installed tools', () => {
    const statuses: AgentToolStatus[] = [
      { ...baseStatus, type: 'claude-code', command: 'claude', installed: false },
      { ...baseStatus, type: 'gemini-cli', command: 'gemini', installed: true },
      { ...baseStatus, type: 'codex', command: 'codex', installed: true },
    ];

    const ordered = sortAgentToolCards({
      statuses,
      sessionCounts: new Map([
        ['codex', 4],
        ['gemini-cli', 1],
      ]),
    });

    expect(ordered.map((tool) => tool.type).slice(0, 3)).toEqual([
      'codex',
      'gemini-cli',
      'claude-code',
    ]);
  });

  it('prioritizes installed tools with available updates', () => {
    const statuses: AgentToolStatus[] = [
      { ...baseStatus, type: 'codex', command: 'codex', installed: true },
      {
        ...baseStatus,
        type: 'gemini-cli',
        command: 'gemini',
        installed: true,
        updateAvailable: true,
      },
    ];

    const ordered = sortAgentToolCards({ statuses, sessionCounts: new Map() });

    expect(ordered[0].type).toBe('gemini-cli');
    expect(ordered[0].cardStatus).toBe('update-available');
  });

  it('defines a runnable Gemini CLI update command', () => {
    const gemini = getAgentToolDefinition('gemini-cli');

    expect(gemini?.actions.update?.command).toEqual(['npm', 'install', '-g', '@google/gemini-cli']);
    expect(gemini?.packageName).toBe('@google/gemini-cli');
  });
});
