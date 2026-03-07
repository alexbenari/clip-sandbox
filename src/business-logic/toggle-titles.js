export function runToggleTitles({ body, toggleBtn, hidden }) {
  body.classList.toggle('titles-hidden', hidden);
  toggleBtn.textContent = hidden ? 'Show Titles' : 'Hide Titles';
}
