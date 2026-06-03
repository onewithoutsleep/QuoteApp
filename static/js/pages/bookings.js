import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { fmtPrice, time12, fmtPhone, fmtDate, phoneDigits, handlePhone } from '../utils.js';

let servicesRaw = [];
let byDate = {};
let activeDate = null;
let todayStr = '';
const today = new Date();

export const bookingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'bookings');
    today.setHours(0, 0, 0, 0);
    todayStr = today.toISOString().slice(0, 10);
    activeDate = todayStr;

    root.innerHTML = `
      <div class="container bookings-page">
        <div class="cal-strip-wrap">
          <div class="cal-strip" id="calStrip"></div>
        </div>
        <h2 style="margin-top:0;">Bookings</h2>
        <div id="bookingsList">Loading…</div>
      </div>`;

    try {
      servicesRaw = await api.getBookings() || [];
      rebuildByDate();
      buildStrip(root, navigate);
      renderBookings(root, navigate);
      setupSwipe(root, navigate)
    } catch (err) {
      root.querySelector('#bookingsList').innerHTML = '<p class="empty-msg">Failed to load bookings.</p>';
      console.error(err);
    }
  },
  unmount() {
    servicesRaw = [];
    byDate = {};
  },
};

function rebuildByDate() {
  byDate = {};
  servicesRaw.forEach((s) => {
    const d = s.service_date || 'no-date';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  });
}

function buildStrip(root, navigate) {
  const strip = root.querySelector('#calStrip');
  strip.innerHTML = '';
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  for (let i = -30; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const el = document.createElement('div');
    el.className = 'cal-day' + (ds === todayStr ? ' today' : '') + (ds === activeDate ? ' active' : '');
    el.dataset.date = ds;
    const hasBookings = !!byDate[ds];
    el.innerHTML = `
      <div class="dow">${DOW[d.getDay()]}</div>
      <div class="dom">${d.getDate()}</div>
      ${hasBookings ? '<div class="dot"></div>' : '<div class="cal-spacer"></div>'}`;
    el.addEventListener('click', () => {
      activeDate = activeDate === ds ? null : ds;
      buildStrip(root, navigate);
      renderBookings(root, navigate);
    });
    strip.appendChild(el);
  }
  const scrollTarget = strip.querySelector(`[data-date="${activeDate || todayStr}"]`);
  if (scrollTarget) setTimeout(() => scrollTarget.scrollIntoView({ inline: 'center', behavior: 'smooth' }), 50);
}

function renderBookings(root, navigate) {
  const list = root.querySelector('#bookingsList');
  let datesToShow;
  if (activeDate) {
    datesToShow = [activeDate];
  } else {
    datesToShow = Object.keys(byDate).filter((d) => d !== 'no-date').sort();
    if (byDate['no-date']) datesToShow.push('no-date');
  }

  if (!datesToShow.length) {
    list.innerHTML = '<div class="no-bookings-day">No bookings yet.</div>';
    return;
  }

  list.innerHTML = '';
  datesToShow.forEach((ds) => {
    const items = byDate[ds] || [];
    if (!items.length) {
      if (activeDate) list.innerHTML = '<div class="no-bookings-day">No bookings on this day.</div>';
      return;
    }
    const group = document.createElement('div');
    group.className = 'booking-date-group';
    group.innerHTML = `<div class="booking-date-header">${ds === 'no-date' ? 'No Date' : fmtDate(ds)}</div>`;
    items.forEach((s) => group.appendChild(buildBookingCard(s, navigate)));
    list.appendChild(group);
  });
}

function buildBookingCard(s, navigate) {
  const card = document.createElement('div');
  card.className = 'booking-card';
  const price = s.price != null ? fmtPrice(s.price) : null;
  const amtPaid = s.amount_paid != null ? fmtPrice(s.amount_paid) : null;
  const fPhone = fmtPhone(s.phone);
  const digits = phoneDigits(s.phone);
  const mapsUrl = s.address ? `https://maps.apple.com/?q=${encodeURIComponent(s.address)}` : '#';
  const doneClass = s.completed ? 'is-done' : 'not-done';
  const doneLabel = s.completed ? 'Done' : 'Mark Done';

  card.innerHTML = `
    <div class="booking-row">
      <div class="booking-info">
        <div class="booking-customer">
          ${s.service_time ? `<span class="bk-badge bk-time">${time12(s.service_time)}</span>` : ''}
          ${escapeHtml(s.customer || '')}
        </div>
        <a class="booking-address" href="${mapsUrl}" target="_blank" rel="noopener">${escapeHtml(s.address || '')}</a>
        ${fPhone ? `<a class="booking-phone" href="tel:${digits}">${fPhone}</a>` : ''}
        <div class="booking-meta" style="margin-top:4px;">
          ${s.type ? `<span class="bk-badge bk-type">${capitalize(s.type)}</span>` : ''}
          ${s.windows ? `<span class="bk-badge bk-muted">${s.windows} windows</span>` : ''}
          ${s.completed && !s.paid ? '<span class="bk-badge bk-unpaid">Unpaid</span>' : ''}
          ${s.paid && amtPaid ? `<span class="bk-paid">Paid $${amtPaid}</span>` : ''}
          ${s.completed && s.duration_minutes ? `<span class="bk-badge bk-duration">${s.duration_minutes} min</span>` : ''}
        </div>
        ${s.notes ? `<div class="booking-notes">${escapeHtml(s.notes)}</div>` : ''}
      </div>
      <div class="booking-actions">
        ${price ? `<div class="booking-price">$${price}</div>` : ''}
        <button type="button" class="complete-btn ${doneClass}">${doneLabel}</button>
        <button type="button" class="edit-link edit-link--map" title="Show on map">📍</button>
        <button type="button" class="edit-link" title="Edit">✎</button>
      </div>
    </div>`;

  const phoneEl = card.querySelector('.booking-phone');
  if (phoneEl) {
    phoneEl.addEventListener('click', (e) => handlePhone(e, s.phone, digits));
  }
  card.querySelector('.booking-address')?.addEventListener('click', (e) => e.stopPropagation());
  card.querySelector('.complete-btn')?.addEventListener('click', () => openCompleteSheet(s));
  card.querySelector('.edit-link--map')?.addEventListener('click', () => navigate(`#/map?highlight=${s.house_id || ''}`));
  card.querySelector('.edit-link:not(.edit-link--map)')?.addEventListener('click', () => navigate(`#/service/${s.id}/edit`));

  return card;
}

function openCompleteSheet(svc) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  const isComplete = !!svc.completed;
  const isPaid = !!svc.paid;
  sheet.innerHTML = `
    <div class="sheet-body">
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
      <button type="button" class="sheet-cancel-btn">Cancel</button>
    </div>`;

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

  sheet.querySelector('.sheet-cancel-btn')?.addEventListener('click', () => sheet.remove());
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.remove(); });

  sheet.querySelector('.sheet-save-btn')?.addEventListener('click', async () => {
    const form = new FormData();
    form.append('completed', completedEl.checked ? '1' : '0');
    form.append('paid', paidEl?.checked ? '1' : '0');
    form.append('amount_paid', sheet.querySelector('#sAmtPaid')?.value || '');
    form.append('duration_minutes', sheet.querySelector('#sDuration')?.value || '');
    try {
      await api.completeService(svc.id, form);
      servicesRaw.forEach((s) => {
        if (s.id === svc.id) {
          s.completed = completedEl.checked ? 1 : 0;
          s.paid = paidEl?.checked ? 1 : 0;
          s.amount_paid = form.get('amount_paid') ? parseFloat(form.get('amount_paid')) : null;
          s.duration_minutes = form.get('duration_minutes') ? parseInt(form.get('duration_minutes'), 10) : null;
        }
      });
      rebuildByDate();
      sheet.remove();
      const root = document.querySelector('.bookings-page')?.closest('#page-root');
      if (root) {
        buildStrip(root, (h) => { location.hash = h; });
        renderBookings(root, (h) => { location.hash = h; });
      }
    } catch {
      alert('Error saving. Please try again.');
    }
  });

  document.body.appendChild(sheet);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Add this function
function setupSwipe(root, navigate) {
  let startX = 0;
  let startY = 0;

  root.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  root.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Ignore mostly-vertical swipes (scrolling)
    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;

    // Only act if a date is active; fall back to today
    const base = activeDate || todayStr;
    const d = new Date(base);
    d.setDate(d.getDate() + (dx < 0 ? 1 : -1));
    activeDate = d.toISOString().slice(0, 10);

    buildStrip(root, navigate);
    renderBookings(root, navigate);
  }, { passive: true });
}