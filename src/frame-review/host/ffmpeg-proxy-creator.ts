import { NativeCommandProcess } from './native-process-client.js';

export const FRAME_REVIEW_PROXY_PROFILE_ID = 'mpeg4-gop1-q5-960-source-clock-aac-v1';

export class FfmpegProxyCreator {
  constructor(
    private readonly executable: string,
    private readonly process = new NativeCommandProcess(),
  ) {}

  async create(sourcePath: string, destination: string, signal?: AbortSignal): Promise<void> {
    await this.process.run(this.executable, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+genpts', '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-sn', '-dn',
      '-vf', "scale=w='min(960,iw)':h=-2,settb=1/60000,setpts='if(isnan(PREV_OUTPTS),0,max(PTS-STARTPTS,PREV_OUTPTS+1))'",
      '-c:v', 'mpeg4', '-q:v', '5', '-g', '1', '-bf', '0', '-pix_fmt', 'yuv420p',
      '-fps_mode', 'passthrough', '-enc_time_base:v', 'filter',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
      '-af', 'aresample=48000:async=1:first_pts=0,asetpts=PTS-STARTPTS',
      '-avoid_negative_ts', 'make_non_negative', destination,
    ], { signal, timeoutMs: 3 * 60 * 60_000 });
  }
}
