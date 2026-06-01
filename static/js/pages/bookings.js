import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { PageHeader } from '../components/page-header.js';
import { EmptyState } from '../components/empty-state.js';
import { LoadingState } from '../components/loading-state.js';
import { BookingCard } from '../components/booking-card.js';
import { fmtDate } from '../utils.js';

let servicesRaw = [];
let byDate = {};
let activeDate = null;
let todayStr = '';
let pageNavigate = null;
const today = new Date();

export const bookingsPage = {
  async mount({ root, slots, navigate }) {
    pageNavigate = navigate;
    renderNav(slots.nav, 'bookings');
    today.setHours(0, 0, 0, 0);
    todayStr = today.toISOString().slice(0, 10);
    activeDate = todayStr;

    const { page, content } = createPage({ className: 'bookings-page' });
    const calWrap = document.createElement('div');
    calWrap.className = 'cal-strip-wrap';
    calWrap.innerHTML = '<div class="cal-strip" id="calStrip"></div>';
    const header = PageHeader({ title: 'Bookings', tag: 'h2' });
    header.classList.add('no-margin-top');
    const list = document.createElement('div');
    list.className = 'page-list';
    list.appendChild(LoadingState());
    content.append(calWrap, header, list);
    mountPage(root, page);

    try {
      servicesRaw = await api.getBookings() || [];
      rebuildByDate();
      buildStrip(root);
      renderBookings(list);
    } catch (err) {
      list.innerHTML = '';
      list.appendChild(EmptyState('Failed to load bookings.'));
      console.error(err);
    }
  },
  unmount() {
    servicesRaw = [];
    byDate = {};
    pageNavigate = null;
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

function buildStrip(root) {
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
    el.innerHTML = `
      <div class="dow">${DOW[d.getDay()]}</div>
      <div class="dom">${d.getDate()}</div>
      ${byDate[ds] ? '<div class="dot"></div>' : '<div class="cal-spacer"></div>'}`;
    el.addEventListener('click', () => {
      activeDate = activeDate === ds ? null : ds;
      buildStrip(root);
      renderBookings(root.querySelector('.page-list'));
    });
    strip.appendChild(el);
  }
  strip.querySelector(`[data-date="${activeDate || todayStr}"]`)
    ?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
}

function renderBookings(list) {
  let datesToShow = activeDate
    ? [activeDate]
    : [...Object.keys(byDate).filter((d) => d !== 'no-date').sort(), ...(byDate['no-date'] ? ['no-date'] : [])];

  if (!datesToShow.length) {
    list.innerHTML = '';
    list.appendChild(EmptyState('No bookings yet.'));
    return;
  }

  list.innerHTML = '';
  datesToShow.forEach((ds) => {
    const items = byDate[ds] || [];
    if (!items.length) {
      if (activeDate) list.appendChild(EmptyState('No bookings on this day.'));
      return;
    }
    const group = document.createElement('section');
    group.className = 'section';
    group.innerHTML = `<div class="group-heading">${ds === 'no-date' ? 'No Date' : fmtDate(ds)}</div>`;
    items.forEach((s) => group.appendChild(BookingCard(s, pageNavigate, onBookingSaved)));
    list.appendChild(group);
  });
}

function onBookingSaved(svcId, patch) {
  servicesRaw.forEach((s) => {
    if (s.id === svcId) Object.assign(s, patch);
  });
  rebuildByDate();
  const root = document.getElementById('page-root');
  if (root) {
    buildStrip(root);
    renderBookings(root.querySelector('.page-list'));
  }
}
