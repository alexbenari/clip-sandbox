import { describe, expect, it, vi } from 'vitest';

import type { IFrameReviewDisplayedCapture } from '../../src/app/frame-review-displayed-capture.js';
import {
  ZoomEditModeSession,
  type IZoomEditPlayer,
  type ZoomEditExtension,
} from '../../src/app/zoom-edit-mode-session.js';
import type { IZoomEditPreviewRequest } from '../../src/app/zoom-edit-preview-service.js';
import type { ZoomEditAnchorAnswer } from '../../src/app/zoom-edit-source-service.js';
import {
  FrameReviewOpaqueId,
  type IFrameReviewOpenRequest,
  type IFrameReviewService,
  type IFrameReviewSession,
} from '../../src/frame-review/frame-review-api.js';
import { deferred, type Deferred } from '../support/deferred.js';
import { flushPendingWork } from '../support/flush-pending-work.js';
import { FakeReview, fakeZoomEditSources, windowHandle } from '../support/zoom-edit-fakes.js';

const clipHandle = FrameReviewOpaqueId.sourceHandle('source_clip_000001');

// The clip has 120 frames at 24 frames a second. Its window places the clip's first frame at window frame 1800,
// with one minute (1440 frames) of movie on each side within the limits.
const CLIP_FRAMES = 120;
const anchored: ZoomEditAnchorAnswer = Object.freeze({ kind: 'anchored', clipStartFrame: 1800, earliestFrame: 360, latestFrame: 3359 });

class FakePlayer implements IZoomEditPlayer {
  attached: IFrameReviewSession | null = null;
  shownFrame: number | null = null;
  frameShownOnPause = 0;
  playbackFrame: number | null = null;
  pausing: Promise<void> = Promise.resolve();
  playing = false;
  preview: 'inactive' | 'running' | 'paused' = 'inactive';
  loop: Readonly<{ startFrameIndex: number; endFrameIndex: number }> | null = null;
  readonly playbackJumps: number[] = [];

  attachSession(session: IFrameReviewSession | null): void {
    this.attached = session;
    this.shownFrame = null;
    this.playbackFrame = null;
    this.playing = false;
    this.preview = 'inactive';
    this.loop = null;
  }

  displayedCapture(): IFrameReviewDisplayedCapture | null {
    if (this.shownFrame !== null) {
      return { point: { kind: 'exact-frame', identity: { frameIndex: this.shownFrame } } } as unknown as IFrameReviewDisplayedCapture;
    }
    if (this.playbackFrame === null) return null;
    const positionUs = BigInt(this.playbackFrame) * 1_000_000n / 24n;
    return { point: { kind: 'playback-timestamp', timestampUs: positionUs }, positionUs } as unknown as IFrameReviewDisplayedCapture;
  }

  ordinaryPlaybackRunning(): boolean { return this.playing && this.preview === 'inactive'; }
  exactPreviewPhase(): 'inactive' | 'running' | 'paused' { return this.preview; }

  async togglePlayback(): Promise<void> {
    await this.pausing;
    if (!this.attached) return;
    if (this.preview === 'running') {
      this.preview = 'paused';
      this.playing = false;
      this.shownFrame = this.frameShownOnPause;
    } else if (this.playing) {
      this.playing = false;
      this.shownFrame = this.frameShownOnPause;
    } else {
      this.playing = true;
      this.shownFrame = null;
    }
  }

  jumpBySeconds(seconds: number): void { this.playbackJumps.push(seconds); }

  async enterExactScrubAt(timestampUs: bigint): Promise<IFrameReviewDisplayedCapture | null> {
    this.shownFrame = Math.round(Number(timestampUs) * 24 / 1_000_000);
    this.playing = false;
    return this.displayedCapture();
  }

  async enterExactScrubAtFrame(frameIndex: number): Promise<IFrameReviewDisplayedCapture | null> {
    this.shownFrame = frameIndex;
    this.playing = false;
    return this.displayedCapture();
  }

  async startExactPreview(range: Readonly<{ startFrameIndex: number; endFrameIndex: number }>): Promise<void> {
    this.preview = 'running';
    this.playing = true;
    this.loop = range;
    this.shownFrame = null;
  }

  async stopExactPreview(): Promise<IFrameReviewDisplayedCapture | null> {
    this.preview = 'inactive';
    this.playing = false;
    this.loop = null;
    return this.displayedCapture();
  }
}

// Preview renders whose answers the test gives one by one.
function fakePreviews() {
  const renders: Array<{ request: IZoomEditPreviewRequest; answer: Deferred<string> }> = [];
  const previews = {
    render: vi.fn((request: IZoomEditPreviewRequest) => {
      const answer = deferred<string>();
      renders.push({ request, answer });
      return answer.promise;
    }),
    release: vi.fn(async () => undefined),
  };
  return { previews, renders };
}

function zoomEdit({ hasSourceInfo = true, muted = false, loopify = false, clipOpening = null as Deferred<typeof clipHandle> | null,
  clipReviewOpening = null as Deferred<void> | null } = {}) {
  const player = new FakePlayer();
  const clipReview = new FakeReview('session_clip_000001', CLIP_FRAMES);
  const windowReviews: FakeReview[] = [];
  const openRequests: IFrameReviewOpenRequest[] = [];
  const frameReview: IFrameReviewService = {
    chooseSource: vi.fn(),
    open: vi.fn(async (request: IFrameReviewOpenRequest) => {
      openRequests.push(request);
      if (request.sourceHandle === clipHandle) {
        await clipReviewOpening?.promise;
        return clipReview.session;
      }
      const review = new FakeReview(`session_window_00000${windowReviews.length + 1}`, 3720);
      windowReviews.push(review);
      return review.session;
    }),
  };
  const { sources, windowAnswers, anchorAnswers } = fakeZoomEditSources(clipHandle, clipOpening);
  const failures = { report: vi.fn() };
  const { previews, renders } = fakePreviews();
  const session = ZoomEditModeSession.begin(
    { frameReview, sources, previews, player, failures, previewBounds: { maxWidth: 1280, maxHeight: 720 } },
    { folder: { folderPath: 'C:/Clips' }, filename: 'harbor-scene.mp4', hasSourceInfo, muted, loopify },
  );

  async function clipReady(): Promise<void> {
    await vi.waitFor(() => expect(player.attached).toBe(clipReview.session));
    clipReview.becomeExactReady();
    player.shownFrame = 0;
    await flushPendingWork();
  }

  // The real player keeps showing the paused playback frame it had while the clip was preparing.
  async function clipReadyShowingPlaybackFrame(frame: number): Promise<void> {
    await vi.waitFor(() => expect(player.attached).toBe(clipReview.session));
    player.playbackFrame = frame;
    clipReview.becomeExactReady();
    await flushPendingWork();
  }

  async function windowOpened(step = 1): Promise<FakeReview> {
    await vi.waitFor(() => expect(windowAnswers).toHaveLength(step));
    windowAnswers[step - 1].resolve({ kind: 'ready', sourceHandle: windowHandle(step), windowId: `window_${step}` });
    await vi.waitFor(() => expect(windowReviews).toHaveLength(step));
    await flushPendingWork();
    return windowReviews[step - 1];
  }

  async function windowPrepared(step = 1): Promise<void> {
    (await windowOpened(step)).becomeExactReady();
    await vi.waitFor(() => expect(anchorAnswers).toHaveLength(step));
  }

  async function windowAnchored(): Promise<void> {
    await windowPrepared();
    anchorAnswers[0].resolve(anchored);
    await vi.waitFor(() => expect(session.snapshot.extension).toBe('ready'));
  }

  return {
    session, player, clipReview, windowReviews, openRequests, frameReview, sources, failures, previews, renders,
    windowAnswers, anchorAnswers, clipReady, clipReadyShowingPlaybackFrame, windowOpened, windowPrepared, windowAnchored,
  };
}

describe('ZoomEditModeSession', () => {
  it('lets the clip be trimmed as soon as it is exact-ready, while its movie is still being found', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 12;

    expect(await edit.session.markStart()).toEqual({ kind: 'done' });

    expect([edit.session.snapshot.range?.start, edit.session.snapshot.extension]).toEqual([12, 'finding-movie']);
  });

  describe('when the clip becomes ready showing a paused playback frame', () => {
    it('steps from the exact frame at that position', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });
      await edit.clipReadyShowingPlaybackFrame(30);

      expect([await edit.session.step(1), edit.player.shownFrame]).toEqual([{ kind: 'done' }, 31]);
    });

    it('stages the exact frame at that position as the start', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });
      await edit.clipReadyShowingPlaybackFrame(30);

      await edit.session.markStart();

      expect(edit.session.snapshot.range?.start).toBe(30);
    });

    it('jumps from the exact frame at that position', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });
      await edit.clipReadyShowingPlaybackFrame(30);

      await edit.session.jump(1);

      expect(edit.player.shownFrame).toBe(54);
    });

    it('switches to the movie window at that position without waiting for a key', async () => {
      const edit = zoomEdit();
      await edit.clipReadyShowingPlaybackFrame(30);

      await edit.windowAnchored();

      expect([edit.player.attached, edit.player.shownFrame]).toEqual([edit.windowReviews[0].session, 1830]);
    });
  });

  it('refuses to stage an end while the clip is still preparing', async () => {
    const edit = zoomEdit();
    await vi.waitFor(() => expect(edit.player.attached).toBe(edit.clipReview.session));

    expect(await edit.session.markEnd()).toEqual({ kind: 'refused', refusal: { reason: 'clip-preparing' } });
  });

  it('pauses playback when marking the start and stages the frame shown after pausing', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.session.togglePlayback();
    edit.player.frameShownOnPause = 37;

    expect(await edit.session.markStart()).toEqual({ kind: 'done' });

    expect([edit.player.ordinaryPlaybackRunning(), edit.session.snapshot.range?.start]).toEqual([false, 37]);
  });

  it('starts looping the staged range when the loop is toggled during playback', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 10;
    await edit.session.markStart();
    edit.player.shownFrame = 50;
    await edit.session.markEnd();
    await edit.session.togglePlayback();

    expect(await edit.session.toggleLoop()).toEqual({ kind: 'done' });

    expect([edit.player.exactPreviewPhase(), edit.player.loop]).toEqual(['running', { startFrameIndex: 10, endFrameIndex: 50 }]);
  });

  it('stops the loop when the loop is toggled while it runs', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 0;
    await edit.session.toggleLoop();

    await edit.session.toggleLoop();

    expect(edit.player.exactPreviewPhase()).toBe('inactive');
  });

  it('refuses to loop a one-frame range', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 40;
    await edit.session.markStart();
    await edit.session.markEnd();

    expect(await edit.session.toggleLoop()).toEqual({ kind: 'refused', refusal: { reason: 'loop-needs-two-frames' } });
  });

  it('refuses marking an end before the staged start and keeps the staged range', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 40;
    await edit.session.markStart();
    edit.player.shownFrame = 20;

    expect(await edit.session.markEnd()).toEqual({ kind: 'refused', refusal: { reason: 'end-before-start' } });

    expect([edit.session.snapshot.range?.start, edit.session.snapshot.range?.end]).toEqual([40, CLIP_FRAMES - 1]);
  });

  it('shows the staged start, paused, when jumping to it during playback', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 25;
    await edit.session.markStart();
    await edit.session.togglePlayback();

    await edit.session.jumpToStart();

    expect([edit.player.ordinaryPlaybackRunning(), edit.player.shownFrame]).toEqual([false, 25]);
  });

  it('shows the staged end, paused, when jumping to it during playback', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 80;
    await edit.session.markEnd();
    await edit.session.togglePlayback();

    await edit.session.jumpToEnd();

    expect([edit.player.ordinaryPlaybackRunning(), edit.player.shownFrame]).toEqual([false, 80]);
  });

  it('jumps by whole seconds of frames in the direction of the last step', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 100;
    await edit.session.step(-1);

    await edit.session.jump(2);

    expect(edit.player.shownFrame).toBe(99 - 48);
  });

  it('jumps playback forward while the clip plays', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.session.togglePlayback();
    edit.player.playbackFrame = 10;

    await edit.session.jump(2);

    expect([edit.player.playbackJumps, edit.player.ordinaryPlaybackRunning()]).toEqual([[2], true]);
  });

  it('pauses on the clip\'s last frame when a playback jump would pass it', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.session.togglePlayback();
    edit.player.playbackFrame = 100;

    await edit.session.jump(2);

    expect([edit.player.ordinaryPlaybackRunning(), edit.player.shownFrame]).toEqual([false, CLIP_FRAMES - 1]);
  });

  describe('before the movie window is anchored', () => {
    const stepPastTheEnd = async (edit: ReturnType<typeof zoomEdit>) => {
      edit.player.shownFrame = CLIP_FRAMES - 1;
      return edit.session.step(1);
    };

    it.each<[string, ZoomEditExtension, (edit: ReturnType<typeof zoomEdit>) => Promise<void>]>([
      ['a clip without source info', 'none', async () => undefined],
      ['the movie is being found', 'finding-movie', async () => undefined],
      ['the window is being prepared', 'preparing-window', async edit => { await edit.windowPrepared(); }],
      ['the movie lookup was cancelled', 'cancelled', async edit => {
        await vi.waitFor(() => expect(edit.windowAnswers).toHaveLength(1));
        edit.windowAnswers[0].resolve({ kind: 'cancelled' });
        await flushPendingWork();
      }],
      ['the clip was not found in the widest window', 'not-found', async edit => {
        for (const step of [1, 2, 3]) {
          await edit.windowPrepared(step);
          edit.anchorAnswers[step - 1].resolve({ kind: 'not-found' });
        }
        await vi.waitFor(() => expect(edit.session.snapshot.extension).toBe('not-found'));
      }],
      ['the window failed to open', 'failed', async edit => {
        await vi.waitFor(() => expect(edit.windowAnswers).toHaveLength(1));
        edit.windowAnswers[0].reject(new Error('The movie could not be read.'));
        await flushPendingWork();
      }],
    ])('refuses stepping past the clip end when %s, naming that state', async (_scenario, extension, reach) => {
      const edit = zoomEdit({ hasSourceInfo: extension !== 'none' });
      await edit.clipReady();
      await reach(edit);

      const answer = await stepPastTheEnd(edit);

      expect([answer, edit.player.shownFrame]).toEqual([
        { kind: 'refused', refusal: { reason: 'extension-unavailable', extension } }, CLIP_FRAMES - 1,
      ]);
    });

    it.each<[string, boolean, (edit: ReturnType<typeof zoomEdit>) => Promise<void>]>([
      ['the movie is being found', true, async () => undefined],
      ['the window is being prepared', true, async edit => { await edit.windowPrepared(); }],
      ['the movie lookup was cancelled', false, async edit => {
        await vi.waitFor(() => expect(edit.windowAnswers).toHaveLength(1));
        edit.windowAnswers[0].resolve({ kind: 'cancelled' });
        await flushPendingWork();
      }],
      ['the window is shown', false, async edit => {
        await edit.windowPrepared();
        edit.anchorAnswers[0].resolve(anchored);
        await vi.waitFor(() => expect(edit.session.snapshot.extension).toBe('ready'));
      }],
    ])('says whether extending is still pending when %s', async (_scenario, pending, reach) => {
      const edit = zoomEdit();
      await edit.clipReady();

      await reach(edit);

      expect(edit.session.snapshot.extensionPending).toBe(pending);
    });

    it('says extending is not pending for a clip without source info', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });

      await edit.clipReady();

      expect(edit.session.snapshot.extensionPending).toBe(false);
    });

    it('tells its listeners when the movie lookup is cancelled', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      const extensions: string[] = [];
      edit.session.on('changed', snapshot => extensions.push(snapshot.extension));

      edit.windowAnswers[0].resolve({ kind: 'cancelled' });
      await flushPendingWork();

      expect(extensions.at(-1)).toBe('cancelled');
    });

    it('keeps trimming working after the movie lookup is cancelled', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await vi.waitFor(() => expect(edit.windowAnswers).toHaveLength(1));
      edit.windowAnswers[0].resolve({ kind: 'cancelled' });
      await flushPendingWork();
      edit.player.shownFrame = 90;

      expect(await edit.session.markEnd()).toEqual({ kind: 'done' });

      expect([edit.session.snapshot.range?.end, edit.session.snapshot.extension]).toEqual([90, 'cancelled']);
    });
  });

  describe('once the movie window is anchored', () => {
    it('keeps the staged start and end when the player switches from the clip to the window', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      edit.player.shownFrame = 5;
      await edit.session.markStart();
      edit.player.shownFrame = 90;
      await edit.session.markEnd();

      await edit.windowAnchored();

      expect([edit.session.snapshot.range?.start, edit.session.snapshot.range?.end]).toEqual([5, 90]);
    });

    it('offers the staged range for saving in the window\'s frame numbers', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      edit.player.shownFrame = 5;
      await edit.session.markStart();
      edit.player.shownFrame = 90;
      await edit.session.markEnd();

      await edit.windowAnchored();

      expect(edit.session.stagedSelection()).toEqual({
        source: { kind: 'window', windowId: 'window_1' }, sessionId: 'session_window_000001', startFrame: 1805, endFrame: 1890,
      });
    });

    it('shows the window at the frame the clip was showing', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      edit.player.shownFrame = 30;

      await edit.windowAnchored();

      expect([edit.player.attached, edit.player.shownFrame]).toEqual([edit.windowReviews[0].session, 1830]);
    });

    it('steps past the clip end into the movie and stages an end there', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await edit.windowAnchored();
      edit.player.shownFrame = 1800 + CLIP_FRAMES - 1;

      await edit.session.step(1);
      await edit.session.markEnd();

      expect(edit.session.snapshot.range?.end).toBe(CLIP_FRAMES);
    });

    it('stops a jump at one minute past the clip end', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await edit.windowAnchored();
      edit.player.shownFrame = 3300;

      await edit.session.jump(10);

      expect(edit.player.shownFrame).toBe(3359);
    });

    it('refuses stepping beyond one minute before the clip start', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await edit.windowAnchored();
      edit.player.shownFrame = 360;

      expect(await edit.session.step(-1)).toEqual({ kind: 'refused', refusal: { reason: 'beyond-extension' } });
      expect(edit.player.shownFrame).toBe(360);
    });

    it('refuses edits because the source failed when the shown window\'s review ends', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await edit.windowAnchored();
      edit.player.shownFrame = 1830;

      edit.windowReviews[0].fail();

      expect([edit.session.snapshot.picture, await edit.session.markStart()]).toEqual([
        'failed', { kind: 'refused', refusal: { reason: 'source-failed' } },
      ]);
    });

    it('waits for an exact clip frame on screen, then shows the window at that frame', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      edit.player.shownFrame = null;
      await edit.windowPrepared();
      edit.anchorAnswers[0].resolve(anchored);
      await flushPendingWork();
      expect(edit.player.attached).toBe(edit.clipReview.session);

      edit.player.shownFrame = 30;
      await edit.session.markStart();
      await vi.waitFor(() => expect(edit.session.snapshot.extension).toBe('ready'));

      expect([edit.player.attached, edit.player.shownFrame]).toEqual([edit.windowReviews[0].session, 1830]);
    });

    it('pauses one minute past the clip end when a playback jump would pass it', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      await edit.windowAnchored();
      await edit.session.togglePlayback();
      edit.player.playbackFrame = 3300;

      await edit.session.jump(10);

      expect([edit.player.ordinaryPlaybackRunning(), edit.player.shownFrame]).toEqual([false, 3359]);
    });

    it('closes the clip review even when showing the window fails', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      edit.player.enterExactScrubAtFrame = async () => { throw new Error('Exact frame read failed.'); };
      await edit.windowPrepared();

      edit.anchorAnswers[0].resolve(anchored);

      await vi.waitFor(() => expect(edit.clipReview.dispose).toHaveBeenCalled());
    });

    it('reports a failure to show the window as such, not as a failed key', async () => {
      const edit = zoomEdit();
      await edit.clipReady();
      const cause = new Error('Exact frame read failed.');
      edit.player.enterExactScrubAtFrame = async () => { throw cause; };
      await edit.windowPrepared();

      edit.anchorAnswers[0].resolve(anchored);

      await vi.waitFor(() => expect(edit.failures.report).toHaveBeenCalledWith('Zoom edit mode could not show the movie around this clip.', cause));
    });

    it('closes the clip review once the window shows', async () => {
      const edit = zoomEdit();
      await edit.clipReady();

      await edit.windowAnchored();

      expect(edit.clipReview.dispose).toHaveBeenCalled();
    });
  });

  it('opens the clip and its movie window muted when the mode is entered muted', async () => {
    const edit = zoomEdit({ muted: true });
    await edit.clipReady();
    await edit.windowOpened();

    expect(edit.openRequests.map(request => [request.sourceHandle, request.muted])).toEqual([
      [clipHandle, true], [windowHandle(1), true],
    ]);
  });

  it('ignores an anchor that arrives after the session is disposed', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 30;
    await edit.windowPrepared();

    await edit.session.dispose();
    edit.anchorAnswers[0].resolve(anchored);
    await flushPendingWork();

    expect(edit.player.attached).toBeNull();
  });

  it('detaches the player when disposed', async () => {
    const edit = zoomEdit();
    await edit.clipReady();

    await edit.session.dispose();

    expect(edit.player.attached).toBeNull();
  });

  it('ends a command waiting on the player when the session is disposed, without moving the player', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 25;
    await edit.session.markStart();
    await edit.session.togglePlayback();
    const pause = deferred<void>();
    edit.player.pausing = pause.promise;
    const jumping = edit.session.jumpToStart();
    await flushPendingWork();

    await edit.session.dispose();
    pause.resolve();

    expect([await jumping, edit.player.shownFrame]).toEqual([{ kind: 'refused', refusal: { reason: 'ended' } }, null]);
  });

  it('stops the movie window when the clip fails before the window is used', async () => {
    const edit = zoomEdit();
    await vi.waitFor(() => expect(edit.player.attached).toBe(edit.clipReview.session));
    await edit.windowPrepared();
    edit.anchorAnswers[0].resolve(anchored);
    await flushPendingWork();

    edit.clipReview.fail();
    await flushPendingWork();

    expect(edit.session.snapshot.extension).toBe('failed');
    expect(edit.windowReviews[0].dispose).toHaveBeenCalled();
  });

  it('stops preparing the movie window when the clip fails', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.windowPrepared();

    edit.clipReview.fail();
    await flushPendingWork();

    expect(edit.session.snapshot.extension).toBe('failed');
    expect(edit.windowReviews[0].dispose).toHaveBeenCalled();
  });

  it('does not open a clip whose source arrives after the session is disposed', async () => {
    const clipOpening = deferred<typeof clipHandle>();
    const edit = zoomEdit({ hasSourceInfo: false, clipOpening });

    await edit.session.dispose();
    clipOpening.resolve(clipHandle);
    await flushPendingWork();

    expect([edit.openRequests, edit.player.attached]).toEqual([[], null]);
  });

  it('closes a clip review that finishes opening after the session is disposed', async () => {
    const clipReviewOpening = deferred<void>();
    const edit = zoomEdit({ hasSourceInfo: false, clipReviewOpening });
    await vi.waitFor(() => expect(edit.openRequests).toHaveLength(1));

    await edit.session.dispose();
    clipReviewOpening.resolve();
    await flushPendingWork();

    expect(edit.clipReview.dispose).toHaveBeenCalled();
    expect(edit.player.attached).toBeNull();
  });

  it('closes both the clip review and the movie window review when disposed', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.windowPrepared();

    await edit.session.dispose();

    expect(edit.clipReview.dispose).toHaveBeenCalled();
    expect(edit.windowReviews[0].dispose).toHaveBeenCalled();
  });

  it('answers that a command failed when the player fails, and reports why', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    edit.player.shownFrame = 0;
    const playerError = new Error('Exact frame read failed.');
    edit.player.startExactPreview = async () => { throw playerError; };

    expect(await edit.session.toggleLoop()).toEqual({ kind: 'failed' });

    expect(edit.failures.report).toHaveBeenCalledWith('Zoom edit mode could not carry out that command. Try the key again.', playerError);
  });

  it('answers that the mode has ended to a command after disposal', async () => {
    const edit = zoomEdit();
    await edit.clipReady();
    await edit.session.dispose();

    expect(await edit.session.markStart()).toEqual({ kind: 'refused', refusal: { reason: 'ended' } });
  });

  describe('Loopify', () => {
    // A clip ready with frames 12 to 80 staged, as a trim.
    async function trimmed(edit: ReturnType<typeof zoomEdit>): Promise<void> {
      await edit.clipReady();
      edit.player.shownFrame = 12;
      await edit.session.markStart();
      edit.player.shownFrame = 80;
      await edit.session.markEnd();
    }

    const editsOf = (edit: ReturnType<typeof zoomEdit>) => edit.session.stagedEdits().edits;

    it('is staged and dropped again by toggling it', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });
      await edit.clipReady();

      await edit.session.toggleLoopify();
      const staged = [editsOf(edit), edit.session.snapshot.loopify];
      await edit.session.toggleLoopify();

      expect([staged, [editsOf(edit), edit.session.snapshot.loopify]]).toEqual([[['loopify'], true], [[], false]]);
    });

    it('is staged from the start when the mode is entered for Loopify', async () => {
      const edit = zoomEdit({ hasSourceInfo: false, loopify: true });

      expect(editsOf(edit)).toEqual(['loopify']);
    });

    it('stages Refine with it once the range changes', async () => {
      const edit = zoomEdit({ hasSourceInfo: false, loopify: true });

      await trimmed(edit);

      expect(editsOf(edit)).toEqual(['refine', 'loopify']);
    });

    it('cannot be toggled while the clip is still being prepared', async () => {
      const edit = zoomEdit({ hasSourceInfo: false });

      expect(await edit.session.toggleLoopify()).toEqual({ kind: 'refused', refusal: { reason: 'clip-preparing' } });
    });

    describe('the loop preview', () => {
      it('asks for a preview of the staged range of the shown clip when the loop is toggled', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);

        expect(await edit.session.toggleLoop()).toEqual({ kind: 'done' });

        expect(edit.renders.map(({ request }) => request)).toEqual([{
          folder: { folderPath: 'C:/Clips' }, filename: 'harbor-scene.mp4', source: { kind: 'clip' },
          sessionId: 'session_clip_000001', startFrame: 12, endFrame: 80,
        }]);
        expect(edit.session.snapshot.preview).toEqual({ kind: 'rendering', progress: null });
      });

      it('plays the preview once it is rendered, instead of the exact loop', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();

        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');

        await vi.waitFor(() => expect(edit.session.snapshot.preview).toEqual({ kind: 'playing', mediaSource: 'file:///previews/preview-1.mp4?modified=1' }));
        expect(edit.player.exactPreviewPhase()).toBe('inactive');
      });

      it('pauses the clip before the preview plays', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.togglePlayback();

        await edit.session.toggleLoop();

        expect(edit.player.ordinaryPlaybackRunning()).toBe(false);
      });

      it('hides the preview on the next toggle and shows the kept one again at once on the toggle after', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await vi.waitFor(() => expect(edit.session.snapshot.preview.kind).toBe('playing'));

        await edit.session.toggleLoop();
        const hidden = edit.session.snapshot.preview;
        await edit.session.toggleLoop();

        expect([hidden, edit.session.snapshot.preview, edit.renders.length])
          .toEqual([{ kind: 'hidden' }, { kind: 'playing', mediaSource: 'file:///previews/preview-1.mp4?modified=1' }, 1]);
      });

      it('hides the preview when another key acts', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await vi.waitFor(() => expect(edit.session.snapshot.preview.kind).toBe('playing'));

        await edit.session.step(1);

        expect(edit.session.snapshot.preview).toEqual({ kind: 'hidden' });
      });

      it('drops the kept preview when the staged range changes, so the next toggle renders the new range', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await vi.waitFor(() => expect(edit.session.snapshot.preview.kind).toBe('playing'));

        edit.player.shownFrame = 70;
        await edit.session.markEnd();
        await edit.session.toggleLoop();

        expect(edit.renders.map(({ request }) => request.endFrame)).toEqual([80, 70]);
      });

      it('releases the kept preview’s file as soon as the staged range changes', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await vi.waitFor(() => expect(edit.session.snapshot.preview.kind).toBe('playing'));

        edit.player.shownFrame = 70;
        await edit.session.markEnd();

        expect(edit.previews.release).toHaveBeenCalledOnce();
      });

      it('waits for the new preview when an earlier one for the same range, since released, arrives late', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.player.shownFrame = 70;
        await edit.session.markEnd();
        edit.player.shownFrame = 80;
        await edit.session.markEnd();
        await edit.session.toggleLoop();

        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await flushPendingWork();

        expect([edit.renders.length, edit.session.snapshot.preview]).toEqual([2, { kind: 'rendering', progress: null }]);
      });

      it('never shows a preview of staged edits that changed while it was rendered', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.player.shownFrame = 70;
        await edit.session.markEnd();

        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await flushPendingWork();

        expect(edit.session.snapshot.preview).toEqual({ kind: 'hidden' });
      });

      it('is not shown when the loop is toggled off while it is rendered, and the next toggle shows it at once', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();
        await edit.session.toggleLoop();

        edit.renders[0].answer.resolve('file:///previews/preview-1.mp4?modified=1');
        await flushPendingWork();
        const whileOff = edit.session.snapshot.preview;
        await edit.session.toggleLoop();

        expect([whileOff, edit.session.snapshot.preview.kind, edit.renders.length]).toEqual([{ kind: 'hidden' }, 'playing', 1]);
      });

      async function failedPreview(edit: ReturnType<typeof zoomEdit>, cause: Error): Promise<void> {
        await trimmed(edit);
        await edit.session.toggleLoop();
        edit.renders[0].answer.reject(cause);
        await vi.waitFor(() => expect(edit.session.snapshot.preview).toEqual({ kind: 'failed' }));
      }

      it('says that a preview failed and reports why', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        const cause = new Error('The preview could not be made.');

        await failedPreview(edit, cause);

        expect(edit.failures.report).toHaveBeenCalledWith('The loop preview could not be made.', cause);
      });

      it('loops the exact range forward on the toggle after a failed preview', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await failedPreview(edit, new Error('The preview could not be made.'));

        await edit.session.toggleLoop();

        expect([edit.player.loop, edit.renders.length]).toEqual([{ startFrameIndex: 12, endFrameIndex: 80 }, 1]);
      });

      it('stops saying that the preview failed once another key acts', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await failedPreview(edit, new Error('The preview could not be made.'));

        await edit.session.step(1);

        expect(edit.session.snapshot.preview).toEqual({ kind: 'hidden' });
      });
      it('loops the exact range forward when Loopify is not staged', async () => {
        const edit = zoomEdit({ hasSourceInfo: false });
        await trimmed(edit);

        await edit.session.toggleLoop();

        expect([edit.player.loop, edit.renders.length]).toEqual([{ startFrameIndex: 12, endFrameIndex: 80 }, 0]);
      });

      it('releases the preview when the session ends', async () => {
        const edit = zoomEdit({ hasSourceInfo: false, loopify: true });
        await trimmed(edit);
        await edit.session.toggleLoop();

        await edit.session.dispose();

        expect(edit.previews.release).toHaveBeenCalled();
      });

      it('asks for a preview of the movie window range once the clip is shown in its window', async () => {
        const edit = zoomEdit({ loopify: true });
        await edit.clipReady();
        await edit.windowAnchored();

        await edit.session.toggleLoop();

        expect(edit.renders.map(({ request }) => [request.source, request.startFrame, request.endFrame]))
          .toEqual([[{ kind: 'window', windowId: 'window_1' }, 1800, 1919]]);
      });
    });
  });
});
