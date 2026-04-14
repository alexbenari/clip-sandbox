export function createAddToCollectionDialogController({
  dialog,
  destinationSelect,
  newCollectionNameLabel,
  newCollectionNameInput,
  errorMessageEl,
  confirmBtn,
  cancelBtn,
  newChoiceValue,
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
  let choiceByValue = new Map();

  function isOpen() {
    return !!dialog.open;
  }

  function isNewDestinationSelected() {
    return destinationSelect.value === newChoiceValue;
  }

  function clearExternalError() {
    externalError = '';
  }

  function currentDestination() {
    const selectedChoice = choiceByValue.get(destinationSelect.value) || null;
    return isNewDestinationSelected()
      ? { kind: 'new', name: newCollectionNameInput.value || '' }
      : { kind: 'existing', sourceId: selectedChoice?.sourceId || selectedChoice?.collectionRef || null };
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
    choiceByValue = new Map();
    destinationSelect.innerHTML = '';
    for (const choice of Array.from(choices)) {
      choiceByValue.set(choice.value, choice);
      const option = doc.createElement('option');
      option.value = choice.value;
      option.textContent = choice.label;
      destinationSelect.appendChild(option);
    }
    const newOption = doc.createElement('option');
    newOption.value = newChoiceValue;
    newOption.textContent = 'New collection...';
    destinationSelect.appendChild(newOption);
    destinationSelect.value = startWithNewCollection
      ? newChoiceValue
      : choices[0]?.value || newChoiceValue;
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
