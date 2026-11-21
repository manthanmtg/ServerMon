'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, File, Folder, LoaderCircle, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { formatBytes } from '@/lib/utils';
import type { DiskExplorerEntry, DiskExplorerScan } from '../../explorer-types';
import type { DiskSettings } from '../DiskSettingsModal';

const endpoint = '/api/modules/disk/explorer';
const POLL_MS = 1000;

interface ScanLocation {
  id: string;
  offset: number;
}

interface DeletionPreview {
  token: string;
  size: number;
  modifiedAt: number;
}

interface DeleteConfirmation extends DeletionPreview {
  id: string;
  entry: DiskExplorerEntry;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Disk explorer request failed.');
  return data;
}

function send<T>(method: 'POST' | 'DELETE', body: object) {
  return request<T>(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getBreadcrumbs(current: string) {
  const crumbs = [{ name: '/', path: '/' }];
  for (const name of current.split('/').filter(Boolean)) {
    const parent = crumbs[crumbs.length - 1].path;
    crumbs.push({ name, path: parent === '/' ? '/' + name : parent + '/' + name });
  }
  return crumbs;
}

export function CapacityAnalysis({ settings }: { settings: DiskSettings }) {
  const [scanPath, setScanPath] = useState('/');
  const [location, setLocation] = useState<ScanLocation | null>(null);
  const [scan, setScan] = useState<DiskExplorerScan | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState<DeleteConfirmation | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams({ id: location.id, offset: String(location.offset) });

    async function load() {
      try {
        const result = await request<DiskExplorerScan>(endpoint + '?' + params, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (controller.signal.aborted) return;
        setScan(result);
        if (result.status === 'scanning') timer = setTimeout(load, POLL_MS);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Could not load scan results.');
        }
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [location]);

  async function startScan(path: string) {
    setStarting(true);
    setError('');
    setLocation(null);
    setScan(null);
    try {
      const result = await send<DiskExplorerScan>('POST', { action: 'scan', path });
      setLocation({ id: result.id, offset: 0 });
      setScan(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start the scan.');
    } finally {
      setStarting(false);
    }
  }

  function submitScan(event: FormEvent) {
    event.preventDefault();
    if (scanPath.trim()) void startScan(scanPath);
  }

  function browse(directory: string) {
    void startScan(directory);
  }

  function changePage(offset: number) {
    if (!location || mutationPending) return;
    setError('');
    setScan(null);
    setLocation({ id: location.id, offset });
  }

  async function prepareDeletion(entry: DiskExplorerEntry) {
    if (!location || preparing || confirmation) return;
    setPreparing(true);
    try {
      const preview = await send<DeletionPreview>('POST', {
        action: 'prepare-delete',
        id: location.id,
        path: entry.path,
      });
      setConfirmation({ ...preview, id: location.id, entry });
    } catch (error) {
      toast({
        title: 'Could not prepare deletion',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setPreparing(false);
    }
  }

  async function confirmDeletion() {
    if (!confirmation || deleting || scan?.status !== 'ready') return;
    setDeleting(true);
    try {
      await send('DELETE', { id: confirmation.id, token: confirmation.token });
      toast({ title: 'Entry deleted', variant: 'success' });
    } catch (error) {
      toast({
        title: 'Deletion failed',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setConfirmation(null);
      setDeleting(false);
      await startScan(scan.rootPath);
    }
  }

  const listing = scan?.status === 'ready' ? scan.listing : null;
  const failure = error || (scan?.status === 'failed' ? scan.error : '');
  const loading =
    starting || (!failure && Boolean(location) && (!scan || scan.status === 'scanning'));
  const mutationPending = preparing || Boolean(confirmation) || deleting;
  const formatSize = (size: number) => formatBytes(size, settings.unitSystem);

  return (
    <Card className="min-w-0 border-border/50 bg-card/50 shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">Capacity Analysis</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Explore disk usage by directory.</p>
        </div>
        <form onSubmit={submitScan} className="flex w-full items-center gap-2 sm:w-auto">
          <Input
            aria-label="Scan directory"
            value={scanPath}
            onChange={(event) => setScanPath(event.target.value)}
            className="h-11 min-w-0 flex-1 bg-secondary/20 font-mono text-xs sm:w-36"
            placeholder="/path"
            disabled={mutationPending}
            required
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={loading || mutationPending}
            className="h-11 gap-2"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            Scan
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {preparing && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking the deletion target…
          </p>
        )}
        {failure && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
          >
            {failure}
          </p>
        )}
        {loading && (
          <div
            role="status"
            className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border"
          >
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              {scan?.status === 'scanning' || starting
                ? 'Scanning disk usage…'
                : 'Loading directory…'}
            </p>
          </div>
        )}
        {!failure && !loading && !listing && (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border p-5 text-center">
            <div>
              <Search className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold">Ready for Analysis</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter a directory to find what takes up space on its filesystem.
              </p>
            </div>
          </div>
        )}
        {listing && scan && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border pb-2">
              <nav
                aria-label="Directory breadcrumbs"
                className="flex min-w-0 flex-wrap items-center"
              >
                {getBreadcrumbs(listing.path).map((crumb, index) => (
                  <div key={crumb.path} className="flex min-w-0 items-center">
                    {index > 0 && (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    {crumb.path === listing.path ? (
                      <span aria-current="location" className="break-all px-2 text-sm font-medium">
                        {crumb.name}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => browse(crumb.path)}
                        disabled={mutationPending}
                        className="h-11 min-w-0 px-2 text-sm"
                      >
                        <span className="truncate">{crumb.name}</span>
                      </Button>
                    )}
                  </div>
                ))}
              </nav>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatSize(listing.size)}
              </span>
            </div>
            {listing.partial && (
              <p
                role="status"
                className="rounded-lg border border-warning/30 p-2 text-xs text-warning"
              >
                Some entries could not be scanned. Reported sizes may be incomplete.
              </p>
            )}
            {listing.entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No entries to display.
              </p>
            ) : (
              <ul
                aria-label="Disk usage by entry"
                className="max-h-[28rem] divide-y divide-border overflow-y-auto"
              >
                {listing.entries.map((entry) => (
                  <li
                    key={entry.path}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 py-1"
                  >
                    <div className="min-w-0">
                      {entry.kind === 'directory' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => browse(entry.path)}
                          disabled={mutationPending}
                          className="h-11 min-w-0 max-w-full justify-start gap-2 px-2"
                          title={entry.name}
                        >
                          <Folder className="size-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">{entry.name}</span>
                        </Button>
                      ) : (
                        <span
                          className="flex min-h-11 items-center gap-2 px-2 text-sm"
                          title={entry.name}
                        >
                          <File
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">{entry.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-right text-xs tabular-nums">
                        {formatSize(entry.size)}
                        {entry.readError && (
                          <span className="block text-[10px] text-warning">Partial</span>
                        )}
                      </span>
                      {entry.canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={mutationPending}
                          onClick={() => void prepareDeletion(entry)}
                          aria-label={'Delete ' + entry.name}
                          className="size-11 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-primary/60"
                        style={{
                          width:
                            (listing.size ? Math.min((entry.size / listing.size) * 100, 100) : 0) +
                            '%',
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {(listing.offset > 0 || listing.nextOffset !== null) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Showing {listing.offset + 1}–{listing.offset + listing.entries.length}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mutationPending || listing.offset === 0}
                    onClick={() => changePage(Math.max(listing.offset - 100, 0))}
                    className="h-11"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mutationPending || listing.nextOffset === null}
                    onClick={() => changePage(listing.nextOffset ?? 0)}
                    className="h-11"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      {confirmation && (
        <ConfirmationModal
          isOpen
          title={
            confirmation.entry.kind === 'directory' ? 'Delete this folder?' : 'Delete this file?'
          }
          message={
            'Permanently delete this ' +
            (confirmation.entry.kind === 'directory' ? 'folder and all of its contents' : 'file') +
            '? It occupies ' +
            formatSize(confirmation.size) +
            ' on disk. Last modified ' +
            new Date(confirmation.modifiedAt * 1000).toLocaleString() +
            '.'
          }
          description={confirmation.entry.path}
          confirmLabel="Delete permanently"
          onConfirm={() => void confirmDeletion()}
          onCancel={() => setConfirmation(null)}
          isLoading={deleting}
        />
      )}
    </Card>
  );
}
