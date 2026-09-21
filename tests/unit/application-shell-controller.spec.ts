import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationShellController } from '../../src/ui/application-shell-controller.js';
import type { IAppScreen } from '../../src/ui/app-screen.js';

afterEach(() => { document.body.replaceChildren(); });

function fixture() {
  const screenHost = document.createElement('main');
  const commandHost = document.createElement('div');
  const selector = document.createElement('select');
  document.body.append(selector, commandHost, screenHost);
  const screen = (id: string, commands: boolean, selectorStatus: IAppScreen['selectorStatus'] = 'fixed'): IAppScreen => {
    const root = document.createElement('section');
    const input = document.createElement('input');
    root.append(input);
    return {
      id,
      label: id,
      selectorStatus,
      root,
      commands: commands ? document.createElement('nav') : null,
      shortcuts: [],
      panelContributions: Object.freeze([]),
      focusInitial: vi.fn(() => input.focus()),
      onActivate: vi.fn(),
      onDeactivate: vi.fn(),
    };
  };
  const collection = screen('Collection', true);
  const settings = screen('Settings', false);
  const extraction = screen('Extraction', true);
  const refine = screen('Refine', true, 'contextual');
  return { screenHost, commandHost, selector, collection, settings, extraction, refine };
}

function panelFixture(id: string) {
  const root = document.createElement('aside');
  root.style.setProperty('--panel-open-width', '240px');
  root.style.setProperty('--panel-folded-width', '36px');
  const content = document.createElement('div'); content.id = `${id}-content`;
  const contributionHost = document.createElement('div'); contributionHost.id = `${id}-host`;
  const fallbackContent = document.createElement('p'); fallbackContent.textContent = `No ${id} content`;
  const foldButton = document.createElement('button');
  const revealButton = document.createElement('button');
  content.append(contributionHost);
  root.append(content, foldButton, revealButton);
  return { id, root, content, contributionHost, fallbackContent, foldButton, revealButton };
}

function workspaceFixture(commandHost: HTMLElement, screenHost: HTMLElement, panel: ReturnType<typeof panelFixture>) {
  const workspace = document.createElement('div');
  const center = document.createElement('div');
  Object.defineProperty(workspace, 'clientWidth', { value: 1200 });
  document.body.append(workspace);
  workspace.append(panel.root, center);
  center.append(commandHost, screenHost);
  return { workspace, center };
}

function panelContentFixture() {
  const root = document.createElement('section');
  const mount = vi.fn((host: HTMLElement) => host.replaceChildren(root));
  return { root, mount };
}

describe('application shell screen ownership', () => {
  it('reclaims each panel width and notifies the active screen once after both settle', async () => {
    const f = fixture();
    const workspace = document.createElement('div');
    const center = document.createElement('div');
    Object.defineProperty(workspace, 'clientWidth', { value: 1200 });
    const finishes: (() => void)[] = [];
    const panels = ['left', 'right'].map(id => {
      const panel = panelFixture(id);
      const { root } = panel;
      workspace.append(root);
      Object.defineProperty(root, 'getAnimations', { value: () => [{ transitionProperty: 'width', effect: { target: root }, finished: new Promise<void>(resolve => finishes.push(resolve)) }] });
      return panel;
    });
    document.body.append(workspace); workspace.append(center); center.append(f.commandHost, f.screenHost);
    const changed = vi.fn(); const settled = vi.fn();
    const shell = new ApplicationShellController({ ...f, workspace, center, panels, screens: [f.collection, f.settings], onBoundsChange: changed, onBoundsSettled: settled });
    settled.mockClear();
    panels[0].foldButton.click();
    expect(changed).toHaveBeenLastCalledWith(f.collection, 924, 240);
    panels[1].foldButton.click();
    expect(changed).toHaveBeenLastCalledWith(f.collection, 1128, 240);
    finishes[0](); await Promise.resolve(); await Promise.resolve();
    expect(shell.workspaceMoving).toBe(true);
    expect(settled).not.toHaveBeenCalled();
    finishes[1](); await Promise.resolve(); await Promise.resolve();
    expect(settled).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledWith(f.collection);
    expect(shell.workspaceMoving).toBe(false);
    shell.destroy();
  });
  it('mounts one screen and hides a redundant selector', () => {
    const f = fixture();
    const shell = new ApplicationShellController({ ...f, screens: [f.collection] });
    expect(shell.activeScreen).toBe(f.collection);
    expect(f.selector.hidden).toBe(true);
    expect(f.commandHost.firstElementChild).toBe(f.collection.commands);
    expect(f.collection.focusInitial).toHaveBeenCalledOnce();
    expect(f.collection.onActivate).toHaveBeenCalledOnce();
    expect(f.collection.root.contains(document.activeElement)).toBe(true);
  });

  it('switches to a commandless screen without stale commands or inactive focus', () => {
    const f = fixture();
    const shell = new ApplicationShellController({ ...f, screens: [f.collection, f.settings, f.extraction] });
    shell.activate(f.settings.id);
    expect(f.commandHost.hidden).toBe(true);
    expect(f.commandHost.childElementCount).toBe(0);
    expect(f.collection.root.hidden).toBe(true);
    expect(f.collection.root.inert).toBe(true);
    expect(f.settings.root.hidden).toBe(false);
    expect(f.settings.root.contains(document.activeElement)).toBe(true);
    expect(f.selector.hidden).toBe(false);
    expect(f.selector.value).toBe('Settings');
    expect(f.collection.onDeactivate).toHaveBeenCalledOnce();
    expect(f.settings.onActivate).toHaveBeenCalledOnce();
  });

  it('supports the fixed GIF Extraction caller and preserves the Clips fold state', () => {
    const f = fixture();
    const clips = panelFixture('clips');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    const sharedRanges = panelContentFixture();
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const shell = new ApplicationShellController({ ...f, ...workspace, panels: [clips], screens: [f.collection, f.settings, extraction, f.refine] });

    clips.foldButton.click();
    shell.activate(extraction.id);

    expect(clips.root.classList.contains('folded')).toBe(true);
    expect(sharedRanges.mount).toHaveBeenCalledWith(clips.contributionHost);
    expect(clips.contributionHost.firstElementChild).toBe(sharedRanges.root);
    expect(Array.from(f.selector.options).map(option => option.value)).toEqual(['Collection', 'Settings', 'Extraction']);
  });

  it('supports contextual Refine Gif with deterministic lifecycle, a temporary label, and one-time Clips expansion', () => {
    const f = fixture();
    const clips = panelFixture('clips');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    const sharedRanges = panelContentFixture();
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const refine = { ...f.refine, panelContributions: [{ panelId: 'clips', content: sharedRanges, entryBehavior: 'expand-once' as const }] } satisfies IAppScreen;
    const order: string[] = [];
    extraction.onDeactivate = vi.fn(() => order.push('extraction:deactivate'));
    refine.onActivate = vi.fn(() => order.push('refine:activate'));
    refine.focusInitial = vi.fn(() => order.push('refine:focus'));
    const shell = new ApplicationShellController({
      ...f,
      ...workspace,
      panels: [clips],
      screens: [f.collection, f.settings, extraction, refine],
      onScreenChange: screen => order.push(`${screen.id}:changed`),
    });
    shell.activate(extraction.id);
    order.length = 0;
    clips.foldButton.click();

    shell.activate(refine.id);

    expect(order).toEqual(['extraction:deactivate', 'refine:activate', 'refine:focus', 'Refine:changed']);
    expect(clips.root.classList.contains('folded')).toBe(false);
    expect(sharedRanges.mount).toHaveBeenCalledWith(clips.contributionHost);
    expect(clips.contributionHost.firstElementChild).toBe(sharedRanges.root);
    expect(f.selector.value).toBe('Refine');
    expect(Array.from(f.selector.options).map(option => [option.value, option.textContent])).toEqual([
      ['Collection', 'Collection'], ['Settings', 'Settings'], ['Extraction', 'Extraction'], ['Refine', 'Refine'],
    ]);

    clips.foldButton.click();
    shell.activate(extraction.id);
    shell.activate(refine.id);
    expect(clips.root.classList.contains('folded')).toBe(true);
    shell.activate(f.collection.id);
    expect(Array.from(f.selector.options).map(option => option.value)).toEqual(['Collection', 'Settings', 'Extraction']);
  });

  it('settles rapid requests with matching commands, selector and focus', () => {
    const f = fixture();
    const shell = new ApplicationShellController({ ...f, screens: [f.collection, f.settings, f.extraction] });
    shell.activate('Settings');
    shell.activate('Extraction');
    shell.activate('Collection');
    expect(shell.activeScreen).toBe(f.collection);
    expect(f.commandHost.hidden).toBe(false);
    expect(f.commandHost.firstElementChild).toBe(f.collection.commands);
    expect(f.selector.value).toBe('Collection');
    expect(f.collection.root.contains(document.activeElement)).toBe(true);
    expect([f.settings, f.extraction].every(s => s.root.hidden && s.root.inert)).toBe(true);
  });

  it('honors the selector and rejects an unknown screen without changing state', () => {
    const f = fixture();
    const shell = new ApplicationShellController({ ...f, screens: [f.collection, f.settings] });
    f.selector.value = 'Settings';
    f.selector.dispatchEvent(new Event('change'));
    expect(shell.activeScreen).toBe(f.settings);
    expect(() => shell.activate('missing')).toThrow('Unknown app screen');
    expect(shell.activeScreen).toBe(f.settings);
  });

  it('rejects duplicate registration before moving caller-owned content', () => {
    const f = fixture();
    expect(() => new ApplicationShellController({ ...f, screens: [f.collection, f.collection] })).toThrow('Duplicate app screen');
    expect(f.screenHost.childElementCount).toBe(0);
  });
});
