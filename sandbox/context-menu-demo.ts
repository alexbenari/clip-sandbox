import { ContextMenuControl, type ContextMenuEntry } from '../src/ui/context-menu-control.js';

const root = document.getElementById('sandboxContextMenu');
const panel = document.getElementById('sandboxContextMenuPanel');
const openBtn = document.getElementById('openBtn') as HTMLButtonElement;
const demoSurface = document.getElementById('demoSurface') as HTMLElement;
const resultLog = document.getElementById('resultLog') as HTMLElement;
const menu = new ContextMenuControl({ root, panel, document });

function writeLog(text: string): void {
  resultLog.textContent = text;
}

function buildEntries(sourceLabel: string): ContextMenuEntry[] {
  return [
    {
      id: 'primary',
      label: `Primary action from ${sourceLabel}`,
      onSelect: () => writeLog(`Primary action invoked from ${sourceLabel}.`),
    },
    { id: 'disabled', label: 'Disabled action', disabled: true },
    { separator: true },
    {
      id: 'destructive',
      label: 'Destructive action',
      tone: 'destructive',
      onSelect: () => writeLog(`Destructive action invoked from ${sourceLabel}.`),
    },
  ];
}

openBtn.addEventListener('click', () => {
  const rect = openBtn.getBoundingClientRect();
  menu.open({
    point: { x: rect.left + rect.width / 2, y: rect.bottom + 8 },
    items: buildEntries('button'),
    focusFirst: true,
    restoreFocusTo: openBtn,
  });
});

demoSurface.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  menu.open({ point: { x: event.clientX, y: event.clientY }, items: buildEntries('surface') });
});
