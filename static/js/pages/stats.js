import * as api from '../api.js';
import { mountListPage } from '../components/page-list.js';
import {
  StatGrid,
  StatCell,
  SectionTitle,
  FunnelRow,
  barChartFromRows,
  BarChartCard,
  BarRow,
} from '../components/charts.js';
import { fmtPrice } from '../utils.js';

export const statsPage = {
  async mount(ctx) {
    const shell = mountListPage({
      ...ctx,
      navKey: 'stats',
      title: 'Stats',
      load: async (list) => {
        list.appendChild(renderStats(await api.getStats()));
      },
    });
    await shell.refresh();
  },
  unmount() {},
};

function renderStats(d) {
  const wrap = document.createElement('div');
  const funnelMax = d.total_houses > 0 ? d.total_houses : 1;
  const pct = (n) => Math.round((n / funnelMax) * 100);

  wrap.append(
    el(SectionTitle('Finances')),
    StatGrid([
      StatCell(`$${fmtPrice(d.total_revenue)}`, 'Revenue Collected', { tone: 'success' }),
      StatCell(`$${fmtPrice(d.total_expenses)}`, 'Total Expenses', { tone: 'danger' }),
      StatCell(`$${fmtPrice(d.net_profit)}`, 'Net Profit', { tone: d.net_profit >= 0 ? 'success' : 'danger', full: true }),
      StatCell(`$${fmtPrice(d.total_billed)}`, 'Total Billed'),
      ...(d.avg_duration ? [StatCell(`${Math.round(d.avg_duration)} min`, 'Avg Job Duration', { tone: 'purple' })] : []),
    ]),
    el(SectionTitle('Pipeline Funnel')),
    el(FunnelRow('Knocked', d.total_houses, 100, 'var(--color-primary)')),
    el(FunnelRow('Quoted', d.total_quotes, pct(d.total_quotes), 'var(--color-purple)')),
    el(FunnelRow('Booked', d.total_services, pct(d.total_services), 'var(--color-success)')),
    el(FunnelRow('Completed', d.completed_services, pct(d.completed_services), 'var(--color-success)', 0.6)),
    el(FunnelRow('Paid', d.paid_services, pct(d.paid_services), 'var(--color-orange)')),
  );

  if (d.found_via_data?.length) {
    wrap.append(el(SectionTitle('How Customers Were Found')), barChartFromRows(d.found_via_data, 'cnt', 'found_via', 'var(--color-primary)', true));
  }
  if (d.svc_type_data?.length) {
    wrap.append(el(SectionTitle('Service Types (Completed)')), barChartFromRows(d.svc_type_data, 'cnt', 'type', 'var(--color-success)', true, 'revenue'));
  }
  if (d.monthly_data?.length) {
    const revMax = Math.max(...d.monthly_data.map((r) => r.revenue || 0), 1);
    const rows = [...d.monthly_data].reverse().map((row) => {
      const w = Math.round(((row.revenue || 0) / revMax) * 100);
      return BarRow(row.month, w, `$${fmtPrice(row.revenue)}`, 'var(--color-orange)');
    });
    wrap.append(el(SectionTitle('Monthly Revenue')), BarChartCard(rows));
  }
  if (d.cat_data?.length) {
    wrap.append(el(SectionTitle('Expenses by Category')), barChartFromRows(d.cat_data, 'total', 'category', 'var(--color-danger)', false));
  }
  return wrap;
}

function el(html) {
  const n = document.createElement('div');
  n.innerHTML = html;
  return n.firstElementChild || n;
}
