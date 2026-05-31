import * as api from '../api.js';
import { renderNav } from '../components/nav.js';

export const settingsPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'stats');
    root.innerHTML = '<div class="container"><h1>Settings</h1><div class="card"><p>Loading…</p></div></div>';

    try {
      const s = await api.getSettings();
      root.innerHTML = `
        <div class="container settings-page">
          <h1>Settings</h1>
          <div class="card">
            <form id="settings-form">
              <h2>Pricing (per window)</h2>
              <input name="outside_rate" type="number" step="0.01" placeholder="Outside Rate" value="${esc(s.outside_rate)}">
              <input name="inside_rate" type="number" step="0.01" placeholder="Inside Rate" value="${esc(s.inside_rate)}">
              <input name="both_rate" type="number" step="0.01" placeholder="Both Rate" value="${esc(s.both_rate)}">
              <h2>Email Template</h2>
              <p class="hint">Use <code>{customer}</code>, <code>{outside}</code>, <code>{inside}</code>, <code>{both}</code> as placeholders.</p>
              <textarea name="email_template">${esc(s.email_template)}</textarea>
              <h2>Text Template</h2>
              <p class="hint">Same placeholders as above.</p>
              <textarea name="text_template">${esc(s.text_template)}</textarea>
              <button type="submit">Save</button>
              <button type="button" class="btn-link" id="cancel-btn">Cancel</button>
            </form>
          </div>
        </div>`;

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
      root.innerHTML = '<div class="container"><p>Failed to load settings.</p></div>';
      console.error(err);
    }
  },
  unmount() {},
};

function esc(s) {
  return s != null ? String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;') : '';
}
