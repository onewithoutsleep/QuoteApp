import * as api from '../api.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { Button } from '../components/button.js';
import { LoadingState } from '../components/loading-state.js';
import { EmptyState } from '../components/empty-state.js';
import { renderNav } from '../components/nav.js';
import { escapeHtml, escAttr } from '../components/dom.js';

export const settingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'stats');
    const { page, content } = createPage({ title: 'Settings', className: 'settings-page' });
    content.appendChild(LoadingState());
    mountPage(root, page);

    try {
      const s = await api.getSettings();
      content.innerHTML = '';
      const form = document.createElement('form');
      form.id = 'settings-form';
      form.innerHTML = `
        <h2>Pricing (per window)</h2>
        ${field('outside_rate', s.outside_rate, 'Outside Rate')}
        ${field('inside_rate', s.inside_rate, 'Inside Rate')}
        ${field('both_rate', s.both_rate, 'Both Rate')}
        <h2>Email Template</h2>
        <p class="hint">Use <code>{customer}</code>, <code>{outside}</code>, <code>{inside}</code>, <code>{both}</code> as placeholders.</p>
        <textarea class="input" name="email_template">${escapeHtml(s.email_template)}</textarea>
        <h2>Text Template</h2>
        <p class="hint">Same placeholders as above.</p>
        <textarea class="input" name="text_template">${escapeHtml(s.text_template)}</textarea>`;
      form.append(
        Button({ label: 'Save', type: 'submit' }),
        Button({ label: 'Cancel', type: 'button', variant: 'link', attrs: { id: 'cancel-btn' } }),
      );
      content.appendChild(Card({ body: form }));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api.updateSettings({
          outside_rate: fd.get('outside_rate'),
          inside_rate: fd.get('inside_rate'),
          both_rate: fd.get('both_rate'),
          email_template: fd.get('email_template'),
          text_template: fd.get('text_template'),
        });
        navigate('#/quotes');
      });
      root.querySelector('#cancel-btn')?.addEventListener('click', () => navigate('#/quotes'));
    } catch (err) {
      content.innerHTML = '';
      content.appendChild(EmptyState('Failed to load settings.'));
      console.error(err);
    }
  },
  unmount() {},
};

function field(name, value, placeholder) {
  return `<input class="input" name="${name}" type="number" step="0.01" placeholder="${escAttr(placeholder)}" value="${escAttr(value)}">`;
}
