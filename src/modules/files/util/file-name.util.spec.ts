import { sanitizeFileName } from './file-name.util.js';

describe('sanitizeFileName', () => {
  it('keeps ordinary names as they are', () => {
    expect(sanitizeFileName('Resume_2026.pdf')).toBe('Resume_2026.pdf');
    expect(sanitizeFileName('Relevé de notes (2026).pdf')).toBe('Relevé de notes (2026).pdf');
  });

  it('drops folders and characters operating systems reject', () => {
    expect(sanitizeFileName('C:\\Users\\me\\Transcript.pdf')).toBe('Transcript.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a<b>c:"d|e?*f.pdf')).toBe('abcdef.pdf');
    expect(sanitizeFileName('bad\u0000name\n.pdf')).toBe('badname.pdf');
  });

  it('never returns an empty or hidden name', () => {
    expect(sanitizeFileName('   ')).toBe('document.pdf');
    expect(sanitizeFileName('...pdf')).toBe('pdf');
    expect(sanitizeFileName('.hidden.pdf')).toBe('hidden.pdf');
  });

  it('shortens long names but keeps the extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(400)}.pdf`);

    expect(name).toHaveLength(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});
