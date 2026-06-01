import { escapeHtml } from './dom.js';

export function LoadingState(message = 'Loading…', { className = 'loading-state' } = {}) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = escapeHtml(message);
  return el;
}
