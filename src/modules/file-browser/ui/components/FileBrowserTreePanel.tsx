'use client';

import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  PanelLeftClose,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FileBrowserTreeNode {
  name: string;
  path: string;
  hasChildren: boolean;
  isDirectory: boolean;
  children?: FileBrowserTreeNode[];
}

interface TreeBranchProps {
  node: FileBrowserTreeNode;
  currentPath: string;
  expanded: Set<string>;
  loadingPaths: Set<string>;
  onToggle: (path: string, isExpanded: boolean) => void | Promise<void>;
  onSelectDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onCloseMobileTree: () => void;
}

function closeMobileTree(onClose: () => void) {
  if (window.innerWidth < 768) {
    onClose();
  }
}

function TreeBranch({
  node,
  currentPath,
  expanded,
  loadingPaths,
  onToggle,
  onSelectDirectory,
  onSelectFile,
  onCloseMobileTree,
}: TreeBranchProps) {
  const isExpanded = expanded.has(node.path);
  const isActive = currentPath === node.path;
  const isFolder = node.isDirectory;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5">
        <button
          className={cn(
            'min-h-[28px] min-w-[28px] rounded-md text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors flex items-center justify-center',
            !isFolder && 'invisible'
          )}
          onClick={(e) => {
            e.stopPropagation();
            void onToggle(node.path, isExpanded);
          }}
          disabled={!node.hasChildren && !node.children?.length}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name || node.path}`}
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
        </button>
        <button
          onClick={() => {
            if (isFolder) {
              if (!isExpanded) void onToggle(node.path, false);
              onSelectDirectory(node.path);
            } else {
              onSelectFile(node.path);
            }
            closeMobileTree(onCloseMobileTree);
          }}
          className={cn(
            'flex min-h-[32px] flex-1 items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-all duration-200',
            isActive
              ? 'bg-primary/10 text-primary font-semibold shadow-sm border border-primary/20'
              : 'text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground border border-transparent'
          )}
          title={node.path}
        >
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            )
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
          )}
          <span className="truncate">{node.name || node.path}</span>
          {loadingPaths.has(node.path) && (
            <LoaderCircle className="ml-auto h-3 w-3 animate-spin text-primary" />
          )}
        </button>
      </div>
      {isExpanded && node.children && (
        <div className="ml-3.5 border-l border-border/40 pl-2 py-0.5">
          {node.children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              currentPath={currentPath}
              expanded={expanded}
              loadingPaths={loadingPaths}
              onToggle={onToggle}
              onSelectDirectory={onSelectDirectory}
              onSelectFile={onSelectFile}
              onCloseMobileTree={onCloseMobileTree}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileBrowserTreePanelProps {
  tree: FileBrowserTreeNode[];
  currentPath: string;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  width: number;
  onTogglePath: (path: string, isExpanded: boolean) => void | Promise<void>;
  onSelectDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
  onCreateDirectory: () => void;
  onClose: () => void;
}

export function FileBrowserTreePanel({
  tree,
  currentPath,
  expandedPaths,
  loadingPaths,
  width,
  onTogglePath,
  onSelectDirectory,
  onSelectFile,
  onCreateDirectory,
  onClose,
}: FileBrowserTreePanelProps) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />
      <div
        className={cn(
          'flex flex-col bg-background md:bg-secondary/5 overflow-hidden border-r border-border/50 z-30 shrink-0',
          'fixed inset-y-0 left-0 w-[280px] shadow-2xl md:shadow-none',
          'md:relative md:inset-auto md:w-auto'
        )}
        style={{ width }}
      >
        <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-4 border-b border-border/40">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Directory Tree
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={onCreateDirectory}
              aria-label="Create directory"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground md:hidden"
              onClick={onClose}
              aria-label="Close directory tree"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {tree.map((node) => (
            <TreeBranch
              key={node.path}
              node={node}
              currentPath={currentPath}
              expanded={expandedPaths}
              loadingPaths={loadingPaths}
              onToggle={onTogglePath}
              onSelectDirectory={onSelectDirectory}
              onSelectFile={onSelectFile}
              onCloseMobileTree={onClose}
            />
          ))}
        </div>
        <div className="hidden md:flex items-center justify-center py-2 border-t border-border/40 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full mx-2 gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
            Collapse
          </Button>
        </div>
      </div>
    </>
  );
}
