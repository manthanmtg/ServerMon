'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Plus,
  Play,
  Pencil,
  Trash2,
  Bookmark,
  Search,
  FolderOpen,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';

interface SavedCommand {
  _id: string;
  name: string;
  command: string;
  description?: string;
  category?: string;
  createdBy: string;
  createdAt: string;
}

interface SavedCommandsModalProps {
  onClose: () => void;
  onRunCommand: (command: string) => void;
}

interface CommandForm {
  name: string;
  command: string;
  description: string;
  category: string;
}

const emptyForm: CommandForm = { name: '', command: '', description: '', category: 'General' };

export default function SavedCommandsModal({ onClose, onRunCommand }: SavedCommandsModalProps) {
  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommandForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchCommands = useCallback(async () => {
    try {
      const res = await fetch('/api/terminal/commands');
      const data = await res.json();
      if (data.commands) setCommands(data.commands);
    } catch {
      toast({ title: 'Failed to load saved commands', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCommands();
  }, [fetchCommands]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.command.trim()) {
      toast({ title: 'Name and command are required', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await fetch('/api/terminal/commands', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      await fetchCommands();
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      toast({ title: editingId ? 'Command updated' : 'Command saved', variant: 'success' });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : 'Failed to save command',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/terminal/commands?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setCommands((prev) => prev.filter((c) => c._id !== id));
      setDeleteConfirmId(null);
      toast({ title: 'Command deleted', variant: 'success' });
    } catch {
      toast({ title: 'Failed to delete command', variant: 'destructive' });
    }
  };

  const startEdit = (cmd: SavedCommand) => {
    setForm({
      name: cmd.name,
      command: cmd.command,
      description: cmd.description || '',
      category: cmd.category || 'General',
    });
    setEditingId(cmd._id);
    setShowForm(true);
  };

  const handleCopy = async (command: string, id: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleRun = (command: string) => {
    onRunCommand(command + '\n');
    onClose();
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const filtered = commands.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.command.toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q)
    );
  });

  const grouped = filtered.reduce<Record<string, SavedCommand[]>>((acc, cmd) => {
    const cat = cmd.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl max-h-[85dvh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bookmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground leading-none">
                Saved Commands
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Manage and run your saved terminal commands
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full w-8 h-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Search + Add bar */}
        <div className="flex items-center gap-2 p-3 border-b border-border bg-card">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search commands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              setForm({ ...emptyForm });
              setEditingId(null);
              setShowForm(true);
            }}
            className="shrink-0 h-9 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="p-4 border-b border-border bg-secondary/20 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">
                {editingId ? 'Edit Command' : 'New Command'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Restart Nginx"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Nginx, Docker"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
                    maxLength={50}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Command</label>
                <textarea
                  placeholder="e.g. sudo systemctl restart nginx"
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  className="w-full h-20 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground font-mono placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40 resize-none"
                  maxLength={2000}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Description <span className="opacity-50">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Short description of what this does"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/40"
                  maxLength={500}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving}>
                  {editingId ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Command List */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground animate-pulse">Loading commands...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-2">
                <Bookmark className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground font-medium">
                {search ? 'No matching commands' : 'No saved commands yet'}
              </p>
              <p className="text-xs text-muted-foreground">
                {search
                  ? 'Try a different search term'
                  : 'Save frequently used commands for quick access'}
              </p>
              {!search && !showForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={() => {
                    setForm({ ...emptyForm });
                    setEditingId(null);
                    setShowForm(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add your first command
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {categories.map((category) => (
                <div key={category}>
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-secondary/30 transition-colors"
                    onClick={() => toggleCategory(category)}
                  >
                    {collapsedCategories.has(category) ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{category}</span>
                    <span className="ml-auto text-[10px] font-normal bg-secondary rounded-full px-2 py-0.5">
                      {grouped[category].length}
                    </span>
                  </button>
                  {!collapsedCategories.has(category) && (
                    <div className="divide-y divide-border/30">
                      {grouped[category].map((cmd) => (
                        <div
                          key={cmd._id}
                          className="group px-4 py-3 hover:bg-secondary/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {cmd.name}
                              </p>
                              {cmd.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {cmd.description}
                                </p>
                              )}
                              <div className="mt-1.5 flex items-center gap-2">
                                <code className="text-xs font-mono text-primary/80 bg-primary/5 border border-primary/10 rounded px-2 py-0.5 max-w-full truncate block">
                                  {cmd.command}
                                </code>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1.5 rounded-md text-muted-foreground hover:text-success hover:bg-success/10 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center"
                                onClick={() => handleRun(cmd.command)}
                                title="Run command"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <button
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center"
                                onClick={() => handleCopy(cmd.command, cmd._id)}
                                title="Copy command"
                              >
                                {copiedId === cmd._id ? (
                                  <Check className="w-3.5 h-3.5 text-success" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center"
                                onClick={() => startEdit(cmd)}
                                title="Edit command"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {deleteConfirmId === cmd._id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    className="p-1.5 rounded-md text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center text-xs font-medium"
                                    onClick={() => handleDelete(cmd._id)}
                                    title="Confirm delete"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center"
                                    onClick={() => setDeleteConfirmId(null)}
                                    title="Cancel delete"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-1.5 flex items-center justify-center"
                                  onClick={() => setDeleteConfirmId(cmd._id)}
                                  title="Delete command"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-secondary/10 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {commands.length} command{commands.length !== 1 ? 's' : ''} saved
          </span>
          <span className="hidden sm:inline">Click play to run in active terminal</span>
        </div>
      </div>
    </div>
  );
}
