import { escapeHtml, capitalize } from './dom.js';
import { fmtPrice } from '../utils.js';

export function StatGrid(cells) {
  const grid = document.createElement('div');
  grid.className = 'stat-grid';
  grid.innerHTML = cells.filter(Boolean).join('');
  return grid;
}

export function StatCell(value, label, { tone = '', full = false } = {}) {
  const classes = ['stat-box', tone && `stat-box--${tone}`, full && 'stat-box--full'].filter(Boolean).join(' ');
  return `<div class="${classes}"><div class="stat-box__val">${value}</div><div class="stat-box__lbl">${escapeHtml(label)}</div></div>`;
}

export function SectionTitle(text) {
  return `<div class="section-title">${escapeHtml(text)}</div>`;
}

export function FunnelRow(label, count, widthPct, color, opacity) {
  const fillStyle = opacity ? `background:${color};opacity:${opacity};` : `background:${color};`;
  const countStyle = opacity ? 'color:var(--color-text-muted);' : `color:${color};`;
  return `<div class="funnel-row">
    <div class="chart-row__label">${escapeHtml(label)}</div>
    <div class="chart-row__track chart-row__track--sm"><div class="chart-row__fill" style="width:${widthPct}%;${fillStyle}"></div></div>
    <div class="chart-row__value" style="${countStyle}">${count}</div>
  </div>`;
}

export function BarChartCard(rows) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = rows.join('');
  return card;
}

export function BarRow(label, widthPct, valueHtml, color) {
  return `<div class="chart-row">
    <div class="chart-row__label chart-row__label--fixed">${escapeHtml(String(label))}</div>
    <div class="chart-row__track chart-row__track--md"><div class="chart-row__fill" style="width:${widthPct}%;background:${color};"></div></div>
    <div class="chart-row__value chart-row__value--sm">${valueHtml}</div>
  </div>`;
}

export function barChartFromRows(rows, valueKey, labelKey, color, capitalizeLabel, extraKey) {
  const max = rows[0]?.[valueKey] || 1;
  const html = rows.map((row) => {
    const label = capitalizeLabel ? capitalize(row[labelKey] || 'Unknown') : (row[labelKey] || 'Other');
    const w = Math.round(((row[valueKey] || 0) / max) * 100);
    const extra = extraKey && row[extraKey] ? ` · $${fmtPrice(row[extraKey])}` : '';
    return BarRow(label, w, `${row[valueKey]}${extra}`, color);
  });
  return BarChartCard(html);
}
