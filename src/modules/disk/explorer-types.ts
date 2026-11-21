export interface DiskExplorerEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size: number;
  readError: boolean;
  canDelete: boolean;
}

export interface DiskExplorerListing {
  path: string;
  size: number;
  partial: boolean;
  entries: DiskExplorerEntry[];
  offset: number;
  nextOffset: number | null;
}

interface ScanReference {
  id: string;
  rootPath: string;
}

export type DiskExplorerScan = ScanReference &
  (
    | { status: 'scanning' }
    | { status: 'failed'; error: string }
    | { status: 'ready'; listing: DiskExplorerListing }
  );
