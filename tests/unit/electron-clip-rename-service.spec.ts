import { describe, expect, it, vi } from 'vitest';

import { ElectronClipRenameService } from '../../src/adapters/electron/electron-clip-rename-service.js';

const folder = { folderPath: 'C:/clips' };

function serviceAnswering(answer: unknown) {
  const renameClip = vi.fn(async () => answer);
  return { service: new ElectronClipRenameService({ renameClip } as ConstructorParameters<typeof ElectronClipRenameService>[0]), renameClip };
}

describe('ElectronClipRenameService', () => {
  it('asks the desktop to rename the clip in its folder and answers the renamed file as a clip source', async () => {
    const { service, renameClip } = serviceAnswering({
      kind: 'renamed', entry: { name: 'sunset.mp4', path: 'C:/clips/sunset.mp4', mediaSource: 'file:///C:/clips/sunset.mp4?modified=1' },
    });

    const answer = await service.rename({ folder, filename: 'alpha.mp4', newFilename: 'sunset.mp4' });

    expect(renameClip).toHaveBeenCalledWith({ folderPath: 'C:/clips', filename: 'alpha.mp4', newFilename: 'sunset.mp4' });
    expect(answer.kind === 'renamed' && [answer.source.name, answer.source.mediaSource])
      .toEqual(['sunset.mp4', 'file:///C:/clips/sunset.mp4?modified=1']);
  });

  it('answers a refusal with its reason', async () => {
    const { service } = serviceAnswering({ kind: 'refused', reason: 'name-taken' });

    expect(await service.rename({ folder, filename: 'alpha.mp4', newFilename: 'bravo.mp4' })).toEqual({ kind: 'refused', reason: 'name-taken' });
  });

  it.each([
    ['a rename without the renamed file', { kind: 'renamed' }],
    ['no answer', undefined],
  ])('fails on %s', async (_case, answer) => {
    const { service } = serviceAnswering(answer);

    await expect(service.rename({ folder, filename: 'alpha.mp4', newFilename: 'sunset.mp4' }))
      .rejects.toThrow('The desktop API answered a rename without the renamed file.');
  });

  it('fails on a refusal for a reason it does not know, naming the reason', async () => {
    const { service } = serviceAnswering({ kind: 'refused', reason: 'disk-full' });

    await expect(service.rename({ folder, filename: 'alpha.mp4', newFilename: 'sunset.mp4' }))
      .rejects.toThrow('The desktop API refused a rename for an unknown reason: disk-full.');
  });

  it('is not offered by a desktop that cannot rename clips', () => {
    expect(ElectronClipRenameService.tryCreate({ clipSandboxDesktop: {} } as unknown as Window)).toBeNull();
  });
});
