import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { EmptyState } from '../components/empty-state.js';
import { LoadingState } from '../components/loading-state.js';
import { escapeHtml } from '../components/dom.js';
import { fmtPrice, todayISO, bindRadioGroup } from '../utils.js';

const CATEGORIES = ['Supplies', 'Fuel', 'Equipment', 'Marketing', 'Labor', 'Other'];

export const expensesPage = {
  async mount({ root, slots }) {
    renderNav(slots.nav, 'expenses');

    const { page, content } = createPage({ title: 'Expenses', className: 'expenses-page', tag: 'h2' });
    const totalEl = document.createElement('div');
    totalEl.id = 'expenses-total';
    const addCard = Card({
      className: 'add-card',
      header: '<h3>Add Expense</h3>',
      body: `
        <form id="expense-form">
          <label class="field-label">Date</label>
          <input type="date" class="input" name="expense_date" value="${todayISO()}" required>
          <label class="field-label">Category</label>
          <div class="cat-group" id="cat-group"></div>
          <label class="field-label">Description</label>
          <input type="text" class="input" name="description" placeholder="e.g. Squeegees, washer fluid">
          <label class="field-label">Amount ($)</label>
          <input type="number" class="input" name="amount" step="0.01" placeholder="e.g. 45.00">
          <label class="field-label">Notes (optional)</label>
          <textarea name="notes" placeholder="Any extra details…" style="min-height:60px;"></textarea>
          <button type="submit">Add Expense</button>
        </form>`,
    });
    const listEl = document.createElement('div');
    listEl.id = 'expenses-list';
    listEl.appendChild(LoadingState());

    content.append(totalEl, addCard, listEl);
    mountPage(root, page);

    const catGroup = root.querySelector('#cat-group');
    CATEGORIES.forEach((cat) => {
      catGroup.innerHTML += `<label class="cat-opt"><input type="radio" name="category" value="${cat}"> ${cat}</label>`;
    });
    bindRadioGroup(root);

    root.querySelector('#expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const category = fd.get('category');
      if (!category) {
        alert('Please select a category.');
        return;
      }
      try {
        await api.createExpense({
          expense_date: fd.get('expense_date'),
          category,
          description: fd.get('description'),
          amount: fd.get('amount'),
          notes: fd.get('notes'),
        });
        e.target.reset();
        e.target.querySelector('[name="expense_date"]').value = todayISO();
        root.querySelectorAll('.cat-opt').forEach((l) => l.classList.remove('selected'));
        await loadExpenses(root);
      } catch (err) {
        alert('Failed to add expense.');
        console.error(err);
      }
    });

    await loadExpenses(root);
  },
  unmount() {},
};

async function loadExpenses(root) {
  const list = root.querySelector('#expenses-list');
  const totalEl = root.querySelector('#expenses-total');
  try {
    const expenses = await api.getExpenses() || [];
    const total = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    totalEl.innerHTML = expenses.length
      ? `<div class="total-bar"><span class="label">Total Expenses</span><span class="amount">$${fmtPrice(total)}</span></div>`
      : '';

    list.innerHTML = '';
    if (!expenses.length) {
      list.appendChild(EmptyState('No expenses yet.'));
      return;
    }

    expenses.forEach((exp) => {
      const card = document.createElement('div');
      card.className = 'expense-card';
      card.innerHTML = `
        <div class="expense-row">
          <div class="expense-info">
            <div class="expense-desc">${escapeHtml(exp.description || '(no description)')}</div>
            <div class="expense-meta">
              ${exp.category ? `<span class="expense-cat">${escapeHtml(exp.category)}</span>` : ''}
              ${escapeHtml(exp.expense_date || '')}
              ${exp.notes ? ` · ${escapeHtml(exp.notes)}` : ''}
            </div>
          </div>
          <div class="expense-actions">
            <div class="expense-amount">$${fmtPrice(exp.amount)}</div>
            <button type="button" class="expense-delete" aria-label="Delete">✕</button>
          </div>
        </div>`;
      card.querySelector('.expense-delete')?.addEventListener('click', async () => {
        if (!confirm('Delete this expense?')) return;
        try {
          await api.deleteExpense(exp.id);
          await loadExpenses(root);
        } catch (err) {
          alert('Failed to delete.');
          console.error(err);
        }
      });
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = '';
    list.appendChild(EmptyState('Failed to load expenses.'));
    console.error(err);
  }
}
