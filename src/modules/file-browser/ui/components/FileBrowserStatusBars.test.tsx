import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FileBrowserSummaryBar, FileBrowserUploadProgressBar } from './FileBrowserStatusBars';

describe('FileBrowserStatusBars', () => {
  it('renders pluralized directory summary with compact total size', () => {
    render(<FileBrowserSummaryBar summary={{ directories: 2, files: 1, totalSize: 1536 }} />);

    expect(screen.getByText('2 folders')).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('renders upload progress text and bar width', () => {
    render(<FileBrowserUploadProgressBar progress={42} />);

    expect(screen.getByText('Uploading files...')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveStyle({ width: '42%' });
  });
});
