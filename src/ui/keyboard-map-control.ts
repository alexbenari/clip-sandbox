import type { AppScreen, ShortcutDescriptor } from './app-screen.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export class KeyboardMapControl {
  private readonly document: Document;
  private readonly globalShortcuts: readonly ShortcutDescriptor[];

  constructor(
    private readonly root: HTMLElement,
    globalShortcuts: readonly ShortcutDescriptor[],
    private readonly requestClose: () => void = () => {},
  ) {
    this.document = root.ownerDocument;
    this.globalShortcuts = globalShortcuts;
    this.root.setAttribute('aria-labelledby', 'keyboardMapHeading');
  }

  render(screen: Pick<AppScreen, 'label' | 'shortcuts'>): void {
    const heading = this.document.createElement('h2');
    heading.id = 'keyboardMapHeading';
    heading.tabIndex = -1;
    heading.textContent = 'Keyboard shortcuts';

    const header = this.document.createElement('div');
    header.className = 'utility-header';
    header.append(heading, this.createCloseButton());

    const context = this.document.createElement('p');
    context.className = 'keyboard-context';
    const label = this.document.createElement('strong');
    label.textContent = screen.label;
    const note = this.document.createElement('span');
    note.textContent = 'Shortcuts below reflect the active screen.';
    context.append(label, this.document.createTextNode(' '), note);

    const screenHeading = this.document.createElement('h3');
    screenHeading.textContent = screen.label;
    const screenShortcuts = this.createShortcutGroups(screen.shortcuts);
    const screenEmptyMessage = screen.shortcuts.length === 0 ? this.createEmptyMessage() : null;

    const globalHeading = this.document.createElement('h3');
    globalHeading.textContent = 'Global';
    const globalShortcuts = this.createShortcutGroups(this.globalShortcuts);

    this.root.replaceChildren(
      header,
      context,
      ...(screen.shortcuts.some(shortcut => shortcut.group) ? [] : [screenHeading]),
      ...(screenEmptyMessage ? [screenEmptyMessage] : []),
      screenShortcuts,
      globalHeading,
      globalShortcuts,
    );
  }

  focusInitial(): void {
    this.root.querySelector<HTMLElement>('#keyboardMapHeading')?.focus();
  }

  private createCloseButton(): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.title = 'Close Keyboard shortcuts';
    button.setAttribute('aria-label', 'Close Keyboard shortcuts');
    button.addEventListener('click', this.requestClose);

    const icon = this.document.createElementNS(SVG_NAMESPACE, 'svg');
    icon.classList.add('shell-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.6');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');

    const path = this.document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', 'm6 6 12 12M18 6 6 18');
    icon.append(path);
    button.append(icon);
    return button;
  }

  private createShortcutGroups(shortcuts: readonly ShortcutDescriptor[]): DocumentFragment {
    const groups = new Map<string | null, ShortcutDescriptor[]>();
    for (const shortcut of shortcuts) {
      const group = shortcut.group ?? null;
      const groupShortcuts = groups.get(group) ?? [];
      groupShortcuts.push(shortcut);
      groups.set(group, groupShortcuts);
    }

    const fragment = this.document.createDocumentFragment();
    for (const [group, groupShortcuts] of groups) {
      if (group !== null) {
        const heading = this.document.createElement('h3');
        heading.textContent = group;
        fragment.append(heading);
      }
      fragment.append(this.createShortcutList(groupShortcuts));
    }
    return fragment;
  }

  private createShortcutList(shortcuts: readonly ShortcutDescriptor[]): HTMLDListElement {
    const list = this.document.createElement('dl');
    list.className = 'keyboard-shortcuts';

    for (const shortcut of shortcuts) {
      const description = this.document.createElement('dt');
      description.textContent = shortcut.description;
      const keys = this.document.createElement('dd');
      keys.className = 'keyboard-keys';
      this.appendSequences(keys, shortcut.sequences);
      const row = this.document.createElement('div');
      row.append(description, keys);
      list.append(row);
    }
    return list;
  }

  private appendSequences(container: HTMLElement, sequences: ShortcutDescriptor['sequences']): void {
    sequences.forEach((sequence, sequenceIndex) => {
      if (sequenceIndex > 0) container.append(this.document.createTextNode(' or '));
      sequence.forEach((key, keyIndex) => {
        if (keyIndex > 0) container.append(this.document.createTextNode('+'));
        const keycap = this.document.createElement('kbd');
        keycap.textContent = key;
        container.append(keycap);
      });
    });
  }

  private createEmptyMessage(): HTMLParagraphElement {
    const message = this.document.createElement('p');
    message.textContent = 'No screen-specific shortcuts.';
    return message;
  }
}
