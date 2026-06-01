import * as api from '../api.js';
import { BottomSheet } from './sheet.js';
import { escapeHtml } from './dom.js';

export function openCompleteSheet(svc, { onSaved } = {}) {
  const isComplete = !!svc.completed;
  const isPaid = !!svc.paid;
  const sheet = BottomSheet({
    body: `
      <div class="sheet-title">${escapeHtml(svc.customer || '')}</div>
      <div class="sheet-address">${escapeHtml(svc.address || '')}</div>
      <div class="toggle-row">
        <span class="toggle-label">Mark as Complete</span>
        <label class="toggle-switch">
          <input type="checkbox" id="sCompleted" ${isComplete ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="sPaySection" style="${isComplete ? '' : 'display:none'}">
        <label class="field-label">Minutes</label>
        <input type="number" id="sDuration" class="sheet-input" placeholder="e.g. 45" value="${svc.duration_minutes || ''}">
        <div class="toggle-row">
          <span class="toggle-label">Paid</span>
          <label class="toggle-switch">
            <input type="checkbox" id="sPaid" ${isPaid ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div id="sAmtSection" style="${isPaid ? '' : 'display:none'}">
          <label class="field-label">Amount Paid ($)</label>
          <input type="number" id="sAmtPaid" class="sheet-input" step="0.01" value="${svc.amount_paid || ''}">
        </div>
      </div>
      <button type="button" class="sheet-save-btn">Save</button>
      <button type="button" class="sheet-cancel-btn">Cancel</button>`,
  });

  const completedEl = sheet.querySelector('#sCompleted');
  const paySec = sheet.querySelector('#sPaySection');
  const paidEl = sheet.querySelector('#sPaid');
  const amtSec = sheet.querySelector('#sAmtSection');

  completedEl?.addEventListener('change', () => {
    paySec.style.display = completedEl.checked ? '' : 'none';
  });
  paidEl?.addEventListener('change', () => {
    amtSec.style.display = paidEl.checked ? '' : 'none';
  });

  sheet.querySelector('.sheet-save-btn')?.addEventListener('click', async () => {
    const form = new FormData();
    form.append('completed', completedEl.checked ? '1' : '0');
    form.append('paid', paidEl?.checked ? '1' : '0');
    form.append('amount_paid', sheet.querySelector('#sAmtPaid')?.value || '');
    form.append('duration_minutes', sheet.querySelector('#sDuration')?.value || '');
    try {
      await api.completeService(svc.id, form);
      sheet.remove();
      onSaved?.({
        completed: completedEl.checked ? 1 : 0,
        paid: paidEl?.checked ? 1 : 0,
        amount_paid: form.get('amount_paid') ? parseFloat(form.get('amount_paid')) : null,
        duration_minutes: form.get('duration_minutes') ? parseInt(form.get('duration_minutes'), 10) : null,
      });
    } catch {
      alert('Error saving. Please try again.');
    }
  });
  return sheet;
}
