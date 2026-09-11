import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationShellController } from '../../src/ui/application-shell-controller.js';
import type { IAppScreen } from '../../src/ui/app-screen.js';

afterEach(() => { document.body.replaceChildren(); });

function fixture() {
  const screenHost = document.createElement('main');
  const commandHost = document.createElement('div');
  const selector = document.createElement('select');
  document.body.append(selector, commandHost, screenHost);
  const screen = (id: string, commands: boolean): IAppScreen => {
    const root = document.createElement('section');
    const input = document.createElement('input');
    root.append(input);
    return { id, label: id, root, commands: commands ? document.createElement('nav') : null, shortcuts: [], focusInitial: vi.fn(() => input.focus()) };
  };
  // Collection, Settings and a future editor exercise the same caller contract.
  const collection = screen('Collection', true);
  const settings = screen('Settings', false);
  const extraction = screen('Extraction', true);
  return { screenHost, commandHost, selector, collection, settings, extraction };
}

describe('application shell screen ownership', () => {
  it('reclaims each panel width and notifies the active screen once after both settle', async () => {
    const f = fixture();
    const workspace = document.createElement('div');
    const center = document.createElement('div');
    Object.defineProperty(workspace, 'clientWidth', { value: 1200 });
    const finishes: (() => void)[] = [];
    const panels = ['left', 'right'].map(id => {
      const root = document.createElement('aside');
      root.style.setProperty('--panel-open-width', '240px');
      root.style.setProperty('--panel-folded-width', '36px');
      const content = document.createElement('div'); content.id = id;
      const foldButton = document.createElement('button');
      const revealButton = document.createElement('button');
      root.append(content, foldButton, revealButton); workspace.append(root);
      Object.defineProperty(root, 'getAnimations', { value: () => [{ transitionProperty: 'width', effect: { target: root }, finished: new Promise<void>(resolve => finishes.push(resolve)) }] });
      return { root, content, foldButton, revealButton };
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
