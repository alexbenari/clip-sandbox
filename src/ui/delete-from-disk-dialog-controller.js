function isDialogOpen(dialog) {
  return !!(dialog?.open || dialog?.hasAttribute?.('open'));
}

export function createDeleteFromDiskDialogController({
  preflightDialog,
  preflightTextEl,
  confirmPreflightBtn,
  discardPreflightBtn,
  cancelPreflightBtn,
  confirmDialog,
  confirmSummaryEl,
  confirmPreviewEl,
  confirmDeleteBtn,
  cancelDeleteBtn,
} = {}) {
  if (!preflightDialog && !confirmDialog) {
    return {
      openPreflight: () => {},
      openConfirm: () => {},
      closePreflight: () => {},
      closeConfirm: () => {},
      closeAll: () => {},
      isOpen: () => false,
      isPreflightOpen: () => false,
      isConfirmOpen: () => false,
      handleGlobalKeyDown: () => false,
    };
  }

  let preflightHandlers = {};
  let confirmHandlers = {};

  function isPreflightOpen() {
    return isDialogOpen(preflightDialog);
  }

  function isConfirmOpen() {
    return isDialogOpen(confirmDialog);
  }

  function isOpen() {
    return isPreflightOpen() || isConfirmOpen();
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
      return;
    }
    dialog.setAttribute('open', '');
  }

  function closePreflight() {
    closeDialog(preflightDialog);
    preflightHandlers = {};
  }

  function closeConfirm() {
    closeDialog(confirmDialog);
    confirmHandlers = {};
  }

  function closeAll() {
    closePreflight();
    closeConfirm();
  }

  function cancelPreflight() {
    const { onCancel } = preflightHandlers;
    closePreflight();
    onCancel?.();
  }

  function cancelConfirm() {
    const { onCancel } = confirmHandlers;
    closeConfirm();
    onCancel?.();
  }

  function openPreflight({ text = '', onSave = null, onDiscard = null, onCancel = null } = {}) {
    preflightHandlers = { onSave, onDiscard, onCancel };
    if (preflightTextEl) preflightTextEl.textContent = text;
    openDialog(preflightDialog);
  }

  function openConfirm({ summary = '', preview = '', onConfirm = null, onCancel = null } = {}) {
    confirmHandlers = { onConfirm, onCancel };
    if (confirmSummaryEl) confirmSummaryEl.textContent = summary;
    if (confirmPreviewEl) confirmPreviewEl.textContent = preview;
    openDialog(confirmDialog);
  }

  function handleGlobalKeyDown(event) {
    if (event?.key !== 'Escape') return false;
    if (isConfirmOpen()) {
      cancelConfirm();
      return true;
    }
    if (isPreflightOpen()) {
      cancelPreflight();
      return true;
    }
    return false;
  }

  confirmPreflightBtn?.addEventListener('click', () => {
    const { onSave } = preflightHandlers;
    closePreflight();
    onSave?.();
  });
  discardPreflightBtn?.addEventListener('click', () => {
    const { onDiscard } = preflightHandlers;
    closePreflight();
    onDiscard?.();
  });
  cancelPreflightBtn?.addEventListener('click', cancelPreflight);
  preflightDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelPreflight();
  });

  confirmDeleteBtn?.addEventListener('click', () => {
    const { onConfirm } = confirmHandlers;
    closeConfirm();
    onConfirm?.();
  });
  cancelDeleteBtn?.addEventListener('click', cancelConfirm);
  confirmDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelConfirm();
  });

  return {
    openPreflight,
    openConfirm,
    closePreflight,
    closeConfirm,
    closeAll,
    isOpen,
    isPreflightOpen,
    isConfirmOpen,
    handleGlobalKeyDown,
  };
}
