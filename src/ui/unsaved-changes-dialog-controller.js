function isDialogOpen(dialog) {
  return !!(dialog?.open || dialog?.hasAttribute?.('open'));
}

export function createUnsavedChangesDialogController({
  dialog,
  messageEl,
  confirmBtn,
  discardBtn,
  cancelBtn,
} = {}) {
  if (!dialog) {
    return {
      open: () => {},
      close: () => {},
      isOpen: () => false,
      handleGlobalKeyDown: () => false,
    };
  }

  let handlers = {};

  function isOpen() {
    return isDialogOpen(dialog);
  }

  function resetHandlers() {
    handlers = {};
  }

  function open({ message = '', onSave = null, onDiscard = null, onCancel = null } = {}) {
    handlers = { onSave, onDiscard, onCancel };
    if (messageEl) messageEl.textContent = message;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    resetHandlers();
  }

  function cancelFlow() {
    const { onCancel } = handlers;
    close();
    onCancel?.();
  }

  function handleGlobalKeyDown(event) {
    if (!isOpen() || event?.key !== 'Escape') return false;
    cancelFlow();
    return true;
  }

  confirmBtn?.addEventListener('click', () => {
    const { onSave } = handlers;
    close();
    onSave?.();
  });
  discardBtn?.addEventListener('click', () => {
    const { onDiscard } = handlers;
    close();
    onDiscard?.();
  });
  cancelBtn?.addEventListener('click', cancelFlow);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelFlow();
  });

  return {
    open,
    close,
    isOpen,
    handleGlobalKeyDown,
  };
}
