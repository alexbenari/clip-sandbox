export function renderActiveSourceSelector({
  selectEl,
  options = [],
  selectedValue = '',
  label = '',
  defaultTitle = '',
} = {}) {
  if (!(selectEl instanceof HTMLSelectElement)) return;

  selectEl.innerHTML = '';
  if (options.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = label || defaultTitle;
    selectEl.appendChild(option);
    selectEl.disabled = true;
    selectEl.value = '';
    selectEl.title = option.textContent;
    return;
  }

  for (const choice of Array.from(options)) {
    const option = document.createElement('option');
    option.value = choice?.value || '';
    option.textContent = choice?.label || '';
    selectEl.appendChild(option);
  }

  selectEl.disabled = false;
  selectEl.value = selectedValue;
  selectEl.title = label || defaultTitle;
}
