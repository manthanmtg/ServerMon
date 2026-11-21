const filenameEncoder = new TextEncoder();

export function validAttachmentName(name: string) {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !/[\/\\\p{Cc}\p{Cs}]/u.test(name) &&
    filenameEncoder.encode(name).length <= 255
  );
}

export function attachmentByteLength(content: string) {
  const padding = content.endsWith('==') ? 2 : Number(content.endsWith('='));
  return (content.length * 3) / 4 - padding;
}
