type EventHandler = (event: Event) => void;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  return !!editable;
}

export function bindControlEvents({
  pickBtn,
  folderInput = null,
  saveBtn,
  saveAsNewBtn,
  addToCollectionBtn,
  deleteFromDiskBtn,
  loadOrderBtn,
  orderFileInput,
  toggleTitlesBtn,
  fsBtn,
  onPickFolder,
  onFolderInputChange = null,
  onSaveOrder,
  onSaveAsNew,
  onAddToCollection,
  onDeleteFromDisk,
  onLoadOrderClick,
  onOrderFileChange,
  onToggleTitles,
  onFsToggle,
}: {
  pickBtn: HTMLElement;
  folderInput?: HTMLElement | null;
  saveBtn: HTMLElement;
  saveAsNewBtn?: HTMLElement | null;
  addToCollectionBtn?: HTMLElement | null;
  deleteFromDiskBtn?: HTMLElement | null;
  loadOrderBtn?: HTMLElement | null;
  orderFileInput?: HTMLElement | null;
  toggleTitlesBtn: HTMLElement;
  fsBtn: HTMLElement;
  onPickFolder: EventHandler;
  onFolderInputChange?: EventHandler | null;
  onSaveOrder: EventHandler;
  onSaveAsNew?: EventHandler | null;
  onAddToCollection?: EventHandler | null;
  onDeleteFromDisk?: EventHandler | null;
  onLoadOrderClick?: EventHandler | null;
  onOrderFileChange?: EventHandler | null;
  onToggleTitles: EventHandler;
  onFsToggle: EventHandler;
}): void {
  pickBtn.addEventListener('click', onPickFolder);
  if (folderInput && onFolderInputChange) folderInput.addEventListener('change', onFolderInputChange);
  saveBtn.addEventListener('click', onSaveOrder);
  if (saveAsNewBtn && onSaveAsNew) saveAsNewBtn.addEventListener('click', onSaveAsNew);
  if (addToCollectionBtn && onAddToCollection) addToCollectionBtn.addEventListener('click', onAddToCollection);
  if (deleteFromDiskBtn && onDeleteFromDisk) deleteFromDiskBtn.addEventListener('click', onDeleteFromDisk);
  if (loadOrderBtn && onLoadOrderClick) loadOrderBtn.addEventListener('click', onLoadOrderClick);
  if (orderFileInput && onOrderFileChange) orderFileInput.addEventListener('change', onOrderFileChange);
  toggleTitlesBtn.addEventListener('click', onToggleTitles);
  fsBtn.addEventListener('click', onFsToggle);
}

export function bindGlobalEvents({ onFsChange, onResize, onKeyDown, onGlobalKeyDown }: {
  onFsChange: EventHandler;
  onResize: EventHandler;
  onKeyDown: (event: KeyboardEvent) => void;
  onGlobalKeyDown: (event: KeyboardEvent) => void;
}): void {
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', onGlobalKeyDown);
}

