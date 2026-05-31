export function renderHeader(slot, title) {
  slot.innerHTML = '';
  if (!title) return;
  const el = document.createElement('div');
  el.className = 'app-header';
  el.innerHTML = `<h1>${title}</h1>`;
  slot.appendChild(el);
}

export function clearHeader(slot) {
  slot.innerHTML = '';
}
