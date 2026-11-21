'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { attachmentByteLength, validAttachmentName } from '../attachments';
import {
  MAX_SCRIPT_ATTACHMENTS,
  MAX_SCRIPT_ATTACHMENT_BYTES,
  type ScriptAttachment,
} from '../types';
import { errorMessage } from './client';

function readAttachment(file: File): Promise<ScriptAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve({ name: file.name, content: reader.result.slice(reader.result.indexOf(',') + 1) });
      } else {
        reject(new Error(`Could not read ${file.name}.`));
      }
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export default function AttachmentsField({
  files,
  onChange,
  reading,
  onReadingChange,
}: {
  files: ScriptAttachment[];
  onChange: (files: ScriptAttachment[]) => void;
  reading: boolean;
  onReadingChange: (reading: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (!pending.current) return;
      pending.current.abort();
      pending.current = null;
      onReadingChange(false);
    };
  }, [onReadingChange]);

  async function addFiles(selected: File[]) {
    if (!selected.length || pending.current) return;
    setError('');

    const names = [...files, ...selected].map(({ name }) => name);
    const existingBytes = files.reduce(
      (total, file) => total + attachmentByteLength(file.content),
      0
    );
    const addedBytes = selected.reduce((total, file) => total + file.size, 0);
    if (
      names.length > MAX_SCRIPT_ATTACHMENTS ||
      existingBytes + addedBytes > MAX_SCRIPT_ATTACHMENT_BYTES
    ) {
      setError(`Attach up to ${MAX_SCRIPT_ATTACHMENTS} files totaling 512 KiB.`);
      return;
    }
    if (names.some((name) => !validAttachmentName(name))) {
      setError('Each attachment needs a valid filename.');
      return;
    }
    if (new Set(names).size !== names.length) {
      setError('An attachment already has that name. Remove it before adding a replacement.');
      return;
    }

    const controller = new AbortController();
    pending.current = controller;
    onReadingChange(true);
    try {
      const added = await Promise.all(selected.map(readAttachment));
      if (!controller.signal.aborted) onChange([...files, ...added]);
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        onReadingChange(false);
      }
    }
  }

  return (
    <fieldset className="sr-config-group" aria-busy={reading}>
      <legend>
        <Paperclip size={16} aria-hidden="true" /> Attachments
      </legend>
      <p className="sr-muted">
        Files sit beside the script in a temporary working directory. Up to {MAX_SCRIPT_ATTACHMENTS}{' '}
        files and 512 KiB total.
      </p>
      {files.length > 0 && (
        <ul className="grid gap-1">
          {files.map(({ name }) => (
            <li key={name} className="flex min-w-0 items-center justify-between gap-2">
              <span className="sr-mono truncate text-sm" title={name}>
                {name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={`Remove ${name}`}
                disabled={reading}
                onClick={() => {
                  setError('');
                  onChange(files.filter((file) => file.name !== name));
                }}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={picker}
        className="sr-only"
        type="file"
        multiple
        aria-label="Add files"
        tabIndex={-1}
        disabled={reading || files.length >= MAX_SCRIPT_ATTACHMENTS}
        onChange={(event) => {
          const selected = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          void addFiles(selected);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sr-config-add"
        loading={reading}
        disabled={files.length >= MAX_SCRIPT_ATTACHMENTS}
        onClick={() => picker.current?.click()}
      >
        <Paperclip size={15} aria-hidden="true" /> Add files
      </Button>
      {error && (
        <p className="sr-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
