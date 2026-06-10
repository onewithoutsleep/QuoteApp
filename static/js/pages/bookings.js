import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { fmtPrice, time12, fmtPhone, fmtDate, phoneDigits, handlePhone } from '../utils.js';

// ─── STATE MANAGEMENT ────────────────────────────────────────────────────────
const state = {
  servicesRaw: [],
  byDate: {},
  activeDate: null,
  todayStr: '',
  monthViewActive: false,
  activeMonth: null, // { year, month }
};

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────
export const bookingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'bookings');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    state.todayStr = today.toISOString().slice(0, 10);
    state.activeDate = state.todayStr;
    state.activeMonth = { year: today.getFullYear(), month: today.getMonth() };

    // Initial Shell Layout
    root.innerHTML = BaseLayout();

    // Event Listeners
    root.querySelector('#monthToggleBtn').addEventListener('click', () => {
      state.monthViewActive = !state.monthViewActive;
      toggleCalView(root, navigate);
    });

    try {
      state.servicesRaw = await api.getBookings() || [];
      rebuildDataMappings();
      renderCalendarStrip(root, navigate);
      renderBookingsList(root, navigate);
      setupSwipeGestures(root, navigate);
    } catch (err) {
      root.querySelector('#bookingsList').innerHTML = EmptyState('Failed to load bookings. Please try again.');
      console.error(err);
    }
  },
  unmount() {
    state.servicesRaw = [];
    state.byDate = {};
    state.monthViewActive = false;
  },
};

function rebuildDataMappings() {
  state.byDate = {};
  state.servicesRaw.forEach((s) => {
    const d = s.service_date || 'no-date';
    if (!state.byDate[d]) state.byDate[d] = [];
    state.byDate[d].push(s);
  });
}

// ─── MAIN STRUCTURAL LAYOUTS ─────────────────────────────────────────────────

function BaseLayout() {
  return `
    <div class="container bookings-page">
      <div class="cal-strip-wrap">
        <div class="cal-header-row">
          <div class="cal-strip" id="calStrip"></div>
          <button type="button" class="month-toggle-btn" id="monthToggleBtn" title="Toggle Month View">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
        </div>
        <div class="cal-month-view" id="calMonthView" style="display:none;"></div>
      </div>
      <h2>Bookings</h2>
      <div id="bookingsList">
        <div class="empty-state"><p>Loading...</p></div>
      </div>
    </div>
  `;
}

// ─── REUSABLE UI SUB-COMPONENTS ──────────────────────────────────────────────

function BookingCard(s, navigate) {
  const card = document.createElement('div');
  card.className = 'booking-card';
  
  const price = s.price != null ? fmtPrice(s.price) : null;
  const amtPaid = s.amount_paid != null ? fmtPrice(s.amount_paid) : null;
  const fPhone = fmtPhone(s.phone);
  const digits = phoneDigits(s.phone);
  const mapsUrl = s.address ? `https://maps.apple.com/?q=${encodeURIComponent(s.address)}` : '#';
  const isDone = s.completed;

  card.innerHTML = `
    <div class="booking-row">
      <div class="booking-info">
        <div class="booking-customer-row">
          ${s.service_time ? `<span class="booking-time">${time12(s.service_time)}</span>` : ''}
          <div class="booking-customer">${escapeHtml(s.customer || 'Unknown Customer')}</div>
        </div>
        
        <a class="booking-address" href="${mapsUrl}" target="_blank" rel="noopener">
          ${escapeHtml(s.address || 'No address provided')}
        </a>
        ${fPhone ? `<a class="booking-phone" href="tel:${digits}">${fPhone}</a>` : ''}
        
        <div class="booking-meta">
          ${s.type ? `<span class="bk-badge bk-type">${capitalize(s.type)}</span>` : ''}
          ${s.windows ? `<span class="bk-badge bk-type">${s.windows} Windows</span>` : ''}
          ${isDone && !s.paid ? '<span class="bk-badge bk-unpaid">Pending Payment</span>' : ''}
          ${s.paid && amtPaid ? `<span class="bk-paid">Paid $${amtPaid}</span>` : ''}
          ${s.completed && s.duration_minutes ? `<span class="bk-badge bk-duration">${s.duration_minutes} min</span>` : ''}
        </div>
        
        ${s.notes ? `<div class="booking-notes">"${escapeHtml(s.notes)}"</div>` : ''}
      </div>
      
      <div class="booking-actions">
        ${price ? `<div class="booking-price">$${price}</div>` : ''}
        <button type="button" class="complete-btn ${isDone ? 'is-done' : 'not-done'}">
          ${isDone ? 'Completed' : 'Mark Done'}
        </button>
        <div class="action-buttons">
          <button type="button" class="icon-btn edit-link--map" title="Show on Map">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </button>
          <button type="button" class="icon-btn edit-link" title="Edit Booking">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const phoneEl = card.querySelector('.booking-phone');
  if (phoneEl) phoneEl.addEventListener('click', (e) => handlePhone(e, s.phone, digits));
  
  card.querySelector('.booking-address')?.addEventListener('click', (e) => e.stopPropagation());
  card.querySelector('.complete-btn')?.addEventListener('click', () => openCompleteSheet(s));
  card.querySelector('.edit-link--map')?.addEventListener('click', () => navigate(`#/map?highlight=${s.house_id || ''}`));
  card.querySelector('.edit-link')?.addEventListener('click', () => navigate(`#/service/${s.id}/edit`));

  return card;
}

function EmptyState(message) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <p>${message}</p>
    </div>`;
}

// ─── RENDERING & SYSTEM LOGIC ────────────────────────────────────────────────

function renderCalendarStrip(root, navigate) {
  const strip = root.querySelector('#calStrip');
  strip.innerHTML = '';
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const today = new Date(state.todayStr + 'T00:00:00');
  
  for (let i = -30; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const hasBookings = !!state.byDate[ds];
    
    const el = document.createElement('div');
    el.className = `cal-day ${ds === state.todayStr ? 'today' : ''} ${ds === state.activeDate ? 'active' : ''}`;
    el.dataset.date = ds;
    
    el.innerHTML = `
      <div class="dow">${DOW[d.getDay()]}</div>
      <div class="dom">${d.getDate()}</div>
      ${hasBookings ? '<div class="dot"></div>' : '<div class="cal-spacer"></div>'}
    `;
    
    el.addEventListener('click', () => {
      state.activeDate = state.activeDate === ds ? null : ds;
      renderCalendarStrip(root, navigate);
      renderBookingsList(root, navigate);
    });
    
    strip.appendChild(el);
  }

  // FIXED: Precise horizontal-only scroll handling to eliminate vertical alignment jumps
  const scrollTarget = strip.querySelector(`[data-date="${state.activeDate || state.todayStr}"]`);
  if (scrollTarget) {
    setTimeout(() => {
      const leftOffset = scrollTarget.offsetLeft - (strip.clientWidth / 2) + (scrollTarget.clientWidth / 2);
      strip.scrollTo({ left: leftOffset, behavior: 'smooth' });
    }, 50);
  }
}

function renderMonthView(root, navigate) {
  const container = root.querySelector('#calMonthView');
  container.innerHTML = '';

  const { year, month } = state.activeMonth;
  const DOW_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const header = document.createElement('div');
  header.className = 'month-header';
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  header.innerHTML = `
    <button type="button" class="month-nav-btn" id="mvPrev">&#8249;</button>
    <span class="month-label">${monthName}</span>
    <button type="button" class="month-nav-btn" id="mvNext">&#8250;</button>`;
  container.appendChild(header);

  header.querySelector('#mvPrev').addEventListener('click', () => {
    let m = state.activeMonth.month - 1;
    let y = state.activeMonth.year;
    if (m < 0) { m = 11; y--; }
    state.activeMonth = { year: y, month: m };
    renderMonthView(root, navigate);
  });
  header.querySelector('#mvNext').addEventListener('click', () => {
    let m = state.activeMonth.month + 1;
    let y = state.activeMonth.year;
    if (m > 11) { m = 0; y++; }
    state.activeMonth = { year: y, month: m };
    renderMonthView(root, navigate);
  });

  const dowRow = document.createElement('div');
  dowRow.className = 'month-dow-row';
  DOW_SHORT.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'month-dow-label';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  container.appendChild(dowRow);

  const grid = document.createElement('div');
  grid.className = 'month-grid';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'month-day month-day--empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = ds === state.todayStr;
    const isActive = ds === state.activeDate;
    const hasBookings = !!state.byDate[ds];

    const cell = document.createElement('div');
    cell.className = `month-day ${isToday ? 'month-day--today' : ''} ${isActive ? 'month-day--active' : ''}`;
    cell.innerHTML = `
      <span class="month-day-num">${d}</span>
      ${hasBookings ? '<span class="month-dot"></span>' : ''}`;

    cell.addEventListener('click', () => {
      state.activeDate = ds;
      state.monthViewActive = false;
      toggleCalView(root, navigate);
    });

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

function toggleCalView(root, navigate) {
  const strip = root.querySelector('#calStrip');
  const monthView = root.querySelector('#calMonthView');
  const btn = root.querySelector('#monthToggleBtn');

  if (state.monthViewActive) {
    if (state.activeDate) {
      const d = new Date(state.activeDate + 'T00:00:00');
      state.activeMonth = { year: d.getFullYear(), month: d.getMonth() };
    }
    strip.style.display = 'none';
    monthView.style.display = '';
    renderMonthView(root, navigate);
    btn.classList.add('month-toggle-btn--active');
  } else {
    strip.style.display = '';
    monthView.style.display = 'none';
    renderCalendarStrip(root, navigate);
    renderBookingsList(root, navigate);
    btn.classList.remove('month-toggle-btn--active');
  }
}

function renderBookingsList(root, navigate, direction = null) {
  const list = root.querySelector('#bookingsList');

  const doRender = () => {
    let datesToShow = state.activeDate ? [state.activeDate] : Object.keys(state.byDate).filter(d => d !== 'no-date').sort();
    if (!state.activeDate && state.byDate['no-date']) datesToShow.push('no-date');

    if (!datesToShow.length) {
      list.innerHTML = EmptyState('No bookings scheduled yet.');
      return;
    }

    list.innerHTML = '';
    let foundAny = false;

    datesToShow.forEach((ds) => {
      const items = state.byDate[ds] || [];
      if (!items.length) return;
      
      foundAny = true;
      const group = document.createElement('div');
      group.className = 'booking-date-group';
      group.innerHTML = `<div class="booking-date-header">${ds === 'no-date' ? 'Unscheduled' : fmtDate(ds)}</div>`;
      
      items.forEach((s) => group.appendChild(BookingCard(s, navigate)));
      list.appendChild(group);
    });

    if (!foundAny && state.activeDate) {
      list.innerHTML = EmptyState('No bookings scheduled on this day.');
    }
  };

  if (!direction) {
    doRender();
    return;
  }

  const exitDir = direction === 'left' ? '-15px' : '15px';
  const enterDir = direction === 'left' ? '15px' : '-15px';

  list.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
  list.style.transform = `translateX(${exitDir})`;
  list.style.opacity = '0';

  list.addEventListener('transitionend', function afterExit() {
    list.removeEventListener('transitionend', afterExit);
    list.style.transition = 'none';
    list.style.transform = `translateX(${enterDir})`;
    
    doRender();
    list.offsetHeight; // Force Layout System layout recalculation
    
    list.style.transition = 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
    list.style.transform = 'translateX(0)';
    list.style.opacity = '1';
  }, { once: true });
}

// ─── SWIPE GESTURES MODULE ───────────────────────────────────────────────────

function setupSwipeGestures(root, navigate) {
  let startX = 0, startY = 0;

  root.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  root.addEventListener('touchend', (e) => {
    // block gesture calculation if month view is deployed
    if (state.monthViewActive) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;

    const direction = dx < 0 ? 'left' : 'right';
    const base = state.activeDate || state.todayStr;
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + (direction === 'left' ? 1 : -1));
    
    state.activeDate = d.toISOString().slice(0, 10);
    renderCalendarStrip(root, navigate);
    renderBookingsList(root, navigate, direction);
  }, { passive: true });
}

// ─── BOTTOM DETACHED SHEET VIEW ──────────────────────────────────────────────

function openCompleteSheet(svc) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  const isComplete = !!svc.completed;
  const isPaid = !!svc.paid;
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-title">${escapeHtml(svc.customer || 'Unknown Customer')}</div>
      <div class="sheet-address">${escapeHtml(svc.address || 'No Address Listed')}</div>
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
      <button type="button" class="sheet-save-btn">Save Changes</button>
      <button type="button" class="sheet-cancel-btn">Cancel</button>
    </div>`;

  const completedEl = sheet.querySelector('#sCompleted');
  const paySec = sheet.querySelector('#sPaySection');
  const paidEl = sheet.querySelector('#sPaid');
  const amtSec = sheet.querySelector('#sAmtSection');

  completedEl?.addEventListener('change', () => { paySec.style.display = completedEl.checked ? '' : 'none'; });
  paidEl?.addEventListener('change', () => { amtSec.style.display = paidEl.checked ? '' : 'none'; });

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
      state.servicesRaw.forEach((s) => {
        if (s.id === svc.id) {
          s.completed = completedEl.checked ? 1 : 0;
          s.paid = paidEl?.checked ? 1 : 0;
          s.amount_paid = form.get('amount_paid') ? parseFloat(form.get('amount_paid')) : null;
          s.duration_hours = form.get('duration_hours') ? parseFloat(form.get('duration_hours'), 10) : null;
        }
      });
      rebuildDataMappings();
      sheet.remove();
      
      const root = document.querySelector('.bookings-page')?.closest('#page-root');
      if (root) {
        renderCalendarStrip(root, (h) => { location.hash = h; });
        renderBookingsList(root, (h) => { location.hash = h; });
      }
    } catch {
      alert('Error saving metrics. Please try again.');
    }
  });

  document.body.appendChild(sheet);
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}