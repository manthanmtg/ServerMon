import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalTabStrip } from './TerminalTabStrip';
import type { FleetTerminalTab } from './types';

const tabs: FleetTerminalTab[] = [
  {
    sessionId: 'session-1',
    label: 'Shell 1',
    order: 0,
    status: 'connected',
    started: true,
    createdAt: '2026-08-28T00:00:00.000Z',
    lastActiveAt: '2026-08-28T00:00:00.000Z',
  },
];

function renderTabStrip(onSetActiveTabId = vi.fn()) {
  render(
    <TerminalTabStrip
      tabs={tabs}
      activeTabId="session-1"
      onSetActiveTabId={onSetActiveTabId}
      onAddTab={vi.fn()}
      onCloseTab={vi.fn()}
      onRenameTab={vi.fn()}
      onIssueAction={vi.fn()}
      onPasteClipboard={vi.fn()}
      activeTabStarted
    />
  );

  return onSetActiveTabId;
}

describe('TerminalTabStrip', () => {
  it('does not activate a tab or prevent typing spaces while its label is being edited', () => {
    const onSetActiveTabId = renderTabStrip();

    fireEvent.click(screen.getByRole('button', { name: 'Rename terminal tab Shell 1' }));
    const input = screen.getByRole('textbox', { name: 'Rename terminal tab Shell 1' });
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' ',
    });

    input.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(onSetActiveTabId).not.toHaveBeenCalled();
  });
});
