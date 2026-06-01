import { escapeHtml } from './dom.js';

export function EmptyState(message, { className = 'empty-state' } = {}) {
  const el = document.createElement('p');
  el.className = className;
  el.innerHTML = escapeHtml(message);
  return el;
}
