/** @vitest-environment node */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendAttachmentReferencesToPrompt,
  decodeStoredPromptAttachments,
  materializePromptAttachments,
} from './attachments';

const tempDirs: string[] = [];

describe('ai-runner prompt attachments', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('appends uploaded file paths to prompt content', () => {
    expect(
      appendAttachmentReferencesToPrompt('Inspect these inputs.', [
        '/tmp/servermon-ai-runner-attachments/a.png',
        '/tmp/servermon-ai-runner-attachments/notes.txt',
      ])
    ).toBe(
      [
        'Inspect these inputs.',
        '',
        'Refer images/files in below paths:',
        '- /tmp/servermon-ai-runner-attachments/a.png',
        '- /tmp/servermon-ai-runner-attachments/notes.txt',
      ].join('\n')
    );
  });

  it('writes stored prompt attachments to temp files with safe names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'servermon-ai-runner-attachment-test-'));
    tempDirs.push(dir);

    const paths = await materializePromptAttachments(
      [
        {
          name: '../screen shot.png',
          contentType: 'image/png',
          size: 4,
          data: Buffer.from('test'),
        },
      ],
      { baseDir: dir, prefix: 'prompt-1' }
    );

    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain(dir);
    expect(paths[0]).toContain('screen-shot.png');
    await expect(readFile(paths[0], 'utf8')).resolves.toBe('test');
  });

  it('decodes exported base64 attachments for Mongo storage', () => {
    const attachments = decodeStoredPromptAttachments([
      {
        name: 'notes.txt',
        contentType: 'text/plain',
        size: 5,
        data: Buffer.from('hello').toString('base64'),
      },
    ]);

    expect(attachments).toHaveLength(1);
    expect(attachments[0].data.toString('utf8')).toBe('hello');
  });
});
