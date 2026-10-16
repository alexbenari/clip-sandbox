import { describe, expect, it, vi } from 'vitest';

import { AppDiagnostics } from '../../src/app/app-diagnostics.js';
import { CollectionTextFormat } from '../../src/business-logic/collection-text-format.js';

describe('AppDiagnostics', () => {
  it('writes an unusable collection file to the error log with its problem and details', async () => {
    const folderFiles = { appendTextFile: vi.fn(async () => ({ mode: 'saved' })) };
    const diagnostics = new AppDiagnostics({ folderFiles });
    const invalid = new CollectionTextFormat().read({ text: 'alpha.mp4\nalpha.mp4\n', filename: 'subset.txt' });
    if (!('code' in invalid)) throw new Error('The duplicate list should be invalid.');

    await diagnostics.logInvalidDescription(invalid, { folderPath: 'C:/clips' });

    expect(folderFiles.appendTextFile).toHaveBeenCalledWith({
      folderAccess: { folderPath: 'C:/clips' },
      filename: 'err.log',
      text: 'Collection enumeration\nFile: subset.txt\nProblem: invalid-duplicates\nDetails: Duplicate entries were found: alpha.mp4 (x2).\n\n',
    });
  });
});
