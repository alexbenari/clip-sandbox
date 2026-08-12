import type { InputVideoTrack } from 'mediabunny';

export async function assertVideoTrackCanDecode(
  videoTrack: Pick<InputVideoTrack, 'canDecode' | 'getCodecParameterString'>,
): Promise<void> {
  if (await videoTrack.canDecode()) {
    return;
  }

  let codec: string | null = null;
  try {
    codec = await videoTrack.getCodecParameterString();
  } catch {
    // Some unsupported tracks cannot provide a codec parameter string.
    codec = null;
  }

  const codecDescription = codec ? ` Codec: ${codec}.` : '';
  throw new Error(
    'Candidate B cannot decode this video track in the current Electron/WebCodecs environment.'
      + codecDescription,
  );
}
