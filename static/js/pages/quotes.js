import * as api from '../api.js';
import { mountListPage } from '../components/page-list.js';
import { QuoteCard } from '../components/quote-card.js';

export const quotesPage = {
  async mount(ctx) {
    const shell = mountListPage({
      ...ctx,
      navKey: 'quotes',
      title: 'Saved Quotes',
      className: 'quotes-page',
      fab: { hash: '#/quotes/new', label: 'Add quote' },
      load: async (list) => {
        const quotes = await api.getQuotes();
        list.innerHTML = '';
        if (!quotes?.length) {
          shell.showEmpty('No quotes yet. Add one to get started.');
          return;
        }
        quotes.forEach((q) => list.appendChild(QuoteCard(q, ctx.navigate)));
      },
    });
    await shell.refresh();
  },
  unmount() {},
};
