import { renderNav } from './nav.js';
import { renderFab } from './fab.js';
import { createPage, mountPage } from './page.js';
import { LoadingState } from './loading-state.js';
import { EmptyState } from './empty-state.js';

export function mountListPage({ root, slots, navKey, title, tag = 'h2', fab, className = '', load }) {
  renderNav(slots.nav, navKey);
  if (fab) renderFab(slots.fab, fab);

  const { page, content } = createPage({ title, tag, className });
  const list = document.createElement('div');
  list.className = 'page-list';
  list.appendChild(LoadingState());
  content.appendChild(list);
  mountPage(root, page);

  return {
    page,
    content,
    list,
    async refresh() {
      list.innerHTML = '';
      list.appendChild(LoadingState());
      try {
        await load(list, content);
      } catch (err) {
        list.innerHTML = '';
        list.appendChild(EmptyState('Failed to load.'));
        console.error(err);
      }
    },
    showEmpty(message) {
      list.innerHTML = '';
      list.appendChild(EmptyState(message));
    },
  };
}
