declare module 'webcodecs-examples' {
  export interface WebCodecsPlayerParams {
    src: File;
    canvas: HTMLCanvasElement;
  }

  export class WebCodecsPlayer {
    constructor(params: WebCodecsPlayerParams);
    duration: number;
    initialize(): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(timeSeconds: number): Promise<void>;
    getCurrentTime(): number;
    on(event: string, listener: (...args: unknown[]) => void): void;
    terminate(): void;
  }
}
