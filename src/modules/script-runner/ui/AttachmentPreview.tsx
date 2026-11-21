'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { ScriptAttachment } from '../types';
import CodePreview, { codeLanguageFor } from './CodePreview';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const maxPdfPages = 10;

const imageTypes = new Map([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const videoTypes = new Map([
  ['.m4v', 'video/mp4'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/mp4'],
  ['.ogv', 'video/ogg'],
  ['.webm', 'video/webm'],
]);

const audioTypes = new Map([
  ['.flac', 'audio/flac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.oga', 'audio/ogg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
]);

function textPreview(content: string) {
  try {
    const bytes = Uint8Array.from(atob(content), (byte) => byte.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!/\p{Cc}/u.test(text.replace(/[\r\n\t]/g, ''))) return text;
  } catch {
    // Binary attachments may not contain valid UTF-8.
  }
}

function PdfPreview({ dataUrl, name }: { dataUrl: string; name: string }) {
  const [numPages, setNumPages] = useState<number | null>(null);
  return (
    <Document
      file={dataUrl}
      loading={<p className="sr-muted">Loading {name}…</p>}
      error={<p className="sr-muted">This PDF could not be displayed.</p>}
      className="min-w-0 overflow-auto"
      onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
    >
      {numPages !== null && (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: Math.min(numPages, maxPdfPages) }, (_, index) => (
            <Page
              key={index + 1}
              pageNumber={index + 1}
              width={720}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="max-w-full"
            />
          ))}
          {numPages > maxPdfPages && (
            <p className="sr-muted">
              Showing the first {maxPdfPages} of {numPages} pages — download the file to view the
              rest.
            </p>
          )}
        </div>
      )}
    </Document>
  );
}

export default function AttachmentPreview({ file, id }: { file: ScriptAttachment; id: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const extension = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase() ?? '';
  const imageType = imageTypes.get(extension);
  const videoType = videoTypes.get(extension);
  const audioType = audioTypes.get(extension);
  const isPdf = extension === '.pdf';
  const codeLanguage = codeLanguageFor(extension);
  const codeText = codeLanguage ? textPreview(file.content) : undefined;
  const text =
    imageType || videoType || audioType || isPdf || codeLanguage
      ? undefined
      : textPreview(file.content);

  let content: ReactNode;
  if (!file.content) {
    content = <p className="sr-muted">This file is empty.</p>;
  } else if (imageType && !imageFailed) {
    content = (
      <Image
        src={`data:${imageType};base64,${file.content}`}
        alt={file.name}
        width={800}
        height={600}
        unoptimized
        className="mx-auto h-auto max-h-[min(55dvh,440px)] w-auto max-w-full rounded object-contain"
        onError={() => setImageFailed(true)}
      />
    );
  } else if (videoType) {
    content = (
      <video
        controls
        preload="metadata"
        src={`data:${videoType};base64,${file.content}`}
        aria-label={file.name}
        className="mx-auto max-h-[min(55dvh,440px)] max-w-full rounded"
      />
    );
  } else if (audioType) {
    content = (
      <audio
        controls
        preload="metadata"
        src={`data:${audioType};base64,${file.content}`}
        aria-label={file.name}
        className="w-full"
      />
    );
  } else if (isPdf) {
    content = (
      <PdfPreview dataUrl={`data:application/pdf;base64,${file.content}`} name={file.name} />
    );
  } else if (codeLanguage && codeText !== undefined) {
    content = <CodePreview doc={codeText} language={codeLanguage} />;
  } else if (text !== undefined) {
    content = (
      <pre className="sr-mono max-h-[min(55dvh,440px)] overflow-auto text-sm" tabIndex={0}>
        {text}
      </pre>
    );
  } else {
    content = (
      <p className="sr-muted">
        <a
          className="text-primary underline underline-offset-2"
          download={file.name}
          href={`data:application/octet-stream;base64,${file.content}`}
        >
          Download file
        </a>{' '}
        to view it on your device.
      </p>
    );
  }

  return (
    <section
      id={id}
      aria-label={`Preview of ${file.name}`}
      className="mt-1 min-w-0 rounded-lg border border-border bg-muted/25 p-3"
    >
      {content}
    </section>
  );
}
