import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';

import type { FramePosition, MovieFrameIndex } from '../contracts/types';

interface RawFrame {
  frameIndex: number;
  timestampMs: number;
  durationMs: number;
  keyframe: boolean;
  sequenceNumber: number;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message === 'Assertion failed.'
    ? 'Mediabunny could not interpret this video track.'
    : message;
}

export async function buildMovieFrameIndex(file: File): Promise<MovieFrameIndex> {
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  let videoTrack: Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;
  try {
    videoTrack = await input.getPrimaryVideoTrack();
  } catch (error) {
    throw new Error(
      `Movie primary video track could not be read for frame-first playback: ${describeError(error)}`,
      { cause: error },
    );
  }

  if (!videoTrack) {
    throw new Error('No primary video track found in selected movie.');
  }

  let canDecode: boolean;
  try {
    canDecode = await videoTrack.canDecode();
  } catch (error) {
    throw new Error(
      `Movie video track decodability could not be checked: ${describeError(error)}`,
      { cause: error },
    );
  }

  if (!canDecode) {
    throw new Error(
      'Movie video track cannot be decoded by the current Electron/WebCodecs environment.',
    );
  }

  const sink = new EncodedPacketSink(videoTrack);
  const rawFrames: RawFrame[] = [];

  try {
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      rawFrames.push({
        frameIndex: rawFrames.length,
        timestampMs: packet.timestamp * 1_000,
        durationMs: packet.duration * 1_000,
        keyframe: packet.type === 'key',
        sequenceNumber: packet.sequenceNumber,
      });
    }
  } catch (error) {
    throw new Error(
      `Movie video track could not be indexed for frame-by-frame playback: ${describeError(error)}`,
      { cause: error },
    );
  }

  if (rawFrames.length === 0) {
    throw new Error('No decodable video frames were discovered in selected movie.');
  }

  rawFrames.sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) {
      return left.timestampMs - right.timestampMs;
    }

    return left.sequenceNumber - right.sequenceNumber;
  });

  let trackDurationMs: number;
  try {
    trackDurationMs = (await videoTrack.computeDuration()) * 1_000;
  } catch (error) {
    throw new Error(
      `Movie video track duration could not be read for frame-by-frame playback: ${describeError(error)}`,
      { cause: error },
    );
  }
  let codec: string | null = null;
  try {
    codec = await videoTrack.getCodecParameterString();
  } catch {
    // Codec text is optional metadata; unsupported tracks must reach candidate-local decode checks.
    codec = null;
  }

  const frames: FramePosition[] = rawFrames.map((rawFrame, index) => {
    const nextFrame = rawFrames[index + 1] ?? null;
    const inferredDurationMs = nextFrame
      ? Math.max(1, nextFrame.timestampMs - rawFrame.timestampMs)
      : Math.max(1, trackDurationMs - rawFrame.timestampMs);

    return {
      frameIndex: index,
      timestampMs: Math.max(0, rawFrame.timestampMs),
      durationMs: rawFrame.durationMs > 0 ? rawFrame.durationMs : inferredDurationMs,
      keyframe: rawFrame.keyframe,
    };
  });

  return {
    frames,
    frameCount: frames.length,
    durationMs: Math.max(
      trackDurationMs,
      frames[frames.length - 1].timestampMs + frames[frames.length - 1].durationMs,
    ),
    codedWidth: await videoTrack.getCodedWidth(),
    codedHeight: await videoTrack.getCodedHeight(),
    displayWidth: await videoTrack.getDisplayWidth(),
    displayHeight: await videoTrack.getDisplayHeight(),
    codec,
  };
}
