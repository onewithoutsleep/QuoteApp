import * as api from '../api.js';
import { getState } from '../state.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { LoadingState } from '../components/loading-state.js';
import { optionChipGroup } from '../components/form.js';
import { escAttr, escapeHtml, capitalize } from '../components/dom.js';
import { todayISO, bindRadioGroup, fmtPrice } from '../utils.js';

const FOUND_VIA = ['knock', 'referral', 'facebook', 'other'];

export const quoteFormPage = {
  async mount({ root, slots, navigate, params }) {
    renderNav(slots.nav, 'quotes');
    const editId = params.id;
    const isEdit = !!editId;
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    const houseId = query.get('house_id') || '';

    const { page, content } = createPage({ className: 'quote-form-page' });
    content.appendChild(Card({ body: LoadingState() }));
    mountPage(root, page);

    let quote = null;
    let house = null;
    const rates = getState().rates || await api.getRates();

    try {
      if (isEdit) {
        quote = await api.getQuote(editId);
        if (!quote) {
          navigate('#/quotes');
          return;
        }
      } else if (houseId) {
        house = await api.getHouse(houseId);
      }
    } catch (err) {
      console.error(err);
      navigate('#/quotes');
      return;
    }

    const foundVia = quote?.found_via || (houseId ? 'knock' : '');
    content.innerHTML = '';
    const formCard = Card({
      header: `<h2>${isEdit ? 'Edit Quote' : 'New Quote'}</h2>`,
      body: `
        <form id="quote-form">
          <input type="hidden" name="house_id" value="${escAttr(house?.id || quote?.house_id || houseId || '')}">
          ${renderAddressField(house, quote)}
          <label class="field-label">Customer Name</label>
          <input class="input" name="customer" required value="${escAttr(quote?.customer)}">
          <label class="field-label">Phone Number</label>
          <input class="input" name="phone" value="${escAttr(quote?.phone)}">
          <label class="field-label">Email</label>
          <input class="input" name="email" type="email" value="${escAttr(quote?.email)}">
          <label class="field-label">Number of Windows</label>
          <input class="input" id="windows" name="windows" type="number" required value="${quote?.windows ?? ''}">
          <label class="field-label">Quote Date</label>
          <input class="input" type="date" name="quote_date" value="${quote?.quote_date || todayISO()}">
          <label class="field-label">Notes</label>
          <textarea name="notes">${escapeHtml(quote?.notes)}</textarea>
          <label class="field-label">How did you find them?</label>
          <div id="found-via-slot"></div>
          <button type="button" id="calc-btn">${isEdit ? 'Recalculate' : 'Calculate Quote'}</button>
          <div id="quoteResults" style="${quote ? '' : 'display:none'}">
            <hr><h3>Prices</h3>
            <table class="price-table table">
              <tr><th></th><th>${isEdit ? 'Current' : 'Base'}</th><th>Your Price</th></tr>
              <tr><td>Outside</td><td>$<span id="outsideBase">${quote ? fmtPrice(quote.outside_price) : '—'}</span></td>
                <td><input class="input" id="outside" name="outside" type="number" step="0.01" required value="${quote?.outside_price ?? ''}"></td></tr>
              <tr><td>Inside</td><td>$<span id="insideBase">${quote ? fmtPrice(quote.inside_price) : '—'}</span></td>
                <td><input class="input" id="inside" name="inside" type="number" step="0.01" required value="${quote?.inside_price ?? ''}"></td></tr>
              <tr><td>Both</td><td>$<span id="bothBase">${quote ? fmtPrice(quote.both_price) : '—'}</span></td>
                <td><input class="input" id="both" name="both" type="number" step="0.01" required value="${quote?.both_price ?? ''}"></td></tr>
            </table>
            <br>
            <button type="submit">Save Quote</button>
            ${isEdit ? '<button type="button" id="delete-btn" class="btn-danger">Delete Quote</button>' : ''}
            <button type="button" class="btn-link" id="cancel-btn">Cancel</button>
          </div>
        </form>`,
    });
    content.appendChild(formCard);

    const fvSlot = root.querySelector('#found-via-slot');
    const fvGroup = optionChipGroup({
      name: 'found_via',
      options: FOUND_VIA.map((v) => ({ value: v, label: capitalize(v) })),
      selected: foundVia,
    });
    fvGroup.id = 'found-via';
    fvSlot.replaceWith(fvGroup);
    bindRadioGroup(root);

    const outsideRate = rates.outside_rate;
    const insideRate = rates.inside_rate;
    const bothRate = rates.both_rate;

    function calculateQuote() {
      const windows = parseInt(root.querySelector('#windows').value, 10) || 0;
      const outside = Math.round(windows * outsideRate);
      const inside = Math.round(windows * insideRate);
      const both = Math.round(windows * bothRate);
      root.querySelector('#outsideBase').textContent = fmtPrice(outside);
      root.querySelector('#insideBase').textContent = fmtPrice(inside);
      root.querySelector('#bothBase').textContent = fmtPrice(both);
      if (!isEdit) {
        root.querySelector('#outside').value = outside;
        root.querySelector('#inside').value = inside;
        root.querySelector('#both').value = both;
      }
      root.querySelector('#quoteResults').style.display = 'block';
    }

    root.querySelector('#windows')?.addEventListener('input', calculateQuote);
    root.querySelector('#calc-btn')?.addEventListener('click', calculateQuote);
    root.querySelector('#cancel-btn')?.addEventListener('click', () => navigate('#/quotes'));

    root.querySelector('#delete-btn')?.addEventListener('click', async () => {
      if (!confirm('Delete this quote and its address? This cannot be undone.')) return;
      try {
        await api.deleteQuote(editId);
        navigate('#/quotes');
      } catch (err) {
        alert('Failed to delete.');
        console.error(err);
      }
    });

    root.querySelector('#quote-form')?.addEventListener('submit', async (e) => {
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

function renderAddressField(house, quote) {
  const addr = house?.address || quote?.address;
  if (addr) {
    return `<label class="field-label">Address</label>
      <div class="address-readonly">${escapeHtml(addr)}</div>`;
  }
  return `<label class="field-label">Address</label>
    <input class="input" name="address" placeholder="123 Main St" required>`;
}
