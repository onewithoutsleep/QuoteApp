import { escapeHtml } from './dom.js';
import { fmtPrice } from '../utils.js';

export function PricePills(items) {
  const row = document.createElement('div');
  row.className = 'pill-row';
  row.innerHTML = items
    .map(({ label, amount }) => `
      <div class="pill pill--price">
        <div class="pill__label">${escapeHtml(label)}</div>
        <div class="pill__value">$${fmtPrice(amount)}</div>
      </div>`)
    .join('');
  return row;
}

export function TapPricePanel(items, { title = 'Quote Prices — tap to use' } = {}) {
  const panel = document.createElement('div');
  panel.className = 'pill-panel';
  panel.innerHTML = `
    <div class="pill-panel__label">${escapeHtml(title)}</div>
    <div class="pill-row">${items
      .map(({ label, price }) => {
        const p = fmtPrice(price);
        return `<div class="pill pill--tap" data-price="${p}" role="button" tabindex="0">
          <div class="pill__label">${escapeHtml(label)}</div>
          <div class="pill__value">$${p}</div>
        </div>`;
      })
      .join('')}</div>`;
  return panel;
}
