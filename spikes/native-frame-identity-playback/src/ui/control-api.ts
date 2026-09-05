export interface WireFrameIdentity {
  readonly frameIndex: number;
  readonly originalFrameIndex: number;
  readonly pts: string;
  readonly duration: string;
  readonly timebaseNumerator: string;
  readonly timebaseDenominator: string;
  readonly frameInfoPts: string;
  readonly frameInfoHash: string;
}

export interface WireFrame {
  readonly identity: WireFrameIdentity;
  readonly sourceGeneration: number;
  readonly frameGeneration: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly stride: number;
  readonly pixelFormat: 'RGBA8888';
  readonly pixels?: Uint8Array | ArrayBuffer | ArrayLike<number>;
}

export interface PlaybackWireFrame extends Omit<WireFrame, 'identity'> {
  readonly playbackTimestampUs: string;
  readonly pixels: Uint8Array | ArrayBuffer | ArrayLike<number>;
  readonly droppedBeforeWrite: number;
}

export interface ControlState {
  readonly generation: number;
  readonly loaded: boolean;
  readonly sourceName: string | null;
  readonly exactReady: boolean;
  readonly numFrames: number;
  readonly playing: boolean;
  readonly displayMode: 'playback' | 'exact';
  readonly playbackAssetKind: 'original-source' | 'review-proxy';
  readonly preparationError: string | null;
  readonly proxyPreparation: {
    readonly cacheHit: boolean;
    readonly encodeMs: number;
    readonly indexMs: number;
    readonly totalMs: number;
    readonly proxyBytes: number;
    readonly canonicalFrameCount: number;
    readonly proxyFrameCount: number;
  } | null;
  readonly proxyProfile: {
    readonly id: string;
    readonly gopSize: number;
    readonly bFrames: number;
  } | null;
  readonly proxySelectedAudio: {
    readonly audioOrdinal: number;
    readonly streamIndex: number;
    readonly codec: string;
    readonly channels: number;
    readonly language: string;
    readonly secondary: boolean;
  } | null;
  readonly playbackStatus?: {
    readonly state: string;
    readonly timeUs?: string;
    readonly lengthUs?: string;
    readonly rate?: number;
  };
}

export interface FrameIdentityControlApi {
  chooseSource(bounds: { maxWidth: number; maxHeight: number }): Promise<{
    cancelled: boolean;
    generation?: number;
    sourceName?: string;
    playbackStatus?: ControlState['playbackStatus'];
  }>;
  primePreview(): Promise<ControlState>;
  play(): Promise<ControlState>;
  pause(): Promise<ControlState>;
  pauseExact(): Promise<WireFrame>;
  captureCurrentFrame(): Promise<WireFrame>;
  setRate(rate: number): Promise<ControlState>;
  scrub(ratio: number): Promise<{
    mode: 'playback' | 'exact';
    stale?: boolean;
    frame?: WireFrame;
    status?: ControlState['playbackStatus'];
  }>;
  step(direction: -1 | 1, count: number): Promise<WireFrame>;
  status(): Promise<ControlState>;
  close(): Promise<ControlState>;
  acknowledgePlaybackFrame(sourceGeneration: number, frameGeneration: number): void;
  onPlaybackFrame(listener: (frame: PlaybackWireFrame) => void): () => void;
  onPreparation(listener: (event: Record<string, unknown>) => void): () => void;
}

declare global {
  interface Window {
    frameIdentityControl: FrameIdentityControlApi;
  }
}
