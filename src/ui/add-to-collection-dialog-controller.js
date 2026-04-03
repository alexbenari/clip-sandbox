export function createAddToCollectionDialogController({
  dialog,
  destinationSelect,
  newCollectionNameLabel,
  newCollectionNameInput,
  errorMessageEl,
  confirmBtn,
  cancelBtn,
  newSelectionValue,
  validateNewName = () => '',
  onConfirm = () => {},
  onCancel = () => {},
} = {}) {
  if (!dialog || !destinationSelect || !newCollectionNameInput || !confirmBtn) {
    return {
      open: () => {},
      close: () => {},
      isOpen: () => false,
      showValidationError: () => {},
    };
  }

  const doc = dialog.ownerDocument || document;
  let hasSelection = false;
  let externalError = '';

  function isOpen() {
    return !!dialog.open;
  }

  function isNewDestinationSelected() {
    return destinationSelect.value === newSelectionValue;
  }

  function clearExternalError() {
    externalError = '';
  }

  function currentDestination() {
    return isNewDestinationSelected()
      ? { kind: 'new', name: newCollectionNameInput.value || '' }
      : { kind: 'existing', selectionValue: destinationSelect.value };
  }

  function currentValidationError() {
    if (externalError) return externalError;
    if (!isNewDestinationSelected()) return '';
    return validateNewName(newCollectionNameInput.value || '');
  }

  function focusActiveField() {
    if (isNewDestinationSelected()) newCollectionNameInput.focus();
    else destinationSelect.focus();
  }

  function renderState() {
    const validationError = currentValidationError();
    if (isNewDestinationSelected()) newCollectionNameLabel?.removeAttribute('hidden');
    else newCollectionNameLabel?.setAttribute('hidden', '');
    if (errorMessageEl) errorMessageEl.textContent = validationError;
    confirmBtn.disabled = !hasSelection || !!validationError;
  }

  function renderChoices(choices = [], { startWithNewCollection = false } = {}) {
    destinationSelect.innerHTML = '';
    for (const choice of Array.from(choices)) {
      const option = doc.createElement('option');
      option.value = choice.selectionValue;
      option.textContent = choice.label;
      destinationSelect.appendChild(option);
    }
    const newOption = doc.createElement('option');
    newOption.value = newSelectionValue;
    newOption.textContent = 'New collection...';
    destinationSelect.appendChild(newOption);
    destinationSelect.value = startWithNewCollection
      ? newSelectionValue
      : choices[0]?.selectionValue || newSelectionValue;
  }

  function open({
    choices = [],
    hasSelection: nextHasSelection = false,
    startWithNewCollection = false,
  } = {}) {
    hasSelection = !!nextHasSelection;
    newCollectionNameInput.value = '';
    clearExternalError();
    renderChoices(choices, { startWithNewCollection });
    renderState();
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    focusActiveField();
  }

  function close() {
    newCollectionNameInput.value = '';
    clearExternalError();
    if (errorMessageEl) errorMessageEl.textContent = '';
    newCollectionNameLabel?.setAttribute('hidden', '');
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
      return;
    }
    dialog.removeAttribute('open');
  }

  function showValidationError(text, { focusNameInput = false } = {}) {
    externalError = text || '';
    renderState();
    if (focusNameInput) newCollectionNameInput.focus();
  }

  destinationSelect.addEventListener('change', () => {
    clearExternalError();
    renderState();
    focusActiveField();
  });
  newCollectionNameInput.addEventListener('input', () => {
    clearExternalError();
    renderState();
  });
  newCollectionNameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || confirmBtn.disabled) return;
    event.preventDefault();
    onConfirm(currentDestination());
  });
  confirmBtn.addEventListener('click', () => onConfirm(currentDestination()));
  cancelBtn?.addEventListener('click', () => {
    close();
    onCancel();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
    onCancel();
  });

  return {
    open,
    close,
    isOpen,
    showValidationError,
  };
}
