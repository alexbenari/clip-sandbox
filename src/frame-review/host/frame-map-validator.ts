import { writeFile } from 'node:fs/promises';

export class FrameMapValidator {
  async validateAndWrite(canonicalFrameCount: number, proxyFrameCount: number, destination: string): Promise<void> {
    if (!Number.isSafeInteger(canonicalFrameCount) || canonicalFrameCount < 1
      || canonicalFrameCount !== proxyFrameCount) {
      throw new Error(`Review proxy frame count ${proxyFrameCount} does not match canonical count ${canonicalFrameCount}.`);
    }
    await writeFile(destination, `${JSON.stringify({
      schemaVersion: 1,
      mapping: 'ordinal-identity',
      frameCount: canonicalFrameCount,
    }, null, 2)}\n`, 'utf8');
  }
}
