import { afterEach, describe, expect, it, vi } from 'vitest';
import { FoldablePanelControl } from '../../src/ui/foldable-panel-control.js';

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

describe('FoldablePanelControl', () => {
  it('updates folded presentation, ARIA, and focus for an independent caller', () => {
    const f = fixture(); const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });
    expect(f.foldButton.getAttribute('aria-expanded')).toBe('true');
    expect(f.revealButton.getAttribute('aria-expanded')).toBe('true');
    f.content.append(document.createElement('input')); f.content.firstElementChild?.dispatchEvent(new Event('focus'));
    f.foldButton.focus(); control.setFolded(true);
    expect(control.folded).toBe(true); expect(f.root.classList.contains('folded')).toBe(true);
    expect(f.content.inert).toBe(true); expect(f.content.getAttribute('aria-hidden')).toBe('true');
    expect(f.revealButton.hidden).toBe(false); expect(f.foldButton.hidden).toBe(true);
    expect(f.foldButton.getAttribute('aria-expanded')).toBe('false');
    expect(f.revealButton.getAttribute('aria-expanded')).toBe('false');
    expect(f.revealButton.getAttribute('aria-controls')).toBe('panel-content'); expect(document.activeElement).toBe(f.revealButton);
    expect(f.change).toHaveBeenCalledWith(240); expect(f.settled).toHaveBeenCalledOnce();
  });

  it('keeps two control instances independent and responds to button clicks', () => {
    const first = fixture(); const second = fixture();
    const firstController = new FoldablePanelControl({ ...first, onChange: first.change, onSettled: first.settled });
    const secondController = new FoldablePanelControl({ ...second, onChange: second.change, onSettled: second.settled });
    first.foldButton.click();
    expect(firstController.folded).toBe(true); expect(secondController.folded).toBe(false);
    expect(first.change).toHaveBeenCalledOnce(); expect(second.change).not.toHaveBeenCalled();
  });

  it('expands idempotently through the semantic operation', () => {
    const f = fixture();
    const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });
    control.setFolded(true);
    f.change.mockClear();

    control.expand();
    control.expand();

    expect(control.folded).toBe(false);
    expect(f.change).toHaveBeenCalledOnce();
    expect(f.change).toHaveBeenCalledWith(280);
  });

  it('takes no width while hidden and its open width once shown again', () => {
    const f = fixture();
    f.root.style.setProperty('--panel-open-width', '240px');
    f.root.style.setProperty('--panel-folded-width', '36px');
    const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });

    control.setShown(false);
    expect(f.root.hidden).toBe(true);
    expect(control.targetWidth).toBe(0);

    control.setShown(true);
    expect(f.root.hidden).toBe(false);
    expect(control.targetWidth).toBe(240);
  });

  it('keeps its fold state and starts no workspace resize while hidden', () => {
    const f = fixture();
    const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });
    control.setShown(false);

    control.setFolded(true);

    expect(control.folded).toBe(false);
    expect(f.root.classList.contains('folded')).toBe(false);
    expect(f.change).not.toHaveBeenCalled();
  });

  it('lets the latest reversal settle while ignoring stale finished animations', async () => {
    const f = fixture(); const media = mediaQuery(); vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const first = deferred(); const second = deferred();
    const animations = [
      { transitionProperty: 'width', effect: { target: f.root }, finished: first.promise },
      { transitionProperty: 'width', effect: { target: f.root }, finished: second.promise },
    ];
    Object.defineProperty(f.root, 'getAnimations', { configurable: true, value: () => [animations.shift() as unknown as Animation] });
    const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });
    control.setFolded(true); control.setFolded(false); first.resolve(); await Promise.resolve();
    expect(control.moving).toBe(true); expect(f.settled).not.toHaveBeenCalled();
    second.resolve(); await Promise.resolve(); await Promise.resolve(); expect(control.moving).toBe(false); expect(f.settled).toHaveBeenCalledOnce();
  });

  it('settles immediately without animation or when reduced motion changes', async () => {
    const f = fixture(); const media = mediaQuery(); vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const control = new FoldablePanelControl({ ...f, onChange: f.change, onSettled: f.settled });
    control.setFolded(true); expect(f.settled).toHaveBeenCalledOnce();
    control.setFolded(false); expect(f.settled).toHaveBeenCalledTimes(2); expect(f.change).toHaveBeenLastCalledWith(280);
    const pending = deferred();
    Object.defineProperty(f.root, 'getAnimations', { configurable: true, value: () => [{
      transitionProperty: 'width', effect: { target: f.root }, finished: pending.promise,
    } as unknown as Animation] });
    media.setReduced(false); control.setFolded(true); media.setReduced(true);
    expect(f.settled).toHaveBeenCalledTimes(3); expect(control.moving).toBe(false);
    pending.resolve(); await Promise.resolve();
    expect(f.settled).toHaveBeenCalledTimes(3);
    control.dispose(); media.setReduced(false); control.setFolded(false); expect(f.settled).toHaveBeenCalledTimes(3);
  });
});
