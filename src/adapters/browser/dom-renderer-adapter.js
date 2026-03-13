import { countText } from '../../ui/view-model.js';

export function showStatus(statusEl, message, timeout = 2500) {
  statusEl.textContent = message;
  statusEl.hidden = false;
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusEl.hidden = true;
  }, timeout);
}

export function applyGridLayout(gridEl, cols, cellHeight) {
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (const el of gridEl.children) el.style.height = `${cellHeight}px`;
}

export function updateClipCount(countEl, buttons, count, niceNum) {
  countEl.textContent = countText(count, niceNum);
  const actionButtons = Array.isArray(buttons) ? buttons : [buttons];
  for (const button of actionButtons.filter(Boolean)) {
    button.disabled = count === 0;
  }
}
