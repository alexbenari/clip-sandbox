export function createSaveAsNewDialogController({
  dialog,
  nameInput,
  errorMessageEl,
  confirmBtn,
  cancelBtn,
  validateName = () => '',
  onConfirm = () => {},
  onCancel = () => {},
} = {}) {
  if (!dialog || !nameInput || !confirmBtn) {
    return {
      open: () => {},
      close: () => {},
      isOpen: () => false,
      handleGlobalKeyDown: () => false,
      showValidationError: () => {},
    };
  }

  let externalError = '';

  function isOpen() {
    return !dialog.hidden;
  }

  function clearExternalError() {
    externalError = '';
  }

  function currentValidationError() {
    return externalError || validateName(nameInput.value || '');
  }

  function hasNameInput() {
    return !!String(nameInput.value || '').trim();
  }

  function renderState() {
    const validationError = currentValidationError();
    if (errorMessageEl) errorMessageEl.textContent = validationError;
    confirmBtn.disabled = !hasNameInput();
  }

  function open() {
    nameInput.value = '';
    clearExternalError();
    dialog.hidden = false;
    renderState();
    nameInput.focus();
  }

  function close() {
    dialog.hidden = true;
    nameInput.value = '';
    clearExternalError();
    if (errorMessageEl) errorMessageEl.textContent = '';
    confirmBtn.disabled = false;
  }

  function showValidationError(text, { focusInput = false } = {}) {
    externalError = text || '';
    renderState();
    if (focusInput) nameInput.focus();
  }

  function handleGlobalKeyDown(event) {
    if (!isOpen() || event?.key !== 'Escape') return false;
    close();
    onCancel();
    return true;
  }

  nameInput.addEventListener('input', () => {
    clearExternalError();
    renderState();
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || confirmBtn.disabled) return;
    event.preventDefault();
    onConfirm(nameInput.value || '');
  });
  confirmBtn.addEventListener('click', () => {
    if (confirmBtn.disabled) return;
    onConfirm(nameInput.value || '');
  });
  cancelBtn?.addEventListener('click', () => {
    close();
    onCancel();
  });

  return {
    open,
    close,
    isOpen,
    handleGlobalKeyDown,
    showValidationError,
  };
}
