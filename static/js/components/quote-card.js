import { ListCard, ListCardRow } from './list-card.js';
import { Badge, Badges } from './badge.js';
import { ActionBar } from './action-bar.js';
import { PricePills } from './pills.js';
import { escapeHtml, capitalize } from './dom.js';
import { bindPhoneLink } from './phone-sheet.js';
import { fmtPrice, time12, fmtPhone, phoneDigits } from '../utils.js';

const EDIT_SVG = '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const MAP_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>';

export function QuoteCard(q, navigate) {
  const card = ListCard({ className: 'list-card--spaced' });
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(q.address || '')}`;
  const digits = phoneDigits(q.phone);
  const fPhone = fmtPhone(q.phone);

  const banner = document.createElement('div');
  banner.className = 'card-banner card-banner--primary';
  banner.innerHTML = `<a href="${mapsUrl}" target="_blank" rel="noopener">${MAP_SVG}${escapeHtml(q.address || '')}</a>`;
  card.appendChild(banner);

  const body = document.createElement('div');
  body.className = 'card-body-pad';

  const contactParts = [];
  if (q.phone) contactParts.push(`<a href="tel:${digits}" class="link-primary phone-link">${fPhone}</a>`);
  if (q.email) contactParts.push(`<a href="mailto:${escapeHtml(q.email)}" class="link-primary">${escapeHtml(q.email)}</a>`);

  body.innerHTML = `
    <div class="item-title item-title--xl">${escapeHtml(q.customer || '')}</div>
    <div class="item-meta">${contactParts.join(' · ')}</div>`;

  body.appendChild(PricePills([
    { label: 'Outside', amount: q.outside_price },
    { label: 'Inside', amount: q.inside_price },
    { label: 'Both', amount: q.both_price },
  ]));

  const meta = document.createElement('div');
  meta.className = 'meta-row';
  meta.innerHTML = Badges([
    Badge(`${q.windows} windows`, 'muted'),
    Badge(q.quote_date, 'muted'),
    q.found_via ? Badge(capitalize(q.found_via), 'primary') : '',
  ]);
  body.appendChild(meta);

  if (q.notes) {
    const notes = document.createElement('div');
    notes.className = 'item-notes card-divider-top';
    notes.textContent = q.notes;
    body.appendChild(notes);
  }

  const actions = ActionBar([
    { label: 'Edit', onClick: () => navigate(`#/quote/${q.id}/edit`) },
    { label: 'Book Service', variant: 'success', onClick: () => navigate(`#/services/new/${q.id}`) },
    { label: 'Map', variant: 'success', onClick: () => navigate(`#/map?highlight=${q.house_id}`) },
    { label: 'Email Quote', onClick: () => { location.href = `/email/${q.id}`; } },
    { label: 'Text Quote', onClick: () => { location.href = `/text/${q.id}`; } },
  ]);
  body.appendChild(actions);

  if (q.services?.length) {
    body.appendChild(renderServices(q.services, navigate));
  }

  card.appendChild(body);

  const phoneLink = body.querySelector('.phone-link');
  if (phoneLink) bindPhoneLink(phoneLink, q.phone, digits);

  return card;
}

function renderServices(services, navigate) {
  const section = document.createElement('div');
  section.className = 'card-section';
  section.innerHTML = '<div class="card-section__label">Booked Services</div>';

  services.forEach((s) => {
    const row = ListCardRow({
      body: `<div class="item-meta--base">${Badges([
        s.type ? Badge(capitalize(s.type), 'primary') : '',
        s.completed ? Badge('✓ Done', 'success') : '',
        s.completed && !s.paid ? Badge('Unpaid', 'warning') : '',
      ])}${s.service_date || ''}${s.service_time ? ` at ${time12(s.service_time)}` : ''}${s.price != null ? ` · <strong>$${fmtPrice(s.price)}</strong>` : ''}${s.paid && s.amount_paid != null ? ` · <span class="text-success">Paid $${fmtPrice(s.amount_paid)}</span>` : ''}${s.notes ? `<br><span class="item-notes">${escapeHtml(s.notes)}</span>` : ''}</div>`,
      aside: (() => {
        const a = document.createElement('a');
        a.className = 'btn btn-icon';
        a.href = `#/service/${s.id}/edit`;
        a.innerHTML = EDIT_SVG;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(a.getAttribute('href'));
        });
        return a;
      })(),
      center: true,
    });
    section.appendChild(row);
  });
  return section;
}
