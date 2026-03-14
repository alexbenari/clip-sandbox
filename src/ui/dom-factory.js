export function updateCardLabel(card, formatLabel) {
  if (!card) return;
  const label = card.querySelector('.filename');
  if (!label) return;
  const name = card.dataset.name || '';
  const duration = Number.parseFloat(card.dataset.durationSeconds);
  const text = formatLabel(name, Number.isFinite(duration) ? duration : null);
  label.textContent = text;
  label.title = text;
}

export function setCardDuration(card, seconds, formatLabel) {
  if (!card) return;
  if (Number.isFinite(seconds)) card.dataset.durationSeconds = seconds;
  else card.dataset.durationSeconds = '';
  updateCardLabel(card, formatLabel);
}

export function clearGridCards(grid) {
  for (const el of Array.from(grid.children)) {
    const url = el.dataset.objectUrl;
    if (url) URL.revokeObjectURL(url);
  }
  grid.innerHTML = '';
}

export function removeDragOverClasses(grid) {
  for (const el of grid.children) el.classList.remove('drag-over');
}

export function createThumbCard({
  file,
  id,
  formatLabel,
  onSelect,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onLoadedMetadata,
}) {
  const url = URL.createObjectURL(file);
  const card = document.createElement('div');
  card.className = 'thumb';
  card.tabIndex = 0;
  card.id = id;
  card.draggable = true;
  card.dataset.name = file.name;
  card.dataset.objectUrl = url;
  card.dataset.durationSeconds = '';

  const vid = document.createElement('video');
  vid.src = url;
  vid.loop = true;
  vid.autoplay = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  vid.addEventListener(
    'canplay',
    () => {
      vid.play().catch(() => {});
    },
    { once: true }
  );

  const name = document.createElement('div');
  name.className = 'filename';
  name.title = file.name;
  name.textContent = formatLabel(file.name);

  card.appendChild(vid);
  card.appendChild(name);

  vid.addEventListener('loadedmetadata', () => onLoadedMetadata(card, vid));
  card.addEventListener('click', () => onSelect(card));
  card.addEventListener('dblclick', () => onDoubleClick?.(card));
  card.addEventListener('dragstart', (e) => onDragStart(card, e));
  card.addEventListener('dragend', () => onDragEnd(card));
  card.addEventListener('dragover', (e) => onDragOver(card, e));
  card.addEventListener('dragleave', () => onDragLeave(card));
  card.addEventListener('drop', (e) => onDrop(card, e));

  return card;
}
