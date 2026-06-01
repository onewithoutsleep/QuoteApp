import * as api from '../api.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { FormField, FormLabel, optionChipGroup } from '../components/form.js';
import { Button } from '../components/button.js';
import { HighlightBar } from '../components/highlight-bar.js';
import { ExpenseItem } from '../components/expense-item.js';
import { EmptyState } from '../components/empty-state.js';
import { LoadingState } from '../components/loading-state.js';
import { renderNav } from '../components/nav.js';
import { fmtPrice, todayISO, bindRadioGroup } from '../utils.js';

const CATEGORIES = ['Supplies', 'Fuel', 'Equipment', 'Marketing', 'Labor', 'Other'];

export const expensesPage = {
  async mount({ root, slots }) {
    renderNav(slots.nav, 'expenses');
    const { page, content } = createPage({ title: 'Expenses', tag: 'h2' });
    const totalSlot = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'page-list';

    const form = document.createElement('form');
    form.id = 'expense-form';
    const catWrap = document.createElement('div');
    catWrap.className = 'form-group';
    catWrap.append(FormLabel('Category'), optionChipGroup({ name: 'category', options: CATEGORIES, thirds: true }));
    form.append(
      FormField({ label: 'Date', name: 'expense_date', type: 'date', value: todayISO(), required: true }),
      catWrap,
      FormField({ label: 'Description', name: 'description', placeholder: 'e.g. Squeegees, washer fluid' }),
      FormField({ label: 'Amount ($)', name: 'amount', type: 'number', attrs: { step: '0.01', placeholder: 'e.g. 45.00' } }),
      FormField({ label: 'Notes (optional)', name: 'notes', type: 'textarea', attrs: { style: 'min-height:60px' } }),
      Button({ label: 'Add Expense', type: 'submit' }),
    );

    content.append(totalSlot, Card({ className: 'card--compact', header: '<h3>Add Expense</h3>', body: form }), list);
    mountPage(root, page);
    bindRadioGroup(root);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (!fd.get('category')) {
        alert('Please select a category.');
        return;
      }
      try {
        await api.createExpense({
          expense_date: fd.get('expense_date'),
          category: fd.get('category'),
          description: fd.get('description'),
          amount: fd.get('amount'),
          notes: fd.get('notes'),
        });
        e.target.reset();
        e.target.querySelector('[name="expense_date"]').value = todayISO();
        root.querySelectorAll('.option-chip').forEach((l) => l.classList.remove('selected'));
        await loadExpenses(totalSlot, list);
      } catch (err) {
        alert('Failed to add expense.');
        console.error(err);
      }
    });

    await loadExpenses(totalSlot, list);
  },
  unmount() {},
};

async function loadExpenses(totalSlot, list) {
  list.innerHTML = '';
  list.appendChild(LoadingState());
  try {
    const expenses = await api.getExpenses() || [];
    const total = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    totalSlot.innerHTML = '';
    if (expenses.length) {
      totalSlot.appendChild(HighlightBar({ label: 'Total Expenses', amount: `$${fmtPrice(total)}`, tone: 'danger' }));
    }
    list.innerHTML = '';
    if (!expenses.length) {
      list.appendChild(EmptyState('No expenses yet.'));
      return;
    }
    expenses.forEach((exp) => {
      list.appendChild(ExpenseItem(exp, async () => {
        if (!confirm('Delete this expense?')) return;
        try {
          await api.deleteExpense(exp.id);
          await loadExpenses(totalSlot, list);
        } catch {
          alert('Failed to delete.');
        }
      }));
    });
  } catch (err) {
    list.innerHTML = '';
    list.appendChild(EmptyState('Failed to load expenses.'));
    console.error(err);
  }
}
