// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { WindowsFileNameValidity } from '../../src/domain/windows-file-name-validity.js';

const validity = new WindowsFileNameValidity();

describe('WindowsFileNameValidity', () => {
  it.each([
    ['a plain name', 'Heist films'],
    ['a name with an extension', 'sunset-002.mp4'],
    ['a name with several dots', 'clip.final.mp4'],
    ['a space before an inner dot', 'a .b.txt'],
    ['a dot before an inner dot', 'alpha..mp4'],
    ['a device name inside a longer word', 'console.txt'],
    ['a device name after the first dot', 'notes.con'],
    ['a name starting with a dot', '.hidden'],
    ['a no-break space at the end', 'clip '],
  ])('allows %s', (_scenario, name) => {
    expect(validity.isLegalWindowsFileName(name)).toBe(true);
  });

  it.each([
    ['an empty name', ''],
    ['the current folder', '.'],
    ['the parent folder', '..'],
    ['a leading space', ' clip.mp4'],
    ['a trailing space', 'clip.mp4 '],
    ['a trailing dot', 'clip.'],
    ['a colon', 'a:b'],
    ['a backslash', 'sub\\clip.mp4'],
    ['a slash', 'sub/clip.mp4'],
    ['a question mark', 'what?'],
    ['an asterisk', 'star*'],
    ['a pipe', 'pipe|x'],
    ['angle brackets', '<clip>'],
    ['a double quote', 'say "hi"'],
    ['a tab', 'tab\tname'],
    ['a NUL character', 'nul\u0000name'],
    ['a device name', 'CON'],
    ['a device name in lower case', 'aux'],
    ['a numbered device name', 'COM3'],
    ['a device name with an extension', 'nul.txt'],
    ['a device name with spaces before the extension', 'con .txt'],
    ['a printer device name with dots before the extension', 'lpt1..mp4'],
  ])('refuses %s', (_scenario, name) => {
    expect(validity.isLegalWindowsFileName(name)).toBe(false);
  });
});
