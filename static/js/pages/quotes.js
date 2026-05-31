import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { renderFab } from '../components/fab.js';
import { fmtPrice, time12, fmtPhone, phoneDigits, handlePhone } from '../utils.js';

export const quotesPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'quotes');
    renderFab(slots.fab, { hash: '#/quotes/new', label: 'Add quote' });

    root.innerHTML = `
      <div class="container quotes-page">
        <h2>Saved Quotes</h2>
        <div id="quotes-list">Loading…</div>
      </div>`;

    const listEl = root.querySelector('#quotes-list');
    try {
      const quotes = await api.getQuotes();
      if (!quotes?.length) {
        listEl.innerHTML = '<p class="empty-msg">No quotes yet. Add one to get started.</p>';
        return;
      }
      listEl.innerHTML = '';
      quotes.forEach((q) => listEl.appendChild(buildQuoteCard(q, navigate)));
    } catch (err) {
      listEl.innerHTML = '<p class="empty-msg">Failed to load quotes.</p>';
      console.error(err);
    }
  },
  unmount() {},
};

function buildQuoteCard(q, navigate) {
  const card = document.createElement('div');
  card.className = 'quote-card';
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(q.address || '')}`;
  const digits = phoneDigits(q.phone);
  const fPhone = fmtPhone(q.phone);

  let servicesHtml = '';
  if (q.services?.length) {
    servicesHtml = `<div class="services-section"><div class="services-label">Booked Services</div>`;
    q.services.forEach((s) => {
      servicesHtml += `<div class="service-row">
        <div class="service-info">
          ${s.type ? `<span class="svc-badge badge-type">${capitalize(s.type)}</span>` : ''}
          ${s.completed ? '<span class="svc-badge badge-done">✓ Done</span>' : ''}
          ${s.completed && !s.paid ? '<span class="svc-badge badge-unpaid">Unpaid</span>' : ''}
          ${s.service_date || ''}${s.service_time ? ` at ${time12(s.service_time)}` : ''}
          ${s.price != null ? ` · <strong>$${fmtPrice(s.price)}</strong>` : ''}
          ${s.paid && s.amount_paid != null ? ` · <span style="color:#27ae60;">Paid $${fmtPrice(s.amount_paid)}</span>` : ''}
          ${s.notes ? `<br><span style="color:#aaa;font-size:13px;">${escapeHtml(s.notes)}</span>` : ''}
        </div>
        <a class="service-edit-btn" href="#/service/${s.id}/edit" data-nav>
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </a>
      </div>`;
    });
    servicesHtml += '</div>';
  }

  card.innerHTML = `
    <div class="quote-address-bar">
      <a href="${mapsUrl}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>
        ${escapeHtml(q.address || '')}
      </a>
    </div>
    <div class="quote-body">
      <div class="quote-customer">${escapeHtml(q.customer || '')}</div>
      <div class="quote-contact">
        ${q.phone ? `<a href="tel:${digits}" class="phone-link">${fPhone}</a>` : ''}
        ${q.phone && q.email ? ' · ' : ''}
        ${q.email ? `<a href="mailto:${escapeHtml(q.email)}">${escapeHtml(q.email)}</a>` : ''}
      </div>
      <div class="quote-prices">
        <div class="price-pill"><div class="label">Outside</div><div class="amount">$${fmtPrice(q.outside_price)}</div></div>
        <div class="price-pill"><div class="label">Inside</div><div class="amount">$${fmtPrice(q.inside_price)}</div></div>
        <div class="price-pill"><div class="label">Both</div><div class="amount">$${fmtPrice(q.both_price)}</div></div>
      </div>
      <div class="quote-meta">
        <span class="meta-tag">${q.windows} windows</span>
        <span class="meta-tag">${escapeHtml(q.quote_date || '')}</span>
        ${q.found_via ? `<span class="meta-tag">${capitalize(q.found_via)}</span>` : ''}
      </div>
      ${q.notes ? `<div class="quote-notes">${escapeHtml(q.notes)}</div>` : ''}
      <div class="quote-actions">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" class="btn-green" data-action="book">Book Service</button>
        <button type="button" class="btn-green" data-action="map">Map</button>
        <button type="button" data-action="email">Email Quote</button>
        <button type="button" data-action="text">Text Quote</button>
      </div>
      ${servicesHtml}
    </div>`;

  const phoneLink = card.querySelector('.phone-link');
  if (phoneLink) {
    phoneLink.addEventListener('click', (e) => handlePhone(e, q.phone, digits));
  }

  card.querySelector('[data-action="edit"]')?.addEventListener('click', () => navigate(`#/quote/${q.id}/edit`));
  card.querySelector('[data-action="book"]')?.addEventListener('click', () => navigate(`#/services/new/${q.id}`));
  card.querySelector('[data-action="map"]')?.addEventListener('click', () => navigate(`#/map?highlight=${q.house_id}`));
  card.querySelector('[data-action="email"]')?.addEventListener('click', () => { location.href = `/email/${q.id}`; });
  card.querySelector('[data-action="text"]')?.addEventListener('click', () => { location.href = `/text/${q.id}`; });

  card.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.getAttribute('href'));
    });
  });

  return card;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
