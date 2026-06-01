import * as api from '../api.js';
import { getState } from '../state.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { FormField, chipField, optionChipGroup } from '../components/form.js';
import { Button } from '../components/button.js';
import { LoadingState } from '../components/loading-state.js';
import { escAttr, escapeHtml, capitalize } from '../components/dom.js';
import { todayISO, bindRadioGroup, fmtPrice } from '../utils.js';

const FOUND_VIA = ['knock', 'referral', 'facebook', 'other'];

export const quoteFormPage = {
  async mount({ root, slots, navigate, params }) {
    renderNav(slots.nav, 'quotes');
    const editId = params.id;
    const isEdit = !!editId;
    const houseId = new URLSearchParams(location.hash.split('?')[1] || '').get('house_id') || '';

    const { page, content } = createPage({ className: 'quote-form-page' });
    content.appendChild(Card({ body: LoadingState() }));
    mountPage(root, page);

    let quote = null;
    let house = null;
    const rates = getState().rates || await api.getRates();

    try {
      if (isEdit) {
        quote = await api.getQuote(editId);
        if (!quote) return navigate('#/quotes');
      } else if (houseId) {
        house = await api.getHouse(houseId);
      }
    } catch (err) {
      console.error(err);
      return navigate('#/quotes');
    }

    const foundVia = quote?.found_via || (houseId ? 'knock' : '');
    const form = document.createElement('form');
    form.id = 'quote-form';
    form.append(
      hidden('house_id', house?.id || quote?.house_id || houseId),
      addressBlock(house, quote),
      FormField({ label: 'Customer Name', name: 'customer', value: quote?.customer, required: true }),
      FormField({ label: 'Phone Number', name: 'phone', value: quote?.phone }),
      FormField({ label: 'Email', name: 'email', type: 'email', value: quote?.email }),
      FormField({ label: 'Number of Windows', name: 'windows', type: 'number', value: quote?.windows ?? '', required: true, attrs: { id: 'windows', name: 'windows' } }),
      FormField({ label: 'Quote Date', name: 'quote_date', type: 'date', value: quote?.quote_date || todayISO() }),
      FormField({ label: 'Notes', name: 'notes', type: 'textarea', value: quote?.notes }),
      chipField('How did you find them?', optionChipGroup({ name: 'found_via', options: FOUND_VIA.map((v) => ({ value: v, label: capitalize(v) })), selected: foundVia })),
      Button({ label: isEdit ? 'Recalculate' : 'Calculate Quote', type: 'button', attrs: { id: 'calc-btn' } }),
    );

    const results = document.createElement('div');
    results.id = 'quoteResults';
    results.hidden = !quote;
    results.innerHTML = `
      <hr><h3>Prices</h3>
      <table class="table price-table">
        <tr><th></th><th>${isEdit ? 'Current' : 'Base'}</th><th>Your Price</th></tr>
        <tr><td>Outside</td><td>$<span id="outsideBase">${quote ? fmtPrice(quote.outside_price) : '—'}</span></td>
          <td><input class="input" id="outside" name="outside" type="number" step="0.01" required value="${quote?.outside_price ?? ''}"></td></tr>
        <tr><td>Inside</td><td>$<span id="insideBase">${quote ? fmtPrice(quote.inside_price) : '—'}</span></td>
          <td><input class="input" id="inside" name="inside" type="number" step="0.01" required value="${quote?.inside_price ?? ''}"></td></tr>
        <tr><td>Both</td><td>$<span id="bothBase">${quote ? fmtPrice(quote.both_price) : '—'}</span></td>
          <td><input class="input" id="both" name="both" type="number" step="0.01" required value="${quote?.both_price ?? ''}"></td></tr>
      </table>`;
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.append(
      Button({ label: 'Save Quote', type: 'submit' }),
      ...(isEdit ? [Button({ label: 'Delete Quote', type: 'button', variant: 'danger', attrs: { id: 'delete-btn' } })] : []),
      Button({ label: 'Cancel', type: 'button', variant: 'link', attrs: { id: 'cancel-btn' } }),
    );
    results.append(actions);
    form.append(results);

    content.innerHTML = '';
    content.appendChild(Card({ header: `<h2>${isEdit ? 'Edit Quote' : 'New Quote'}</h2>`, body: form }));
    bindRadioGroup(root);

    const calc = () => {
      const w = parseInt(root.querySelector('#windows').value, 10) || 0;
      const o = Math.round(w * rates.outside_rate);
      const i = Math.round(w * rates.inside_rate);
      const b = Math.round(w * rates.both_rate);
      root.querySelector('#outsideBase').textContent = fmtPrice(o);
      root.querySelector('#insideBase').textContent = fmtPrice(i);
      root.querySelector('#bothBase').textContent = fmtPrice(b);
      if (!isEdit) {
        root.querySelector('#outside').value = o;
        root.querySelector('#inside').value = i;
        root.querySelector('#both').value = b;
      }
      results.hidden = false;
    };

    root.querySelector('#windows')?.addEventListener('input', calc);
    root.querySelector('#calc-btn')?.addEventListener('click', calc);
    root.querySelector('#cancel-btn')?.addEventListener('click', () => navigate('#/quotes'));
    root.querySelector('#delete-btn')?.addEventListener('click', async () => {
      if (!confirm('Delete this quote and its address? This cannot be undone.')) return;
      await api.deleteQuote(editId);
      navigate('#/quotes');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        house_id: fd.get('house_id') || null,
        address: fd.get('address') || null,
        customer: fd.get('customer'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        windows: parseInt(fd.get('windows'), 10),
        outside: parseFloat(fd.get('outside')),
        inside: parseFloat(fd.get('inside')),
        both: parseFloat(fd.get('both')),
        notes: fd.get('notes'),
        quote_date: fd.get('quote_date'),
        found_via: fd.get('found_via') || null,
      };
      try {
        if (isEdit) await api.updateQuote(editId, payload);
        else await api.createQuote(payload);
        navigate('#/quotes');
      } catch (err) {
        alert('Failed to save quote.');
        console.error(err);
      }
    });
  },
  unmount() {},
};

function hidden(name, value) {
  const i = document.createElement('input');
  i.type = 'hidden';
  i.name = name;
  i.value = value || '';
  return i;
}

function addressBlock(house, quote) {
  const addr = house?.address || quote?.address;
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  if (addr) {
    wrap.innerHTML = `<label class="field-label">Address</label><div class="address-readonly">${escapeHtml(addr)}</div>`;
  } else {
    wrap.appendChild(FormField({ label: 'Address', name: 'address', placeholder: '123 Main St', required: true }));
  }
  return wrap;
}
