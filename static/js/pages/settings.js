import * as api from '../api.js';
import { renderNav } from '../components/nav.js';
import { createPage, mountPage } from '../components/page.js';
import { Card } from '../components/card.js';
import { LoadingState } from '../components/loading-state.js';
import { EmptyState } from '../components/empty-state.js';
import { escAttr, escapeHtml } from '../components/dom.js';

export const settingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'stats');

    const { page, content } = createPage({ title: 'Settings', className: 'settings-page' });
    content.appendChild(LoadingState());
    mountPage(root, page);

    try {
      const s = await api.getSettings();
      content.innerHTML = '';
      const formCard = Card({
        body: `
          <form id="settings-form">
            <h2>Pricing (per window)</h2>
            <input class="input" name="outside_rate" type="number" step="0.01" placeholder="Outside Rate" value="${escAttr(s.outside_rate)}">
            <input class="input" name="inside_rate" type="number" step="0.01" placeholder="Inside Rate" value="${escAttr(s.inside_rate)}">
            <input class="input" name="both_rate" type="number" step="0.01" placeholder="Both Rate" value="${escAttr(s.both_rate)}">
            <h2>Email Template</h2>
            <p class="hint">Use <code>{customer}</code>, <code>{outside}</code>, <code>{inside}</code>, <code>{both}</code> as placeholders.</p>
            <textarea name="email_template">${escapeHtml(s.email_template)}</textarea>
            <h2>Text Template</h2>
            <p class="hint">Same placeholders as above.</p>
            <textarea name="text_template">${escapeHtml(s.text_template)}</textarea>
            <button type="submit">Save</button>
            <button type="button" class="btn-link" id="cancel-btn">Cancel</button>
          </form>`,
      });
      content.appendChild(formCard);

      root.querySelector('#settings-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await api.updateSettings({
            outside_rate: fd.get('outside_rate'),
            inside_rate: fd.get('inside_rate'),
            both_rate: fd.get('both_rate'),
            email_template: fd.get('email_template'),
            text_template: fd.get('text_template'),
          });
          navigate('#/quotes');
        } catch (err) {
          alert('Failed to save settings.');
          console.error(err);
        }
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
