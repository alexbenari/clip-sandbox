export function createCollectionConflictController({
  root,
  summaryEl,
  listEl,
  applyBtn,
  cancelBtn,
} = {}) {
  if (!root) {
    return {
      show: () => {},
      hide: () => {},
      isVisible: () => false,
    };
  }

  let handlers = {};

  function isVisible() {
    return !root.hidden;
  }

  function hide() {
    root.hidden = true;
    if (summaryEl) summaryEl.textContent = '';
    if (listEl) listEl.textContent = '';
    handlers = {};
  }

  function show({ summary = '', list = '', onApply = null, onCancel = null } = {}) {
    handlers = { onApply, onCancel };
    if (summaryEl) summaryEl.textContent = summary;
    if (listEl) listEl.textContent = list;
    root.hidden = false;
  }

  applyBtn?.addEventListener('click', () => {
    const { onApply } = handlers;
    hide();
    onApply?.();
  });
  cancelBtn?.addEventListener('click', () => {
    const { onCancel } = handlers;
    hide();
    onCancel?.();
  });

  return {
    show,
    hide,
    isVisible,
  };
}
