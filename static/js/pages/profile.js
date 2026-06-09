import * as api from '../api.js';
import { getState, setState } from '../state.js';
import { renderNav } from '../components/nav.js';
import { renderStats } from './stats.js';

// ---------------------------------------------------------------------------
// Metric definitions — must match backend METRIC_LABELS
// ---------------------------------------------------------------------------
const METRICS = [
  { value: 'doors_knocked',    label: 'Doors Knocked'     },
  { value: 'quotes_given',     label: 'Quotes Given'      },
  { value: 'jobs_booked',      label: 'Jobs Booked'       },
  { value: 'revenue',          label: 'Revenue'           },
  { value: 'profit',           label: 'Profit'            },
  { value: 'revenue_pipeline', label: 'Revenue Pipeline'  },
];

const PERIODS = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly'  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export const profilePage = {
  async mount({ root, slots }) {
    renderNav(slots.nav, 'profile');

    root.innerHTML = `
      <div class="container profile-page">
        <div id="profile-content">Loading...</div>
      </div>
    `;

    const [profileResult, statsResult] = await Promise.allSettled([
      api.getProfile(),
      api.getStats(),
    ]);

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    const stats   = statsResult.status   === 'fulfilled' ? statsResult.value   : null;

    if (stats) setState({ stats });

    if (!profile) {
      root.querySelector('#profile-content').innerHTML =
        '<p class="empty-msg">Failed to load profile.</p>';
      return;
    }

    root.querySelector('#profile-content').innerHTML = renderProfile(profile, stats);
    initProfile(root, profile);
  },

  unmount() {},
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderProfile(d, stats) {
  const initials  = getInitials(d.name);
  const statsHtml = stats
    ? renderStats(stats)
    : '<p class="empty-msg">Failed to load stats.</p>';

  return `
    <div class="profile-card">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-info">
        <div class="profile-name">${esc(d.name || 'Your Name')}</div>
        <div class="profile-subtitle">
          ${esc(d.company || '')}${d.company && d.role ? ' · ' : ''}${esc(d.role || '')}
        </div>
        ${d.email ? `<div class="profile-subtitle">${esc(d.email)}</div>` : ''}
        ${d.phone ? `<div class="profile-subtitle">${fmtPhone(d.phone)}</div>` : ''}
      </div>
      <div class="profile-actions">
        <button class="profile-btn" id="edit-profile-btn">Edit Profile</button>
        ${d.cal_token
          ? `<a class="profile-btn profile-btn-secondary"
               href="webcal://${location.host}/calendar/${esc(d.cal_token)}.ics">
               Subscribe to Calendar
             </a>`
          : ''}
      </div>
    </div>

    <div class="section-title">Goals</div>
    <div id="goals-section">${renderGoalsList(d.goals || [])}</div>
    <button class="primary-btn" id="add-goal-btn" style="margin-bottom:20px">
      + Add Goal
    </button>

    <div class="section-title">Stats</div>
    <div id="stats-content">${statsHtml}</div>
  `;
}

function renderGoalsList(goals) {
  const active = goals.filter(g => g.active !== 0);
  if (!active.length) {
    return `<div class="empty-card">
      <p style="color:#888;margin:0">No goals yet. Add one to start tracking your progress.</p>
    </div>`;
  }
  return active.map(g => renderGoalCard(g)).join('');
}

function renderGoalCard(g) {
  const isPipeline = g.metric === 'revenue_pipeline';
  const isRevenue  = g.metric === 'revenue' || g.metric === 'profit' || isPipeline;
  const current    = g.current_value ?? 0;
  const target     = g.target_value  ?? 0;
  const pct        = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  const fmtVal = isRevenue
    ? (v) => `$${fmtPrice(v)}`
    : (v) => String(Math.round(v));

  const periodLabel = g.goal_type === 'one_time'
    ? `${g.period_start} → ${g.period_end}`
    : `This ${g.period_type}: ${g.period_start} → ${g.period_end}`;

  // Bar color logic
  let barColor;
  if (isPipeline) {
    const collected = g.collected ?? 0;
    const pending   = g.pending   ?? 0;
    if (collected >= target)          barColor = '#27ae60';           // all collected
    else if (collected > 0)           barColor = '#e67e22';           // mixed
    else if (pending > 0)             barColor = '#f0a500';           // all pending
    else                              barColor = '#2d89ef';           // nothing yet
  } else {
    barColor = pct >= 100 ? '#27ae60' : '#2d89ef';
  }

  // Progress text — pipeline shows breakdown
  let progressText;
  if (isPipeline) {
    const collected = g.collected ?? 0;
    const pending   = g.pending   ?? 0;
    progressText = `
      ${fmtVal(current)} / ${fmtVal(target)} &mdash; ${pct}%
      <span style="font-size:12px;color:#888;margin-left:6px">
        (<span style="color:#27ae60">${fmtVal(collected)} collected</span>
        &nbsp;+&nbsp;
        <span style="color:#f0a500">${fmtVal(pending)} pending</span>)
      </span>
    `;
  } else {
    progressText = `${fmtVal(current)} / ${fmtVal(target)} &mdash; ${pct}%`;
  }

  return `
    <div class="goal-card" data-id="${g.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="goal-title">${esc(g.title)}</div>
          <div style="font-size:12px;color:#aaa;margin-top:1px">
            ${esc(g.metric_label)} &middot; ${periodLabel}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="goal-action-btn edit-goal-btn"   data-id="${g.id}" title="Edit">&#9998;</button>
          <button class="goal-action-btn delete-goal-btn" data-id="${g.id}" title="Delete">&#x2715;</button>
        </div>
      </div>
      ${g.description ? `<div style="font-size:13px;color:#888;margin:4px 0">${esc(g.description)}</div>` : ''}
      <div class="goal-progress">${progressText}</div>
      <div class="goal-bar">
        <div class="goal-fill" style="width:${pct}%;background:${barColor}"></div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Init interactions
// ---------------------------------------------------------------------------
function initProfile(root, profileData) {
  // goals state — keyed by id for easy lookup
  let goals = [...(profileData.goals || [])];

  function refreshGoals() {
    root.querySelector('#goals-section').innerHTML = renderGoalsList(goals);
    bindGoalButtons();
  }

  function bindGoalButtons() {
    root.querySelectorAll('.edit-goal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        const goal = goals.find(g => g.id === id);
        if (!goal) return;
        openGoalModal(goal, async (payload) => {
          try {
            const updated = await api.updateGoal(id, payload);
            const idx = goals.findIndex(g => g.id === id);
            if (idx !== -1) goals[idx] = updated;
            refreshGoals();
          } catch (err) {
            console.error(err);
            alert('Could not update goal. Please try again.');
          }
        });
      });
    });

    root.querySelectorAll('.delete-goal-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id   = parseInt(btn.dataset.id, 10);
        const goal = goals.find(g => g.id === id);
        if (!goal || !confirm(`Delete goal "${goal.title}"?`)) return;
        try {
          await api.deleteGoal(id);
          goals = goals.filter(g => g.id !== id);
          refreshGoals();
        } catch (err) {
          console.error(err);
          alert('Could not delete goal. Please try again.');
        }
      });
    });
  }

  // Add goal
  root.querySelector('#add-goal-btn').addEventListener('click', () => {
    openGoalModal(null, async (payload) => {
      try {
        const created = await api.createGoal(payload);
        goals.push(created);
        refreshGoals();
      } catch (err) {
        console.error(err);
        alert('Could not create goal. Please try again.');
      }
    });
  });

  // Edit profile
  root.querySelector('#edit-profile-btn').addEventListener('click', () => {
    openProfileModal(profileData, async (updated) => {
      try {
        await api.updateProfile(updated);
        Object.assign(profileData, updated);
        root.querySelector('.profile-avatar').textContent = getInitials(updated.name);
        root.querySelector('.profile-name').textContent   = updated.name || 'Your Name';
        const sub = root.querySelector('.profile-subtitle');
        if (sub) sub.textContent =
          `${updated.company || ''}${updated.company && updated.role ? ' · ' : ''}${updated.role || ''}`;
      } catch (err) {
        console.error(err);
        alert('Could not save profile. Please try again.');
      }
    });
  });

  bindGoalButtons();
}

// ---------------------------------------------------------------------------
// Goal modal
// ---------------------------------------------------------------------------
function openGoalModal(existing, onSave) {
  const isEdit   = !!existing;
  const goalType = existing?.goal_type || 'recurring';
  const today    = new Date().toISOString().slice(0, 10);

  const modal = document.createElement('div');
  modal.className = 'note-modal';
  modal.innerHTML = `
    <div class="note-modal-card" style="max-width:440px;width:92vw">
      <h3 style="margin:0 0 16px">${isEdit ? 'Edit Goal' : 'New Goal'}</h3>

      <div style="display:flex;flex-direction:column;gap:10px">
        <input  type="text" class="goal-input" id="gm-title"
                placeholder="Title (e.g. 50 doors this week)"
                value="${esc(existing?.title || '')}">

        <input  type="text" class="goal-input" id="gm-desc"
                placeholder="Description (optional)"
                value="${esc(existing?.description || '')}">

        <div style="display:flex;gap:8px">
          <div style="flex:1">
            <label class="goal-modal-label">Metric</label>
            <select class="goal-input" id="gm-metric">
              ${METRICS.map(m =>
                `<option value="${m.value}" ${existing?.metric === m.value ? 'selected' : ''}>
                  ${m.label}
                </option>`
              ).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label class="goal-modal-label">Target</label>
            <input type="number" class="goal-input" id="gm-target"
                   placeholder="e.g. 50" value="${existing?.target_value ?? ''}">
          </div>
        </div>

        <div>
          <label class="goal-modal-label">Goal type</label>
          <div style="display:flex;gap:8px">
            <label class="goal-type-option ${goalType === 'recurring' ? 'selected' : ''}" id="gm-type-recurring">
              <input type="radio" name="gm-type" value="recurring" ${goalType === 'recurring' ? 'checked' : ''}>
              Recurring
            </label>
            <label class="goal-type-option ${goalType === 'one_time' ? 'selected' : ''}" id="gm-type-one_time">
              <input type="radio" name="gm-type" value="one_time" ${goalType === 'one_time' ? 'checked' : ''}>
              One-time
            </label>
          </div>
        </div>

        <div id="gm-period-row" style="${goalType === 'one_time' ? 'display:none' : ''}">
          <label class="goal-modal-label">Period</label>
          <select class="goal-input" id="gm-period">
            ${PERIODS.map(p =>
              `<option value="${p.value}" ${existing?.period_type === p.value ? 'selected' : ''}>
                ${p.label}
              </option>`
            ).join('')}
          </select>
        </div>

        <div id="gm-dates-row" style="${goalType === 'recurring' ? 'display:none' : ''}">
          <label class="goal-modal-label">Date range</label>
          <div style="display:flex;gap:8px">
            <input type="date" class="goal-input" id="gm-start"
                   value="${existing?.start_date || today}" style="flex:1">
            <input type="date" class="goal-input" id="gm-end"
                   value="${existing?.end_date   || ''}"  style="flex:1" placeholder="End date">
          </div>
        </div>
      </div>

      <div class="note-modal-actions" style="margin-top:18px">
        <button data-cancel style="background:#eee;color:#333;border:none">Cancel</button>
        <button class="btn-green" data-save>Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Toggle period/dates rows when goal type changes
  modal.querySelectorAll('input[name="gm-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const recurring = modal.querySelector('#gm-type-recurring input').checked;
      modal.querySelector('#gm-period-row').style.display = recurring ? '' : 'none';
      modal.querySelector('#gm-dates-row').style.display  = recurring ? 'none' : '';
      // Update selected styling
      modal.querySelectorAll('.goal-type-option').forEach(el => el.classList.remove('selected'));
      radio.closest('.goal-type-option').classList.add('selected');
    });
  });

  modal.querySelector('[data-cancel]').onclick = () => modal.remove();

  modal.querySelector('[data-save]').onclick = () => {
    const title     = modal.querySelector('#gm-title').value.trim();
    const desc      = modal.querySelector('#gm-desc').value.trim();
    const metric    = modal.querySelector('#gm-metric').value;
    const target    = parseFloat(modal.querySelector('#gm-target').value);
    const goalType  = modal.querySelector('input[name="gm-type"]:checked').value;
    const period    = modal.querySelector('#gm-period').value;
    const startDate = modal.querySelector('#gm-start').value;
    const endDate   = modal.querySelector('#gm-end').value;

    if (!title)        { alert('Please enter a goal title.');  return; }
    if (isNaN(target)) { alert('Please enter a target value.'); return; }
    if (goalType === 'one_time' && !startDate) { alert('Please enter a start date.'); return; }

    modal.remove();
    onSave({
      title,
      description:  desc,
      metric,
      target_value: target,
      goal_type:    goalType,
      period_type:  goalType === 'recurring' ? period : null,
      start_date:   startDate || new Date().toISOString().slice(0, 10),
      end_date:     goalType === 'one_time' ? (endDate || null) : null,
    });
  };
}

// ---------------------------------------------------------------------------
// Profile edit modal
// ---------------------------------------------------------------------------
function openProfileModal(d, onSave) {
  const modal = document.createElement('div');
  modal.className = 'note-modal';
  modal.innerHTML = `
    <div class="note-modal-card" style="max-width:420px;width:90vw">
      <h3 style="margin:0 0 16px">Edit Profile</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <input type="text"  class="goal-input" id="pm-name"    placeholder="Full name"    value="${esc(d.name    || '')}">
        <input type="text"  class="goal-input" id="pm-company" placeholder="Company name" value="${esc(d.company || '')}">
        <input type="text"  class="goal-input" id="pm-role"    placeholder="Role"         value="${esc(d.role    || '')}">
        <input type="email" class="goal-input" id="pm-email"   placeholder="Email"        value="${esc(d.email   || '')}">
        <input type="tel"   class="goal-input" id="pm-phone"   placeholder="Phone"        value="${esc(d.phone   || '')}">
      </div>
      <div class="note-modal-actions" style="margin-top:16px">
        <button data-cancel style="background:#eee;color:#333;border:none">Cancel</button>
        <button class="btn-green" data-save>Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('[data-cancel]').onclick = () => modal.remove();
  modal.querySelector('[data-save]').onclick = () => {
    modal.remove();
    onSave({
      name:    modal.querySelector('#pm-name').value.trim(),
      company: modal.querySelector('#pm-company').value.trim(),
      role:    modal.querySelector('#pm-role').value.trim(),
      email:   modal.querySelector('#pm-email').value.trim(),
      phone:   modal.querySelector('#pm-phone').value.trim(),
    });
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function fmtPhone(v) {
  const d = String(v).replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return v;
}

function fmtPrice(v) {
  try {
    const n = parseFloat(v);
    return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
  } catch { return v; }
}