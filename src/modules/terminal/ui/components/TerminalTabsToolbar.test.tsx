import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalTabsToolbar, type TerminalSessionTab } from './TerminalTabsToolbar';

const tabs: TerminalSessionTab[] = [
  { sessionId: 'sess-1', label: 'Terminal 1', order: 0, status: 'connected' },
  { sessionId: 'sess-2', label: 'Terminal 2', order: 1, status: 'connecting' },
];

describe('TerminalTabsToolbar', () => {
  it('renders terminal tabs and dispatches toolbar actions', () => {
    const onSelectTab = vi.fn();
    const onAddTab = vi.fn();
    const onStartRename = vi.fn();
    const onCloseTab = vi.fn();
    const onShowResetConfirm = vi.fn();
    const onShowSavedCommands = vi.fn();
    const onShowHistory = vi.fn();
    const onShowSettings = vi.fn();

    render(
      <TerminalTabsToolbar
        tabs={tabs}
        activeTabId="sess-1"
        editingTabId={null}
        editLabel=""
        onEditLabelChange={vi.fn()}
        onCommitRename={vi.fn()}
        editInputRef={{ current: null }}
        onSelectTab={onSelectTab}
        onAddTab={onAddTab}
        onStartRename={onStartRename}
        onCloseTab={onCloseTab}
        onShowResetConfirm={onShowResetConfirm}
        onShowSavedCommands={onShowSavedCommands}
        onShowHistory={onShowHistory}
        onShowSettings={onShowSettings}
      />
    );

    fireEvent.click(screen.getByText('Terminal 2'));
    expect(onSelectTab).toHaveBeenCalledWith('sess-2');

    fireEvent.doubleClick(screen.getByText('Terminal 1'));
    expect(onStartRename).toHaveBeenCalledWith(tabs[0]);

    fireEvent.click(screen.getByTitle('New terminal'));
    expect(onAddTab).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Reset all terminals'));
    expect(onShowResetConfirm).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Saved commands'));
    expect(onShowSavedCommands).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Session history'));
    expect(onShowHistory).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Terminal settings'));
    expect(onShowSettings).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Close')[0]);
    expect(onCloseTab).toHaveBeenCalledWith('sess-1');
  });

  it('exposes icon-only controls with accessible names', () => {
    render(
      <TerminalTabsToolbar
        tabs={tabs}
        activeTabId="sess-1"
        editingTabId={null}
        editLabel=""
        onEditLabelChange={vi.fn()}
        onCommitRename={vi.fn()}
        editInputRef={{ current: null }}
        onSelectTab={vi.fn()}
        onAddTab={vi.fn()}
        onStartRename={vi.fn()}
        onCloseTab={vi.fn()}
        onShowResetConfirm={vi.fn()}
        onShowSavedCommands={vi.fn()}
        onShowHistory={vi.fn()}
        onShowSettings={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'New terminal' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reset all terminals' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Saved commands' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Session history' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Terminal settings' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Rename Terminal 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close Terminal 1' })).toBeDefined();
  });
});
