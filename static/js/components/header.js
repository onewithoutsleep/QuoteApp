import { PageHeader } from './page-header.js';

export function renderHeader(slot, title) {
  slot.innerHTML = '';
  if (!title) return;
  slot.appendChild(PageHeader({ title, className: 'app-header' }));
}

export function clearHeader(slot) {
  slot.innerHTML = '';
}
