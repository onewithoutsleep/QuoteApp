import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { EmptyState } from '../components/empty-state.js';
import { LoadingState } from '../components/loading-state.js';
import { escapeHtml, capitalize } from '../components/dom.js';
import { fmtPrice } from '../utils.js';

export const statsPage = {
  async mount({ root, slots }) {
    renderNav(slots.nav, 'stats');

    const { page, content } = createPage({ title: 'Stats', className: 'stats-page', tag: 'h2' });
    const statsContent = document.createElement('div');
    statsContent.id = 'stats-content';
    statsContent.appendChild(LoadingState());
    content.appendChild(statsContent);
    mountPage(root, page);

    try {
      const d = await api.getStats();
      statsContent.innerHTML = renderStats(d);
    } catch (err) {
      statsContent.innerHTML = '';
      statsContent.appendChild(EmptyState('Failed to load stats.'));
      console.error(err);
    }
  },
  unmount() {},
};

function renderStats(d) {
  const funnelMax = d.total_houses > 0 ? d.total_houses : 1;
  const pct = (n) => Math.round((n / funnelMax) * 100);

  let html = `
    <div class="section-title">Finances</div>
    <div class="stat-grid">
      <div class="stat-box green"><div class="val">$${fmtPrice(d.total_revenue)}</div><div class="lbl">Revenue Collected</div></div>
      <div class="stat-box red"><div class="val">$${fmtPrice(d.total_expenses)}</div><div class="lbl">Total Expenses</div></div>
      <div class="stat-box ${d.net_profit >= 0 ? 'green' : 'red'} full"><div class="val">$${fmtPrice(d.net_profit)}</div><div class="lbl">Net Profit</div></div>
      <div class="stat-box"><div class="val">$${fmtPrice(d.total_billed)}</div><div class="lbl">Total Billed</div></div>
      ${d.avg_duration ? `<div class="stat-box purple"><div class="val">${Math.round(d.avg_duration)} min</div><div class="lbl">Avg Job Duration</div></div>` : ''}
    </div>
    <div class="section-title">Pipeline Funnel</div>
    ${funnelRow('Knocked', d.total_houses, 100, 'var(--color-primary)')}
    ${funnelRow('Quoted', d.total_quotes, pct(d.total_quotes), 'var(--color-purple)')}
    ${funnelRow('Booked', d.total_services, pct(d.total_services), 'var(--color-success)')}
    ${funnelRow('Completed', d.completed_services, pct(d.completed_services), 'var(--color-success)', 0.6)}
    ${funnelRow('Paid', d.paid_services, pct(d.paid_services), 'var(--color-orange)')}`;

  if (d.found_via_data?.length) {
    html += `<div class="section-title">How Customers Were Found</div>${barChart(d.found_via_data, 'cnt', 'found_via', 'var(--color-primary)', true)}`;
  }
  if (d.svc_type_data?.length) {
    html += `<div class="section-title">Service Types (Completed)</div>${barChart(d.svc_type_data, 'cnt', 'type', 'var(--color-success)', true, 'revenue')}`;
  }
  if (d.monthly_data?.length) {
    const revMax = Math.max(...d.monthly_data.map((r) => r.revenue || 0), 1);
    html += `<div class="section-title">Monthly Revenue</div><div class="bar-chart">`;
    [...d.monthly_data].reverse().forEach((row) => {
      const w = Math.round(((row.revenue || 0) / revMax) * 100);
      html += barRow(row.month, w, `$${fmtPrice(row.revenue)}`, 'var(--color-orange)');
    });
    html += '</div>';
  }
  if (d.cat_data?.length) {
    html += `<div class="section-title">Expenses by Category</div>${barChart(d.cat_data, 'total', 'category', 'var(--color-danger)', false)}`;
  }

  return html;
}

function funnelRow(label, count, width, color, opacity) {
  const style = opacity ? `background:${color};opacity:${opacity};` : `background:${color};`;
  const countColor = opacity ? 'color:var(--color-text-muted);' : `color:${color};`;
  return `<div class="funnel-row">
    <div class="funnel-label">${label}</div>
    <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${width}%;${style}"></div></div>
    <div class="funnel-count" style="${countColor}">${count}</div>
  </div>`;
}

function barChart(rows, valueKey, labelKey, color, capitalizeLabel, extraKey) {
  const max = rows[0]?.[valueKey] || 1;
  let html = '<div class="bar-chart">';
  rows.forEach((row) => {
    const label = capitalizeLabel ? capitalize(row[labelKey] || 'Unknown') : (row[labelKey] || 'Other');
    const w = Math.round(((row[valueKey] || 0) / max) * 100);
    const extra = extraKey && row[extraKey] ? ` · $${fmtPrice(row[extraKey])}` : '';
    html += barRow(label, w, `${row[valueKey]}${extra}`, color);
  });
  return html + '</div>';
}

function barRow(label, width, val, color) {
  return `<div class="bar-row">
    <div class="bar-lbl">${escapeHtml(String(label))}</div>
    <div class="bar-wrap"><div class="bar-fill" style="width:${width}%;background:${color};"></div></div>
    <div class="bar-val">${val}</div>
  </div>`;
}
