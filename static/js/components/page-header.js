import { escapeHtml } from './dom.js';

export function PageHeader({ title, tag = 'h1', className = 'page-header' } = {}) {
  const header = document.createElement('div');
  header.className = className;
  const heading = document.createElement(tag);
  heading.innerHTML = escapeHtml(title);
  header.appendChild(heading);
  return header;
}
