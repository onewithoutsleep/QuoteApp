import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { LoadingState } from '../components/loading-state.js';
import { optionChipGroup } from '../components/form.js';
import { escAttr, escapeHtml, capitalize } from '../components/dom.js';
import { todayISO, bindRadioGroup, fmtPrice, parseTime24, serviceTimeTo24 } from '../utils.js';

const SERVICE_TYPES = ['outside', 'inside', 'both', 'other'];

export const serviceFormPage = {
  async mount({ root, slots, navigate, params }) {
    renderNav(slots.nav, 'bookings');
    const serviceId = params.id;
    const quoteId = params.quoteId;
    const isEdit = !!serviceId;

    const { page, content } = createPage({ className: 'service-form-page' });
    content.appendChild(Card({ body: LoadingState() }));
    mountPage(root, page);

    let service = null;
    let quote = null;

    try {
      if (isEdit) {
        service = await api.getService(serviceId);
        if (!service) {
          navigate('#/bookings');
          return;
        }
      } else {
        quote = await api.getQuote(quoteId);
        if (!quote) {
          navigate('#/quotes');
          return;
        }
      }
    } catch (err) {
      console.error(err);
      navigate('#/bookings');
      return;
    }

    const data = service || quote;
    const t = parseTime24(service?.service_time || '');
    const currentType = service?.type || 'outside';
    const backHash = '#/bookings';

    content.innerHTML = '';
    const formCard = Card({
      header: `<h2>${isEdit ? 'Edit Booking' : 'Book Service'}</h2>`,
      body: `
        ${isEdit ? `<a class="address-link" href="https://maps.apple.com/?q=${encodeURIComponent(data.address || '')}" target="_blank" rel="noopener">📍 ${escapeHtml(data.address)}</a>` : `<div class="address-readonly">${escapeHtml(data.address)}</div>`}
        <div class="customer-ref">${escapeHtml(data.customer)}${data.phone ? ` · ${escapeHtml(data.phone)}` : ''}</div>
        ${renderQuoteRef(data)}
        <form id="service-form">
          ${!isEdit ? `<input type="hidden" name="quote_id" value="${quote.id}">` : ''}
          <label class="field-label">Date</label>
          <input class="input" type="date" name="service_date" required value="${service?.service_date || todayISO()}">
          <label class="field-label">Time</label>
          <div class="time-row">
            <select name="service_time_hour">${hourOptions(t.hour)}</select>
            <select name="service_time_min">${minOptions(t.min)}</select>
            <select name="service_time_ampm">
              <option value="AM" ${t.ampm === 'AM' ? 'selected' : ''}>AM</option>
              <option value="PM" ${t.ampm === 'PM' ? 'selected' : ''}>PM</option>
            </select>
          </div>
          <label class="field-label">Service Type</label>
          <div id="type-group-slot"></div>
          <label class="field-label">Price ($)</label>
          <input class="input" type="number" id="priceInput" name="price" step="0.01" value="${service?.price ?? ''}">
          <label class="field-label">Notes</label>
          <textarea name="notes">${escapeHtml(service?.notes)}</textarea>
          ${isEdit ? renderCompletionSection(service) : ''}
          <button type="submit">${isEdit ? 'Save Changes' : 'Confirm Booking'}</button>
          ${isEdit ? '<button type="button" id="delete-svc" class="btn-danger">Delete Booking</button>' : ''}
          <button type="button" class="btn-link" id="cancel-btn">Cancel</button>
        </form>`,
    });
    content.appendChild(formCard);

    const typeSlot = root.querySelector('#type-group-slot');
    const typeGroup = optionChipGroup({
      name: 'type',
      options: SERVICE_TYPES.map((v) => ({ value: v, label: capitalize(v) })),
      selected: currentType,
    });
    typeGroup.id = 'type-group';
    typeSlot.replaceWith(typeGroup);
    bindRadioGroup(root);

    root.querySelectorAll('.qrp.tap').forEach((el) => {
      el.addEventListener('click', () => {
        root.querySelector('#priceInput').value = el.dataset.price;
        root.querySelector('#priceInput').focus();
      });
    });

    if (isEdit) {
      const completedToggle = root.querySelector('#completedToggle');
      const paidToggle = root.querySelector('#paidToggle');
      completedToggle?.addEventListener('change', () => {
        root.querySelector('#paymentFields').style.display = completedToggle.checked ? '' : 'none';
      });
      paidToggle?.addEventListener('change', () => {
        root.querySelector('#amountPaidField').style.display = paidToggle.checked ? '' : 'none';
      });
      root.querySelector('#delete-svc')?.addEventListener('click', async () => {
        if (!confirm('Delete this booking?')) return;
        try {
          await api.deleteService(serviceId);
          navigate(backHash);
        } catch (err) {
          alert('Failed to delete.');
        }
      });
    }

    root.querySelector('#cancel-btn')?.addEventListener('click', () => navigate(backHash));

    root.querySelector('#service-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        quote_id: quoteId || service.quote_id,
        service_date: fd.get('service_date'),
        service_time: serviceTimeTo24(fd.get('service_time_hour'), fd.get('service_time_min'), fd.get('service_time_ampm')),
        type: fd.get('type'),
        price: fd.get('price'),
        notes: fd.get('notes'),
        completed: fd.get('completed') ? 1 : 0,
        paid: fd.get('paid') ? 1 : 0,
        amount_paid: fd.get('amount_paid'),
        duration_minutes: fd.get('duration_minutes'),
      };
      try {
        if (isEdit) await api.updateService(serviceId, payload);
        else await api.createService(payload);
        navigate(backHash);
      } catch (err) {
        alert('Failed to save.');
        console.error(err);
      }
    });
  },
  unmount() {},
};

function renderQuoteRef(data) {
  if (!data.outside_price && !data.inside_price && !data.both_price) return '';
  const pills = [];
  if (data.outside_price != null) pills.push(pill('Outside', data.outside_price));
  if (data.inside_price != null) pills.push(pill('Inside', data.inside_price));
  if (data.both_price != null) pills.push(pill('Both', data.both_price));
  return `<div class="quote-ref">
    <div class="quote-ref-label">Quote Prices — tap to use</div>
    <div class="quote-ref-prices">${pills.join('')}</div>
  </div>`;
}

function pill(label, price) {
  const p = fmtPrice(price);
  return `<div class="qrp tap" data-price="${p}"><div class="lbl">${label}</div><div class="val">$${p}</div></div>`;
}

function renderCompletionSection(service) {
  return `<div class="completion-section">
    <h3>Completion</h3>
    <div class="toggle-row">
      <span class="toggle-label">Mark as Complete</span>
      <label class="toggle-switch">
        <input type="checkbox" name="completed" id="completedToggle" value="1" ${service.completed ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="payment-fields" id="paymentFields" style="${service.completed ? '' : 'display:none'}">
      <label class="field-label">Minutes</label>
      <input class="input" type="number" name="duration_minutes" value="${service.duration_minutes || ''}">
      <div class="toggle-row">
        <span class="toggle-label">Paid</span>
        <label class="toggle-switch">
          <input type="checkbox" name="paid" id="paidToggle" value="1" ${service.paid ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="amountPaidField" style="${service.paid ? '' : 'display:none'}">
        <label class="field-label">Amount Paid ($)</label>
        <input class="input" type="number" name="amount_paid" step="0.01" value="${service.amount_paid || ''}">
      </div>
    </div>
  </div>`;
}

function hourOptions(selected) {
  let html = '';
  for (let h = 1; h <= 12; h++) {
    const v = String(h).padStart(2, '0');
    html += `<option value="${v}" ${v === selected ? 'selected' : ''}>${h}</option>`;
  }
  return html;
}

function minOptions(selected) {
  return ['00', '15', '30', '45'].map((m) =>
    `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`
  ).join('');
}
