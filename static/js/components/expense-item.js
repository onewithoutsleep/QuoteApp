import { ListCard, ListCardRow } from './list-card.js';
import { Badge } from './badge.js';
import { Button } from './button.js';
import { escapeHtml } from './dom.js';
import { fmtPrice } from '../utils.js';

export function ExpenseItem(exp, onDelete) {
  const card = ListCard();
  const row = ListCardRow({
    center: true,
    body: `
      <div class="item-title item-title--md">${escapeHtml(exp.description || '(no description)')}</div>
      <div class="item-meta">${[
        exp.category ? Badge(exp.category, 'primary') : '',
        escapeHtml(exp.expense_date || ''),
        exp.notes ? ` · ${escapeHtml(exp.notes)}` : '',
      ].join('')}</div>`,
    aside: (() => {
      const wrap = document.createElement('div');
      wrap.className = 'list-card-aside';
      const amount = document.createElement('div');
      amount.className = 'amount amount--danger';
      amount.textContent = `$${fmtPrice(exp.amount)}`;
      const del = Button({ label: '✕', variant: 'ghost', attrs: { 'aria-label': 'Delete' } });
      del.addEventListener('click', onDelete);
      wrap.append(amount, del);
      return wrap;
    })(),
  });
  card.appendChild(row);
  return card;
}
