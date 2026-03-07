export function countText(count, niceNum) {
  return count === 1 ? '1 clip' : `${niceNum(count)} clips`;
}

export function loadedVideosText(count) {
  return `Loaded ${count} video${count === 1 ? '' : 's'}.`;
}

export function fullscreenSlotsText(slots) {
  return `Fullscreen slots: ${slots} (showing ${Math.max(0, slots - 1)})`;
}

export function orderApplyErrorText(issues) {
  return `Could not apply order due to the following issues:\n\n${issues.join('\n\n')}`;
}
