import { ListCard, ListCardRow } from './list-card.js';
import { Badge, Badges } from './badge.js';
import { Button } from './button.js';
import { escapeHtml, capitalize } from './dom.js';
import { bindPhoneLink } from './phone-sheet.js';
import { openCompleteSheet } from './complete-sheet.js';
import { fmtPrice, time12, fmtPhone, phoneDigits } from '../utils.js';

export function BookingCard(s, navigate, onSaved) {
  const price = s.price != null ? fmtPrice(s.price) : null;
  const amtPaid = s.amount_paid != null ? fmtPrice(s.amount_paid) : null;
  const digits = phoneDigits(s.phone);
  const mapsUrl = s.address ? `https://maps.apple.com/?q=${encodeURIComponent(s.address)}` : '#';

  const card = ListCard();
  const row = ListCardRow({
    body: `
      <div class="item-title">${Badges([s.service_time ? Badge(time12(s.service_time), 'primary') : ''])}${escapeHtml(s.customer || '')}</div>
      <a class="link-primary link-primary--block" href="${mapsUrl}" target="_blank" rel="noopener">${escapeHtml(s.address || '')}</a>
      ${fmtPhone(s.phone) ? `<a class="link-primary phone-link" href="tel:${digits}">${fmtPhone(s.phone)}</a>` : ''}
      <div class="item-meta--base mt-xs">${Badges([
        s.type ? Badge(capitalize(s.type), 'primary') : '',
        s.windows ? Badge(`${s.windows} windows`, 'muted') : '',
        s.completed && !s.paid ? Badge('Unpaid', 'warning') : '',
        s.completed && s.duration_minutes ? Badge(`${s.duration_minutes} min`, 'purple') : '',
      ])}${s.paid && amtPaid ? `<span class="text-success">Paid $${amtPaid}</span>` : ''}</div>
      ${s.notes ? `<div class="item-notes">${escapeHtml(s.notes)}</div>` : ''}`,
    aside: (() => {
      const wrap = document.createElement('div');
      wrap.className = 'list-card-aside list-card-aside--stack';
      if (price) {
        const p = document.createElement('div');
        p.className = 'amount';
        p.textContent = `$${price}`;
        wrap.appendChild(p);
      }
      const done = Button({
        label: s.completed ? 'Done' : 'Mark Done',
        variant: 'sm',
        className: s.completed ? 'is-done' : '',
      });
      done.addEventListener('click', () => openCompleteSheet(s, { onSaved: (patch) => onSaved?.(s.id, patch) }));
      const mapBtn = Button({ label: '📍', variant: 'icon-success', attrs: { title: 'Show on map' } });
      mapBtn.addEventListener('click', () => navigate(`#/map?highlight=${s.house_id || ''}`));
      const editBtn = Button({ label: '✎', variant: 'icon', attrs: { title: 'Edit' } });
      editBtn.addEventListener('click', () => navigate(`#/service/${s.id}/edit`));
      wrap.append(done, mapBtn, editBtn);
      return wrap;
    })(),
  });

  card.appendChild(row);
  const phoneEl = card.querySelector('.phone-link');
  if (phoneEl) bindPhoneLink(phoneEl, s.phone, digits);
  card.querySelector('.link-primary--block')?.addEventListener('click', (e) => e.stopPropagation());
  return card;
}
