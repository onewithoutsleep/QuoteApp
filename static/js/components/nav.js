import { navigate } from '../router.js';

const NAV_ITEMS = [
  { hash: '#/quotes', key: 'quotes', label: 'Quotes', icon: '<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>' },
  { hash: '#/map', key: 'map', label: 'Map', icon: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>' },
  { hash: '#/bookings', key: 'bookings', label: 'Bookings', icon: '<path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>' },
  { hash: '#/expenses', key: 'expenses', label: 'Expenses', icon: '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>' },
  { hash: '#/stats', key: 'stats', label: 'Stats', icon: '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>' },
];

export function renderNav(slot, active) {
  slot.innerHTML = '';
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  NAV_ITEMS.forEach((item) => {
    const a = document.createElement('a');
    a.href = item.hash;
    a.className = item.key === active ? 'active' : '';
    a.innerHTML = `<svg viewBox="0 0 24 24">${item.icon}</svg>${item.label}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(item.hash);
    });
    nav.appendChild(a);
  });
  slot.appendChild(nav);
}

export function clearNav(slot) {
  slot.innerHTML = '';
}
