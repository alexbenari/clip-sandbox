import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoldablePanelController } from '../../src/ui/foldable-panel-controller.js';

type MediaQueryStub = MediaQueryList & { setReduced(value: boolean): void };

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(finish => { resolve = finish; });
  return { promise, resolve };
}

function mediaQuery(matches = false): MediaQueryStub {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let current = matches;
  return {
    get matches() { return current; }, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: (_type, listener) => listeners.add(listener as (event: MediaQueryListEvent) => void),
    removeEventListener: (_type, listener) => listeners.delete(listener as (event: MediaQueryListEvent) => void),
    dispatchEvent: () => true,
    setReduced(value) { current = value; listeners.forEach(listener => listener(new Event('change') as MediaQueryListEvent)); },
  } as MediaQueryStub;
}

function fixture() {
  const root = document.createElement('section');
  const content = document.createElement('div'); content.id = 'panel-content';
  const foldButton = document.createElement('button');
  const revealButton = document.createElement('button');
  root.append(foldButton, revealButton, content); document.body.append(root);
  const change = vi.fn(); const settled = vi.fn();
  return { root, content, foldButton, revealButton, change, settled };
}

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('FoldablePanelController', () => {
  it('updates folded presentation, ARIA, and focus for an independent caller', () => {
    const f = fixture(); const controller = new FoldablePanelController({ ...f, onChange: f.change, onSettled: f.settled });
    expect(f.foldButton.getAttribute('aria-expanded')).toBe('true');
    expect(f.revealButton.getAttribute('aria-expanded')).toBe('true');
    f.content.append(document.createElement('input')); f.content.firstElementChild?.dispatchEvent(new Event('focus'));
    f.foldButton.focus(); controller.setFolded(true);
    expect(controller.folded).toBe(true); expect(f.root.classList.contains('folded')).toBe(true);
    expect(f.content.inert).toBe(true); expect(f.content.getAttribute('aria-hidden')).toBe('true');
    expect(f.revealButton.hidden).toBe(false); expect(f.foldButton.hidden).toBe(true);
    expect(f.foldButton.getAttribute('aria-expanded')).toBe('false');
    expect(f.revealButton.getAttribute('aria-expanded')).toBe('false');
    expect(f.revealButton.getAttribute('aria-controls')).toBe('panel-content'); expect(document.activeElement).toBe(f.revealButton);
    expect(f.change).toHaveBeenCalledWith(240); expect(f.settled).toHaveBeenCalledOnce();
  });

  it('keeps two controller instances independent and responds to button clicks', () => {
    const first = fixture(); const second = fixture();
    const firstController = new FoldablePanelController({ ...first, onChange: first.change, onSettled: first.settled });
    const secondController = new FoldablePanelController({ ...second, onChange: second.change, onSettled: second.settled });
    first.foldButton.click();
    expect(firstController.folded).toBe(true); expect(secondController.folded).toBe(false);
    expect(first.change).toHaveBeenCalledOnce(); expect(second.change).not.toHaveBeenCalled();
  });

  it('lets the latest reversal settle while ignoring stale finished animations', async () => {
    const f = fixture(); const media = mediaQuery(); vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const first = deferred(); const second = deferred();
    const animations = [
      { transitionProperty: 'width', effect: { target: f.root }, finished: first.promise },
      { transitionProperty: 'width', effect: { target: f.root }, finished: second.promise },
    ];
    Object.defineProperty(f.root, 'getAnimations', { configurable: true, value: () => [animations.shift() as unknown as Animation] });
    const controller = new FoldablePanelController({ ...f, onChange: f.change, onSettled: f.settled });
    controller.setFolded(true); controller.setFolded(false); first.resolve(); await Promise.resolve();
    expect(controller.moving).toBe(true); expect(f.settled).not.toHaveBeenCalled();
    second.resolve(); await Promise.resolve(); await Promise.resolve(); expect(controller.moving).toBe(false); expect(f.settled).toHaveBeenCalledOnce();
  });

  it('settles immediately without animation or when reduced motion changes', async () => {
    const f = fixture(); const media = mediaQuery(); vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const controller = new FoldablePanelController({ ...f, onChange: f.change, onSettled: f.settled });
    controller.setFolded(true); expect(f.settled).toHaveBeenCalledOnce();
    controller.setFolded(false); expect(f.settled).toHaveBeenCalledTimes(2); expect(f.change).toHaveBeenLastCalledWith(280);
    const pending = deferred();
    Object.defineProperty(f.root, 'getAnimations', { configurable: true, value: () => [{
      transitionProperty: 'width', effect: { target: f.root }, finished: pending.promise,
    } as unknown as Animation] });
    media.setReduced(false); controller.setFolded(true); media.setReduced(true);
    expect(f.settled).toHaveBeenCalledTimes(3); expect(controller.moving).toBe(false);
    pending.resolve(); await Promise.resolve();
    expect(f.settled).toHaveBeenCalledTimes(3);
    controller.destroy(); media.setReduced(false); controller.setFolded(false); expect(f.settled).toHaveBeenCalledTimes(3);
  });
});
