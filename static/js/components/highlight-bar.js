import { escapeHtml } from './dom.js';

export function HighlightBar({ label, amount, tone = 'danger' }) {
  const el = document.createElement('div');
  el.className = `highlight-bar highlight-bar--${tone}`;
  el.innerHTML = `<span class="highlight-bar__label">${escapeHtml(label)}</span><span class="highlight-bar__amount">${amount}</span>`;
  return el;
}
