export function createOrderFileController({
  orderFileInput,
  canLoadCollection,
  onCollectionLines,
  showStatus,
  collectionFirstUnavailableText,
  collectionReadErrorText,
}) {
  function onLoadOrderClick() {
    if (!canLoadCollection()) {
      showStatus(collectionFirstUnavailableText(), 4000);
      return;
    }
    if (typeof orderFileInput.showPicker === 'function') orderFileInput.showPicker();
    else orderFileInput.click();
  }

  function onOrderFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
      file.text()
        .then((text) => {
          const lines = text.replace(/\r/g, '').split('\n');
          onCollectionLines(lines, file);
        })
        .catch((err) => showStatus(collectionReadErrorText(err), 4000));
    }
    e.target.value = '';
  }

  return { onLoadOrderClick, onOrderFileChange };
}
