import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { FormField, chipField, optionChipGroup } from '../components/form.js';
import { Button } from '../components/button.js';
import { LoadingState } from '../components/loading-state.js';
import { TapPricePanel } from '../components/pills.js';
import { escapeHtml, capitalize } from '../components/dom.js';
import { todayISO, bindRadioGroup, parseTime24, serviceTimeTo24 } from '../utils.js';

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
        if (!service) return navigate('#/bookings');
      } else {
        quote = await api.getQuote(quoteId);
        if (!quote) return navigate('#/quotes');
      }
    } catch (err) {
      console.error(err);
      return navigate('#/bookings');
    }

    const data = service || quote;
    const t = parseTime24(service?.service_time || '');
    const backHash = '#/bookings';

    const form = document.createElement('form');
    form.id = 'service-form';
    if (!isEdit) form.append(hidden('quote_id', quote.id));

    const timeWrap = document.createElement('div');
    timeWrap.className = 'form-group';
    timeWrap.innerHTML = `<label class="field-label">Time</label><div class="time-row">
      <select class="input" name="service_time_hour">${hours(t.hour)}</select>
      <select class="input" name="service_time_min">${mins(t.min)}</select>
      <select class="input" name="service_time_ampm">
        <option value="AM" ${t.ampm === 'AM' ? 'selected' : ''}>AM</option>
        <option value="PM" ${t.ampm === 'PM' ? 'selected' : ''}>PM</option>
      </select></div>`;

    form.append(
      FormField({ label: 'Date', name: 'service_date', type: 'date', value: service?.service_date || todayISO(), required: true }),
      timeWrap,
      chipField('Service Type', optionChipGroup({ name: 'type', options: SERVICE_TYPES.map((v) => ({ value: v, label: capitalize(v) })), selected: service?.type || 'outside' })),
      FormField({ label: 'Price ($)', name: 'price', type: 'number', value: service?.price ?? '', attrs: { id: 'priceInput', step: '0.01' } }),
      FormField({ label: 'Notes', name: 'notes', type: 'textarea', value: service?.notes }),
    );
    if (isEdit) form.append(completionBlock(service));

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.append(
      Button({ label: isEdit ? 'Save Changes' : 'Confirm Booking', type: 'submit' }),
      ...(isEdit ? [Button({ label: 'Delete Booking', type: 'button', variant: 'danger', attrs: { id: 'delete-svc' } })] : []),
      Button({ label: 'Cancel', type: 'button', variant: 'link', attrs: { id: 'cancel-btn' } }),
    );
    form.append(actions);

    content.innerHTML = '';
    const cardBody = document.createDocumentFragment();
    if (isEdit) {
      const link = document.createElement('a');
      link.className = 'address-link';
      link.href = `https://maps.apple.com/?q=${encodeURIComponent(data.address || '')}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = `📍 ${data.address || ''}`;
      cardBody.appendChild(link);
    } else {
      const ro = document.createElement('div');
      ro.className = 'address-readonly';
      ro.textContent = data.address || '';
      cardBody.appendChild(ro);
    }
    const ref = document.createElement('div');
    ref.className = 'text-subtle';
    ref.textContent = `${data.customer || ''}${data.phone ? ` · ${data.phone}` : ''}`;
    cardBody.append(ref, pricePanel(data), form);
    content.appendChild(Card({ header: `<h2>${isEdit ? 'Edit Booking' : 'Book Service'}</h2>`, body: cardBody }));

    bindRadioGroup(root);
    bindPriceTaps(root);
    if (isEdit) bindCompletionToggles(root);

    root.querySelector('#cancel-btn')?.addEventListener('click', () => navigate(backHash));
    root.querySelector('#delete-svc')?.addEventListener('click', async () => {
      if (!confirm('Delete this booking?')) return;
      await api.deleteService(serviceId);
      navigate(backHash);
    });

    form.addEventListener('submit', async (e) => {
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

function hidden(name, value) {
  const i = document.createElement('input');
  i.type = 'hidden';
  i.name = name;
  i.value = value;
  return i;
}

function pricePanel(data) {
  const items = [];
  if (data.outside_price != null) items.push({ label: 'Outside', price: data.outside_price });
  if (data.inside_price != null) items.push({ label: 'Inside', price: data.inside_price });
  if (data.both_price != null) items.push({ label: 'Both', price: data.both_price });
  return items.length ? TapPricePanel(items) : document.createDocumentFragment();
}

function completionBlock(service) {
  const wrap = document.createElement('div');
  wrap.className = 'panel--success';
  wrap.innerHTML = `<h3>Completion</h3>
    <div class="toggle-row"><span class="toggle-label">Mark as Complete</span>
      <label class="toggle-switch"><input type="checkbox" name="completed" id="completedToggle" value="1" ${service.completed ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
    <div id="paymentFields" ${service.completed ? '' : 'hidden'}>
      <label class="field-label">Minutes</label><input class="input" type="number" name="duration_minutes" value="${service.duration_minutes || ''}">
      <div class="toggle-row"><span class="toggle-label">Paid</span>
        <label class="toggle-switch"><input type="checkbox" name="paid" id="paidToggle" value="1" ${service.paid ? 'checked' : ''}><span class="toggle-slider"></span></label></div>
      <div id="amountPaidField" ${service.paid ? '' : 'hidden'}>
        <label class="field-label">Amount Paid ($)</label><input class="input" type="number" name="amount_paid" step="0.01" value="${service.amount_paid || ''}">
      </div></div>`;
  return wrap;
}

function bindPriceTaps(root) {
  root.querySelectorAll('.pill--tap').forEach((el) => {
    el.addEventListener('click', () => {
      root.querySelector('#priceInput').value = el.dataset.price;
      root.querySelector('#priceInput').focus();
    });
  });
}

function bindCompletionToggles(root) {
  const completed = root.querySelector('#completedToggle');
  const paid = root.querySelector('#paidToggle');
  completed?.addEventListener('change', () => { root.querySelector('#paymentFields').hidden = !completed.checked; });
  paid?.addEventListener('change', () => { root.querySelector('#amountPaidField').hidden = !paid.checked; });
}

function hours(selected) {
  return Array.from({ length: 12 }, (_, i) => {
    const v = String(i + 1).padStart(2, '0');
    return `<option value="${v}" ${v === selected ? 'selected' : ''}>${i + 1}</option>`;
  }).join('');
}

function mins(selected) {
  return ['00', '15', '30', '45'].map((m) => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
}
