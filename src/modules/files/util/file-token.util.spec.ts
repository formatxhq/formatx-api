import { createFileToken, fileTokenMatches, hashFileToken } from './file-token.util.js';

describe('file tokens', () => {
  it('are long, URL-safe and unique', () => {
    const a = createFileToken();
    const b = createFileToken();

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('match only their own hash', () => {
    const token = createFileToken();
    const hash = hashFileToken(token);

    expect(hash).not.toContain(token);
    expect(fileTokenMatches(token, hash)).toBe(true);
    expect(fileTokenMatches(createFileToken(), hash)).toBe(false);
  });

  it('never match a missing token or a wiped hash', () => {
    const hash = hashFileToken(createFileToken());

    expect(fileTokenMatches(undefined, hash)).toBe(false);
    expect(fileTokenMatches('', hash)).toBe(false);
    expect(fileTokenMatches(createFileToken(), '')).toBe(false);
  });
});
