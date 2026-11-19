const MAX_NAME_LENGTH = 200;
const FALLBACK_NAME = 'document.pdf';

/** Control characters, plus the ones Windows and macOS reject in file names. */
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f<>:"|?*]/g;

/**
 * Makes a user-supplied file name safe to store and to send back in a download header.
 * It only affects the name people see: storage keys are IDs, never names.
 */
export function sanitizeFileName(raw: string): string {
  const withoutFolders = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = withoutFolders
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, ''); // no hidden files

  if (!cleaned) return FALLBACK_NAME;
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned;
  return shortenKeepingExtension(cleaned, MAX_NAME_LENGTH);
}

function shortenKeepingExtension(name: string, maxLength: number): string {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : '';
  return name.slice(0, maxLength - extension.length) + extension;
}
