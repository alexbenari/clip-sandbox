export function createOrderFileController({
  orderFileInput,
  validateOrderStrict,
  getOrderArray,
  applyOrder,
  orderApplyErrorText,
}) {
  function onLoadOrderClick() {
    if (typeof orderFileInput.showPicker === 'function') orderFileInput.showPicker();
    else orderFileInput.click();
  }

  function onOrderFileChange(e) {
    const f = e.target.files && e.target.files[0];
    if (f) {
      f.text()
        .then((t) => {
          const lines = t.replace(/\r/g, '').split('\n');
          const { issues, order } = validateOrderStrict(lines, getOrderArray());
          if (issues.length) {
            alert(orderApplyErrorText(issues));
            return;
          }
          applyOrder(order);
        })
        .catch((err) => alert('Failed to read order file: ' + (err?.message || err)));
    }
    e.target.value = '';
  }

  return { onLoadOrderClick, onOrderFileChange };
}
