import * as api from '../api.js';
import { getState } from '../state.js';
import { renderNav } from '../components/nav.js';
import { todayISO, bindRadioGroup, fmtPrice } from '../utils.js';

const FOUND_VIA = ['knock', 'referral', 'facebook', 'other'];

export const quoteFormPage = {
  async mount({ root, slots, navigate, params }) {
    renderNav(slots.nav, 'quotes');
    const editId = params.id;
    const isEdit = !!editId;
    const query = new URLSearchParams(location.hash.split('?')[1] || '');
    const houseId = query.get('house_id') || '';

    root.innerHTML = '<div class="container"><div class="card"><p>Loading…</p></div></div>';

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
    root.innerHTML = `
      <div class="container quote-form-page">
        <div class="card">
          <h2>${isEdit ? 'Edit Quote' : 'New Quote'}</h2>
          <form id="quote-form">
            <input type="hidden" name="house_id" value="${house?.id || quote?.house_id || houseId || ''}">
            ${renderAddressField(house, quote, isEdit)}
            <label class="field-label">Customer Name</label>
            <input name="customer" required value="${esc(quote?.customer)}">
            <label class="field-label">Phone Number</label>
            <input name="phone" value="${esc(quote?.phone)}">
            <label class="field-label">Email</label>
            <input name="email" type="email" value="${esc(quote?.email)}">
            <label class="field-label">Number of Windows</label>
            <input id="windows" name="windows" type="number" required value="${quote?.windows ?? ''}">
            <label class="field-label">Quote Date</label>
            <input type="date" name="quote_date" value="${quote?.quote_date || todayISO()}">
            <label class="field-label">Notes</label>
            <textarea name="notes">${esc(quote?.notes)}</textarea>
            <label class="field-label">How did you find them?</label>
            <div class="found-via-group" id="found-via"></div>
            <button type="button" id="calc-btn">${isEdit ? 'Recalculate' : 'Calculate Quote'}</button>
            <div id="quoteResults" style="${quote ? '' : 'display:none'}">
              <hr><h3>Prices</h3>
              <table class="price-table">
                <tr><th></th><th>${isEdit ? 'Current' : 'Base'}</th><th>Your Price</th></tr>
                <tr><td>Outside</td><td>$<span id="outsideBase">${quote ? fmtPrice(quote.outside_price) : '—'}</span></td>
                  <td><input id="outside" name="outside" type="number" step="0.01" required value="${quote?.outside_price ?? ''}"></td></tr>
                <tr><td>Inside</td><td>$<span id="insideBase">${quote ? fmtPrice(quote.inside_price) : '—'}</span></td>
                  <td><input id="inside" name="inside" type="number" step="0.01" required value="${quote?.inside_price ?? ''}"></td></tr>
                <tr><td>Both</td><td>$<span id="bothBase">${quote ? fmtPrice(quote.both_price) : '—'}</span></td>
                  <td><input id="both" name="both" type="number" step="0.01" required value="${quote?.both_price ?? ''}"></td></tr>
              </table>
              <br>
              <button type="submit">Save Quote</button>
              ${isEdit ? '<button type="button" id="delete-btn" class="btn-danger">Delete Quote</button>' : ''}
              <button type="button" class="btn-link" id="cancel-btn">Cancel</button>
            </div>
          </form>
        </div>
      </div>`;

    const fvGroup = root.querySelector('#found-via');
    FOUND_VIA.forEach((v) => {
      fvGroup.innerHTML += `<label class="found-via-option ${foundVia === v ? 'selected' : ''}">
        <input type="radio" name="found_via" value="${v}" ${foundVia === v ? 'checked' : ''}> ${capitalize(v)}
      </label>`;
    });
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

function renderAddressField(house, quote, isEdit) {
  const addr = house?.address || quote?.address;
  return `<label class="field-label">Address</label>
    <input name="address" placeholder="123 Main St" value="${esc(addr)}" required>`;
}

function esc(s) {
  return s != null ? String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
