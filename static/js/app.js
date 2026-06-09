import * as api from './api.js';
import { setState } from './state.js';
import { clearHeader } from './components/header.js';
import { clearNav } from './components/nav.js';
import { clearFab } from './components/fab.js';
import { quotesPage } from './pages/quotes.js';
import { mapPage } from './pages/map.js';
import { bookingsPage } from './pages/bookings.js';
import { expensesPage } from './pages/expenses.js';
import { statsPage } from './pages/stats.js';
import { profilePage } from './pages/profile.js';
import { quoteFormPage } from './pages/quote-form.js';
import { serviceFormPage } from './pages/service-form.js';
import { settingsPage } from './pages/settings.js';
import { navigate, getHashPath } from './router.js';

export { navigate };

const headerSlot = document.getElementById('header-slot');
const pageRoot = document.getElementById('page-root');
const navSlot = document.getElementById('nav-slot');
const fabSlot = document.getElementById('fab-slot');

const routes = [
  { pattern: /^\/$/, page: quotesPage },
  { pattern: /^\/quotes$/, page: quotesPage },
  { pattern: /^\/map$/, page: mapPage },
  { pattern: /^\/bookings$/, page: bookingsPage },
  { pattern: /^\/expenses$/, page: expensesPage },
  { pattern: /^\/stats$/, page: statsPage },
  { pattern: /^\/profile$/, page: profilePage },
  { pattern: /^\/settings$/, page: settingsPage },
  { pattern: /^\/quotes\/new$/, page: quoteFormPage },
  { pattern: /^\/quote\/(\d+)\/edit$/, page: quoteFormPage, params: ['id'] },
  { pattern: /^\/services\/new\/(\d+)$/, page: serviceFormPage, params: ['quoteId'] },
  { pattern: /^\/service\/(\d+)\/edit$/, page: serviceFormPage, params: ['id'] },
];

let currentPage = null;
let currentAbort = null;

function parseHash() {
  const path = getHashPath();
  const params = {};
  const query = location.hash.split('?')[1];
  if (query) {
    new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
  }
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) {
      if (route.params) {
        route.params.forEach((name, i) => { params[name] = m[i + 1]; });
      }
      return { page: route.page, params, path };
    }
  }
  return { page: notFoundPage, params: {}, path };
}

async function render() {
  const { page, params } = parseHash();
  if (currentPage?.unmount) {
    currentPage.unmount();
    currentPage = null;
  }
  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  clearHeader(headerSlot);
  pageRoot.innerHTML = '';
  clearNav(navSlot);
  clearFab(fabSlot);

  const ctx = {
    root: pageRoot,
    params,
    slots: { header: headerSlot, nav: navSlot, fab: fabSlot },
    signal: currentAbort.signal,
    navigate,
  };

  currentPage = page;
  await page.mount(ctx);
}

function notFoundPage(ctx) {
  return {
    async mount() {
      ctx.root.innerHTML = '<div class="container"><p>Page not found.</p></div>';
    },
    unmount() {},
  };
}

async function boot() {
  try {
    const session = await api.getSession();
    if (!session) return;
    setState({ user: session.username });
    const rates = await api.getRates();
    setState({ rates });
  } catch (err) {
    console.error(err);
    return;
  }
  window.addEventListener('hashchange', render);
  if (!location.hash) {
    const pathToHash = {
      '/': '#/quotes',
      '/map': '#/map',
      '/bookings': '#/bookings',
      '/expenses': '#/expenses',
      '/stats': '#/stats',
      '/settings': '#/settings',
      '/quote/new': '#/quotes/new',
    };
    const editMatch = location.pathname.match(/^\/edit\/(\d+)$/);
    const svcNewMatch = location.pathname.match(/^\/service\/new\/(\d+)$/);
    const svcEditMatch = location.pathname.match(/^\/service\/edit\/(\d+)$/);
    if (editMatch) navigate(`#/quote/${editMatch[1]}/edit`);
    else if (svcNewMatch) navigate(`#/services/new/${svcNewMatch[1]}`);
    else if (svcEditMatch) navigate(`#/service/${svcEditMatch[1]}/edit`);
    else {
      navigate(pathToHash[location.pathname] || '#/quotes');
    }
  } else {
    await render();
  }
}

boot();
