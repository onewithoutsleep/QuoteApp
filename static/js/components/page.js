import { PageHeader } from './page-header.js';

/**
 * Standard page shell: .page > .page-header + .page-content.container
 * @returns {{ page: HTMLElement, content: HTMLElement, header: HTMLElement|null }}
 */
export function createPage({ title, className = '', tag = 'h1' } = {}) {
  const page = document.createElement('div');
  page.className = ['page', className].filter(Boolean).join(' ');

  let headerEl = null;
  if (title) {
    headerEl = PageHeader({ title, tag });
    page.appendChild(headerEl);
  }

  const content = document.createElement('div');
  content.className = 'page-content container';
  page.appendChild(content);

  return { page, content, header: headerEl };
}

export function mountPage(root, pageEl) {
  root.innerHTML = '';
  root.appendChild(pageEl);
}
