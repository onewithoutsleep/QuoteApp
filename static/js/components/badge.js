import { escapeHtml } from './dom.js';

export function Badge(text, tone = 'primary') {
  if (!text) return '';
  return `<span class="badge badge--${tone}">${escapeHtml(text)}</span>`;
}

export function Badges(items) {
  return items.filter(Boolean).join('');
}
