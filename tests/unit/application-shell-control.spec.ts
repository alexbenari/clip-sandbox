import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationShellControl } from '../../src/ui/application-shell-control.js';
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

describe('application shell side panel markup', () => {
  it('finds each marked side panel and its parts, in document order', () => {
    document.body.innerHTML = `
      <aside data-shell-panel="pipelines">
        <div data-shell-panel-content><button data-shell-panel-fold></button>
          <div data-shell-panel-contributions><div data-shell-panel-fallback></div></div></div>
        <button data-shell-panel-reveal></button>
      </aside>
      <aside data-shell-panel="clips">
        <div data-shell-panel-content><button data-shell-panel-fold></button><div data-shell-panel-contributions></div></div>
        <button data-shell-panel-reveal></button>
      </aside>`;

    const [pipelines, clips] = ApplicationShellControl.sidePanelsIn(document);

    expect(pipelines.id).toBe('pipelines');
    expect(pipelines.root.tagName).toBe('ASIDE');
    expect(pipelines.content.hasAttribute('data-shell-panel-content')).toBe(true);
    expect(pipelines.contributionHost.hasAttribute('data-shell-panel-contributions')).toBe(true);
    expect(pipelines.fallbackContent?.hasAttribute('data-shell-panel-fallback')).toBe(true);
    expect(pipelines.foldButton.hasAttribute('data-shell-panel-fold')).toBe(true);
    expect(pipelines.revealButton.hasAttribute('data-shell-panel-reveal')).toBe(true);
    expect(clips.id).toBe('clips');
    expect(clips.fallbackContent).toBeUndefined();
  });

  it('reports a marked side panel that is missing a required part', () => {
    document.body.innerHTML = '<aside data-shell-panel="clips"><div data-shell-panel-content></div></aside>';

    expect(() => ApplicationShellControl.sidePanelsIn(document)).toThrow('Side panel "clips" has no [data-shell-panel-contributions].');
  });

  it('finds no side panels where none are marked', () => {
    expect(ApplicationShellControl.sidePanelsIn(document)).toEqual([]);
  });
});

describe('application shell screen ownership', () => {
  it('hides the window chrome for Collection full screen and restores it', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection, f.settings] });

    shell.setFullScreenLayout(true);
    expect(document.body.classList.contains('fs-active')).toBe(true);
    shell.setFullScreenLayout(false);
    expect(document.body.classList.contains('fs-active')).toBe(false);
    shell.destroy();
  });
  it('keeps the current workspace selected when a leave guard rejects navigation', () => {
    const f = fixture();
    const leavePolicy = { canLeave: vi.fn(() => false) };
    const shell = new ApplicationShellControl({ ...f,
      screens: [f.collection, f.settings], leavePolicy,
    });
    shell.start();
    f.selector.value = f.settings.id;
    f.selector.dispatchEvent(new Event('change', { bubbles: true }));
    expect(shell.activeScreen).toBe(f.collection);
    expect(f.selector.value).toBe(f.collection.id);
    expect(f.collection.onDeactivate).not.toHaveBeenCalled();
    expect(leavePolicy.canLeave).toHaveBeenCalledWith(f.collection, f.settings);
    shell.destroy();
  });
  it('reports which screen change its leave guard held, so the change can be completed later', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f,
      screens: [f.collection, f.settings], leavePolicy: { canLeave: () => false },
    });
    const refused = vi.fn();
    shell.on('screenChangeRefused', refused);
    shell.start();

    f.selector.value = f.settings.id;
    f.selector.dispatchEvent(new Event('change', { bubbles: true }));

    expect(refused).toHaveBeenCalledWith({ from: f.collection, to: f.settings });
    shell.destroy();
  });
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
    const collection = { ...f.collection, onBoundsChanging: changed, onBoundsSettled: settled } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, workspace, center, panels, screens: [collection, f.settings] });
    shell.start();
    settled.mockClear();
    panels[0].foldButton.click();
    expect(changed).toHaveBeenLastCalledWith(924, 240);
    panels[1].foldButton.click();
    expect(changed).toHaveBeenLastCalledWith(1128, 240);
    finishes[0](); await Promise.resolve(); await Promise.resolve();
    expect(shell.workspaceMoving).toBe(true);
    expect(settled).not.toHaveBeenCalled();
    finishes[1](); await Promise.resolve(); await Promise.resolve();
    expect(settled).toHaveBeenCalledOnce();
    expect(shell.workspaceMoving).toBe(false);
    shell.destroy();
  });
  it('gives keys to the active screen only, and none after it is destroyed', () => {
    const f = fixture();
    const collection = { ...f.collection, onKeyDown: vi.fn() } satisfies IAppScreen;
    const settings = { ...f.settings, onKeyDown: vi.fn() } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, screens: [collection, settings] });
    const key = new KeyboardEvent('keydown', { key: 'z' });

    shell.handleKeyDown(key);
    expect(collection.onKeyDown).not.toHaveBeenCalled();
    shell.start();
    shell.handleKeyDown(key);
    shell.activate(settings.id);
    shell.handleKeyDown(key);
    shell.destroy();
    shell.handleKeyDown(key);

    expect(collection.onKeyDown).toHaveBeenCalledOnce();
    expect(settings.onKeyDown).toHaveBeenCalledOnce();
  });

  it('mounts one screen and hides a redundant selector', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection] });
    shell.start();
    expect(shell.activeScreen).toBe(f.collection);
    expect(f.selector.hidden).toBe(true);
    expect(f.commandHost.firstElementChild).toBe(f.collection.commands);
    expect(f.collection.focusInitial).toHaveBeenCalledOnce();
    expect(f.collection.onActivate).toHaveBeenCalledOnce();
    expect(f.collection.root.contains(document.activeElement)).toBe(true);
  });

  it('activates the explicit initial screen instead of relying on registration order', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection, f.settings, f.extraction], initialScreenId: f.extraction.id });
    shell.start();

    expect(shell.activeScreen).toBe(f.extraction);
    expect(f.selector.value).toBe(f.extraction.id);
    expect(f.extraction.root.contains(document.activeElement)).toBe(true);
  });

  it('switches to a commandless screen without stale commands or inactive focus', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection, f.settings, f.extraction] });
    shell.start();
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

  it('applies screen defaults and remembers manual changes separately for each screen', () => {
    const f = fixture();
    const clips = panelFixture('clips');
    const pipelines = panelFixture('pipelines');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    workspace.workspace.append(pipelines.root);
    const sharedRanges = panelContentFixture();
    const collection = { ...f.collection, initiallyFoldedPanelIds: ['clips'] } satisfies IAppScreen;
    const settled = vi.fn();
    const settings = { ...f.settings, initiallyFoldedPanelIds: ['clips', 'pipelines'], onBoundsSettled: settled } satisfies IAppScreen;
    const extraction = { ...f.extraction, initiallyFoldedPanelIds: ['pipelines'], panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const refine = { ...f.refine, initiallyFoldedPanelIds: ['pipelines'], panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, ...workspace, panels: [clips, pipelines], screens: [collection, settings, extraction, refine], initialScreenId: extraction.id });
    shell.start();
    const folded = () => [clips.root, pipelines.root].map(root => root.classList.contains('folded'));

    expect(folded()).toEqual([false, true]);
    expect(clips.contributionHost.firstElementChild).toBe(sharedRanges.root);
    shell.activate(refine.id);
    expect(folded()).toEqual([false, true]);
    clips.foldButton.click();
    pipelines.revealButton.click();
    expect(folded()).toEqual([true, false]);

    shell.activate(collection.id);
    expect(folded()).toEqual([true, false]);
    expect(clips.contributionHost.firstElementChild).toBe(clips.fallbackContent);
    clips.revealButton.click();
    settled.mockClear();
    shell.activate(settings.id);
    expect(folded()).toEqual([true, true]);
    expect(settled).toHaveBeenCalledOnce();
    shell.activate(extraction.id);
    expect(folded()).toEqual([false, true]);
    shell.activate(refine.id);
    expect(folded()).toEqual([true, false]);
    shell.activate(collection.id);
    expect(folded()).toEqual([false, false]);
    expect(clips.contributionHost.firstElementChild).toBe(clips.fallbackContent);
    shell.destroy();
  });

  it('hides a panel with nothing to show on the active screen and gives its width to the workspace', () => {
    const f = fixture();
    const clips = { ...panelFixture('clips'), fallbackContent: undefined };
    const pipelines = panelFixture('pipelines');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, pipelines);
    workspace.workspace.append(clips.root);
    const boundsChanging = vi.fn();
    const collection = { ...f.collection, onBoundsChanging: boundsChanging } satisfies IAppScreen;
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: panelContentFixture() }] } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, ...workspace, panels: [pipelines, clips], screens: [extraction, collection] });
    shell.start();
    expect(clips.root.hidden).toBe(false);

    shell.activate(collection.id);
    expect(clips.root.hidden).toBe(true);
    expect(pipelines.root.hidden).toBe(false);
    pipelines.foldButton.click();
    expect(boundsChanging).toHaveBeenLastCalledWith(1200 - 36, expect.any(Number));

    shell.activate(extraction.id);
    expect(clips.root.hidden).toBe(false);
    shell.destroy();
  });

  it('switches to a screen that hides a folded panel without starting a workspace resize', () => {
    const f = fixture();
    const clips = { ...panelFixture('clips'), fallbackContent: undefined };
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    const boundsChanging = vi.fn();
    const boundsSettled = vi.fn();
    const collection = { ...f.collection, onBoundsChanging: boundsChanging, onBoundsSettled: boundsSettled } satisfies IAppScreen;
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: panelContentFixture() }] } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, ...workspace, panels: [clips], screens: [extraction, collection] });
    shell.start();
    clips.foldButton.click();

    shell.activate(collection.id);

    expect(boundsSettled).toHaveBeenCalledOnce();
    expect(boundsChanging).not.toHaveBeenCalled();
    shell.destroy();
  });

  it('shows a hidden panel again, folded as its screen left it, when that screen returns', () => {
    const f = fixture();
    const clips = { ...panelFixture('clips'), fallbackContent: undefined };
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: panelContentFixture() }] } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, ...workspace, panels: [clips], screens: [extraction, f.collection, f.settings] });
    shell.start();
    clips.foldButton.click();

    shell.activate(f.collection.id);
    shell.activate(f.settings.id);
    shell.activate(extraction.id);

    expect(clips.root.hidden).toBe(false);
    expect(clips.root.classList.contains('folded')).toBe(true);
    shell.destroy();
  });

  it('supports contextual Refine Gif with deterministic lifecycle and a temporary label', () => {
    const f = fixture();
    const clips = panelFixture('clips');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    const sharedRanges = panelContentFixture();
    const extraction = { ...f.extraction, panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const refine = { ...f.refine, openPanelIdsOnEntry: ['clips'], panelContributions: [{ panelId: 'clips', content: sharedRanges }] } satisfies IAppScreen;
    const order: string[] = [];
    extraction.onDeactivate = vi.fn(() => order.push('extraction:deactivate'));
    refine.onActivate = vi.fn(() => order.push('refine:activate'));
    refine.focusInitial = vi.fn(() => order.push('refine:focus'));
    const shell = new ApplicationShellControl({
      ...f,
      ...workspace,
      panels: [clips],
      screens: [f.collection, f.settings, extraction, refine],
    });
    shell.on('screenChanged', screen => order.push(`${screen.id}:changed`));
    shell.start();
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
    expect(clips.root.classList.contains('folded')).toBe(false);
    shell.activate(f.collection.id);
    expect(Array.from(f.selector.options).map(option => option.value)).toEqual(['Collection', 'Settings', 'Extraction']);
  });

  it('opens undeclared panels on first activation, then restores their session state', () => {
    const f = fixture();
    const clips = panelFixture('clips');
    const pipelines = panelFixture('pipelines');
    const workspace = workspaceFixture(f.commandHost, f.screenHost, clips);
    workspace.workspace.append(pipelines.root);
    const settings = { ...f.settings, initiallyFoldedPanelIds: ['clips'] } satisfies IAppScreen;
    const shell = new ApplicationShellControl({ ...f, ...workspace, panels: [clips, pipelines], screens: [settings, f.collection] });
    shell.start();

    expect(clips.root.classList.contains('folded')).toBe(true);
    expect(pipelines.root.classList.contains('folded')).toBe(false);
    shell.activate(f.collection.id);
    expect(clips.root.classList.contains('folded')).toBe(false);
    expect(pipelines.root.classList.contains('folded')).toBe(false);
    clips.foldButton.click();
    shell.activate(settings.id);
    shell.activate(f.collection.id);
    expect(clips.root.classList.contains('folded')).toBe(true);
    expect(pipelines.root.classList.contains('folded')).toBe(false);
    shell.destroy();
  });

  it('settles rapid requests with matching commands, selector and focus', () => {
    const f = fixture();
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection, f.settings, f.extraction] });
    shell.start();
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
    const shell = new ApplicationShellControl({ ...f, screens: [f.collection, f.settings] });
    shell.start();
    f.selector.value = 'Settings';
    f.selector.dispatchEvent(new Event('change'));
    expect(shell.activeScreen).toBe(f.settings);
    expect(() => shell.activate('missing')).toThrow('Unknown app screen');
    expect(shell.activeScreen).toBe(f.settings);
  });

  it('rejects duplicate registration before moving caller-owned content', () => {
    const f = fixture();
    expect(() => new ApplicationShellControl({ ...f, screens: [f.collection, f.collection] })).toThrow('Duplicate app screen');
    expect(f.screenHost.childElementCount).toBe(0);
  });
});
