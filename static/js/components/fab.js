import { navigate } from '../router.js';

export function renderFab(slot, { hash, label = '+' } = {}) {
  slot.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fab';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
  btn.addEventListener('click', () => navigate(hash));
  slot.appendChild(btn);
}

export function clearFab(slot) {
  slot.innerHTML = '';
}
