export function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const editable = target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  return !!editable;
}

export function bindControlEvents({
  pickBtn,
  folderInput,
  saveBtn,
  saveAsNewBtn,
  loadOrderBtn,
  orderFileInput,
  toggleTitlesBtn,
  fsBtn,
  onPickFolder,
  onFolderInputChange,
  onSaveOrder,
  onSaveAsNew,
  onLoadOrderClick,
  onOrderFileChange,
  onToggleTitles,
  onFsToggle,
}) {
  pickBtn.addEventListener('click', onPickFolder);
  folderInput.addEventListener('change', onFolderInputChange);
  saveBtn.addEventListener('click', onSaveOrder);
  saveAsNewBtn?.addEventListener('click', onSaveAsNew);
  loadOrderBtn.addEventListener('click', onLoadOrderClick);
  orderFileInput.addEventListener('change', onOrderFileChange);
  toggleTitlesBtn.addEventListener('click', onToggleTitles);
  fsBtn.addEventListener('click', onFsToggle);
}

export function bindGlobalEvents({ onFsChange, onResize, onKeyDown, onGlobalKeyDown }) {
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keydown', onGlobalKeyDown);
}
