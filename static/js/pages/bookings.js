import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { fmtPrice, time12, fmtPhone, fmtDate, phoneDigits, handlePhone } from '../utils.js';

let servicesRaw = [];
let byDate = {};
let activeDate = null;
let todayStr = '';
let monthViewActive = false;
let activeMonth = null; // { year, month } for month view
const today = new Date();

export const bookingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'bookings');
    today.setHours(0, 0, 0, 0);
    todayStr = today.toISOString().slice(0, 10);
    activeDate = todayStr;
    activeMonth = { year: today.getFullYear(), month: today.getMonth() };

    root.innerHTML = `
      <div class="container bookings-page">
        <div class="cal-strip-wrap">
          
          <div class="cal-header-row">
            <div class="cal-strip" id="calStrip"></div>
          </div>
          <div class="cal-month-view" id="calMonthView" style="display:none;"></div>
        </div>
        <button type="button" class="month-toggle-btn" id="monthToggleBtn" title="Month view">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        <h2 style="margin-top:0;">Bookings</h2>
        <div id="bookingsList">Loading…</div>
      </div>`;

    root.querySelector('#monthToggleBtn').addEventListener('click', () => {
      monthViewActive = !monthViewActive;
      toggleCalView(root, navigate);
    });

    try {
      servicesRaw = await api.getBookings() || [];
      rebuildByDate();
      buildStrip(root, navigate);
      renderBookings(root, navigate);
      setupSwipe(root, navigate);
    } catch (err) {
      root.querySelector('#bookingsList').innerHTML = '<p class="empty-msg">Failed to load bookings.</p>';
      console.error(err);
    }
  },
  unmount() {
    servicesRaw = [];
    byDate = {};
    monthViewActive = false;
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

// ─── Calendar strip ───────────────────────────────────────────────────────────

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

// ─── Month view ───────────────────────────────────────────────────────────────

function buildMonthView(root, navigate) {
  const container = root.querySelector('#calMonthView');
  container.innerHTML = '';

  const { year, month } = activeMonth;
  const DOW_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Header with prev/next month arrows
  const header = document.createElement('div');
  header.className = 'month-header';
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  header.innerHTML = `
    <button type="button" class="month-nav-btn" id="mvPrev">&#8249;</button>
    <span class="month-label">${monthName}</span>
    <button type="button" class="month-nav-btn" id="mvNext">&#8250;</button>`;
  container.appendChild(header);

  header.querySelector('#mvPrev').addEventListener('click', () => {
    let m = activeMonth.month - 1;
    let y = activeMonth.year;
    if (m < 0) { m = 11; y--; }
    activeMonth = { year: y, month: m };
    buildMonthView(root, navigate);
  });
  header.querySelector('#mvNext').addEventListener('click', () => {
    let m = activeMonth.month + 1;
    let y = activeMonth.year;
    if (m > 11) { m = 0; y++; }
    activeMonth = { year: y, month: m };
    buildMonthView(root, navigate);
  });

  // Day-of-week labels
  const dowRow = document.createElement('div');
  dowRow.className = 'month-dow-row';
  DOW_SHORT.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'month-dow-label';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  container.appendChild(dowRow);

  // Day grid
  const grid = document.createElement('div');
  grid.className = 'month-grid';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'month-day month-day--empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = ds === todayStr;
    const isActive = ds === activeDate;
    const hasBookings = !!byDate[ds];

    const cell = document.createElement('div');
    cell.className = 'month-day' +
      (isToday ? ' month-day--today' : '') +
      (isActive ? ' month-day--active' : '');
    cell.innerHTML = `
      <span class="month-day-num">${d}</span>
      ${hasBookings ? '<span class="month-dot"></span>' : ''}`;

    cell.addEventListener('click', () => {
      // Switch to strip/day view focused on this date
      activeDate = ds;
      activeMonth = { year, month };
      monthViewActive = false;
      toggleCalView(root, navigate);
      buildStrip(root, navigate);
      renderBookings(root, navigate);
    });

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

// ─── Toggle between strip and month view ─────────────────────────────────────

function toggleCalView(root, navigate) {
  const strip = root.querySelector('#calStrip');
  const monthView = root.querySelector('#calMonthView');
  const btn = root.querySelector('#monthToggleBtn');

  if (monthViewActive) {
    // Sync activeMonth to wherever activeDate currently is
    if (activeDate) {
      const d = new Date(activeDate);
      activeMonth = { year: d.getFullYear(), month: d.getMonth() };
    }
    strip.style.display = 'none';
    monthView.style.display = '';
    buildMonthView(root, navigate);
    btn.classList.add('month-toggle-btn--active');
  } else {
    strip.style.display = '';
    monthView.style.display = 'none';
    buildStrip(root, navigate);
    btn.classList.remove('month-toggle-btn--active');
  }
}

// ─── Bookings list with animated transition ───────────────────────────────────

/**
 * direction: 'left' | 'right' | null
 * When direction is given the current list slides out, then the new content
 * slides in from the opposite side.  When null the list re-renders instantly
 * (used for non-swipe updates like tapping the strip).
 */
function renderBookings(root, navigate, direction = null) {
  const list = root.querySelector('#bookingsList');

  const doRender = () => {
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
  };

  if (!direction) {
    doRender();
    return;
  }

  // Slide current content out
  const exitDir = direction === 'left' ? '-100%' : '100%';
  const enterDir = direction === 'left' ? '100%' : '-100%';

  list.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
  list.style.transform = `translateX(${exitDir})`;
  list.style.opacity = '0';

  const afterExit = () => {
    list.removeEventListener('transitionend', afterExit);
    // Snap to enter position (no transition)
    list.style.transition = 'none';
    list.style.transform = `translateX(${enterDir})`;
    list.style.opacity = '0';

    doRender();

    // Force reflow so the browser registers the starting position
    // eslint-disable-next-line no-unused-expressions
    list.offsetHeight;

    // Slide in
    list.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease';
    list.style.transform = 'translateX(0)';
    list.style.opacity = '1';
  };

  list.addEventListener('transitionend', afterExit, { once: true });
}

// ─── Booking card ─────────────────────────────────────────────────────────────

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

// ─── Complete sheet ───────────────────────────────────────────────────────────

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

// ─── Swipe ────────────────────────────────────────────────────────────────────

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

    const direction = dx < 0 ? 'left' : 'right';
    const base = activeDate || todayStr;
    const d = new Date(base);
    d.setDate(d.getDate() + (direction === 'left' ? 1 : -1));
    activeDate = d.toISOString().slice(0, 10);

    buildStrip(root, navigate);
    renderBookings(root, navigate, direction);
  }, { passive: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}