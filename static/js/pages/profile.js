import * as api from '../api.js';
import { getState, setState } from '../state.js';
import { renderNav } from '../components/nav.js';
import { renderStats } from './stats.js';

// ---------------------------------------------------------------------------
// Metric definition
// ---------------------------------------------------------------------------
const METRICS = [
  { value: 'doors_knocked', label: 'Doors Knocked', icon: '', desc: 'Doors knocked per period' },
  { value: 'quotes_given',  label: 'Quotes Given',  icon: '', desc: 'Quotes sent per period'   },
  { value: 'jobs_booked',   label: 'Jobs Booked',   icon: '', desc: 'Jobs booked per period'   },
  { value: 'earnings',      label: 'Earnings',      icon: '', desc: 'Collected + pending, with profit breakdown' },
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
        <a class="profile-btn" href="/settings">Settings</a>
        ${d.cal_token
          ? `<a class="profile-btn profile-btn-secondary"
               href="webcal://${location.host}/calendar/${esc(d.cal_token)}.ics">
               Subscribe to Calendar
             </a>`
          : ''}
        <a class="profile-btn profile-btn-secondary" href="/logout">Logout</a>
      </div>
    </div>

    <div class="section-title">Goals</div>
    <div id="goals-section">${renderGoalsList(d.goals || [])}</div>
    <button class="primary-btn" id="add-goal-btn" style="margin-bottom:20px">
      + Add Goal
    </button>

    <h2>Stats</h2>
    <div id="stats-content">${statsHtml}</div>
  `;
}

// ---------------------------------------------------------------------------
// Goal title
// ---------------------------------------------------------------------------
function goalTitle(g) {
  const metricLabel = g.metric_label || METRICS.find(m => m.value === g.metric)?.label || g.metric;

  if (g.goal_type === 'one_time') {
    return `${metricLabel} · ${g.period_start} – ${g.period_end}`;
  }

  const periodMap = {
    daily:   'Daily',
    weekly:  'Weekly',
    monthly: 'Monthly',
    yearly:  'Yearly',
  };
  const period = periodMap[g.period_type] || g.period_type;
  return `${metricLabel} · ${period}`;
}

// ---------------------------------------------------------------------------
// Render goals list
// ---------------------------------------------------------------------------
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
  const isEarnings = g.metric === 'earnings';
  const isMoney    = isEarnings;

  const current = g.current_value ?? 0;
  const target  = g.target_value  ?? 0;
  const pct     = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  const fmtVal = isMoney
    ? (v) => `$${fmtPrice(v)}`
    : (v) => String(Math.round(v));

  // Bar color
  let barColor;
  if (isEarnings) {
    const collected = g.collected ?? 0;
    if (collected >= target)   barColor = '#27ae60';
    else if (collected > 0)    barColor = '#e67e22';
    else if (current > 0)      barColor = '#f0a500';
    else                       barColor = '#2d89ef';
  } else {
    barColor = pct >= 100 ? '#27ae60' : '#2d89ef';
  }

  // Earnings breakdown
  let breakdownHtml = '';
  if (isEarnings && g.collected !== null) {
    const collected = g.collected ?? 0;
    const pending   = g.pending   ?? 0;

    breakdownHtml = `
      <div class="goal-breakdown">
        <div class="goal-breakdown-row">
          <span class="goal-breakdown-label">Collected</span>
          <span class="goal-breakdown-value" style="color:#27ae60">$${fmtPrice(collected)}</span>
        </div>
        <div class="goal-breakdown-row">
          <span class="goal-breakdown-label">Pending</span>
          <span class="goal-breakdown-value" style="color:#f0a500">$${fmtPrice(pending)}</span>
        </div>
      </div>
    `;
  }

  let goalBarHTML;

  if (isMoney) {
    const collected = g.collected ?? 0;
    const pending = g.pending ?? 0;

    const collectedPct =
      target > 0 ? Math.min(100, (collected / target) * 100) : 0;

    const pendingPct =
      target > 0
        ? Math.min(100 - collectedPct, (pending / target) * 100)
        : 0;

    goalBarHTML = `
      <div class="goal-bar">
        <div
          class="goal-fill goal-fill-collected"
          style="width:${collectedPct}%">
        </div>

        <div
          class="goal-fill goal-fill-pending"
          style="
            left:${collectedPct}%;
            width:${pendingPct}%;">
        </div>
      </div>
    `;
  } else {
    goalBarHTML = `
      <div class="goal-bar">
        <div
          class="goal-fill"
          style="width:${pct}%;background:#2d89ef">
        </div>
      </div>
    `;
  }

  const periodLine = g.goal_type === 'one_time'
    ? `${g.period_start} – ${g.period_end}`
    : `${g.period_start} – ${g.period_end}`;

  return `
    <div class="goal-card" data-id="${g.id}">
      <div class="goal-card-header">
        <div class="goal-card-header-left">
          <div class="goal-title">${esc(goalTitle(g))}</div>
          <div class="goal-period-label">${periodLine}</div>
        </div>
        <div class="goal-card-actions">
          <button class="goal-action-btn edit-goal-btn" data-id="${g.id}" title="Edit">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <button class="goal-action-btn delete-goal-btn" data-id="${g.id}" title="Delete">&#x2715;</button>
        </div>
      </div>

      <div class="goal-progress-row">
        <span class="goal-progress-pct" style="color:${barColor}">${pct}%</span>
        <span class="goal-progress-detail">${fmtVal(current)} / ${fmtVal(target)}</span>
      </div>

      ${goalBarHTML}

      ${breakdownHtml}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Init interactions
// ---------------------------------------------------------------------------
function initProfile(root, profileData) {
  let goals = [...(profileData.goals || [])];

  function refreshGoals() {
    root.querySelector('#goals-section').innerHTML = renderGoalsList(goals);
    bindGoalButtons();
  }

  function bindGoalButtons() {
    root.querySelectorAll('.edit-goal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id   = parseInt(btn.dataset.id, 10);
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
        if (!goal || !confirm(`Delete this goal?`)) return;
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
// Goal modal — step-based
// ---------------------------------------------------------------------------
function openGoalModal(existing, onSave) {
  const isEdit = !!existing;

  const modal = document.createElement('div');
  modal.className = 'note-modal';

  if (!isEdit) {
    // Step-based: start at metric picker
    let selectedMetric = existing?.metric || null;
    let step = (isEdit) ? 2 : 1;

    function render() {
      if (step === 1) {
        modal.innerHTML = `
          <div class="note-modal-card goal-modal-card">
            <div class="goal-modal-header">
              <span class="goal-modal-step">Step 1 of 2</span>
              <h3>What are you tracking?</h3>
            </div>
            <div class="goal-metric-grid">
              ${METRICS.map(m => `
                <button class="goal-metric-tile ${selectedMetric === m.value ? 'selected' : ''}"
                        data-metric="${m.value}">
                  <span class="goal-metric-icon">${m.icon}</span>
                  <span class="goal-metric-name">${m.label}</span>
                  <span class="goal-metric-desc">${m.desc}</span>
                </button>
              `).join('')}
            </div>
            <div class="note-modal-actions" style="margin-top:18px">
              <button data-cancel style="background:#eee;color:#333;border:none">Cancel</button>
              <button class="btn-green" data-next ${!selectedMetric ? 'disabled' : ''}>Next</button>
            </div>
          </div>
        `;

        modal.querySelectorAll('.goal-metric-tile').forEach(tile => {
          tile.addEventListener('click', () => {
            selectedMetric = tile.dataset.metric;
            modal.querySelectorAll('.goal-metric-tile').forEach(t => t.classList.remove('selected'));
            tile.classList.add('selected');
            modal.querySelector('[data-next]').disabled = false;
          });
        });

        modal.querySelector('[data-cancel]').onclick = () => modal.remove();
        modal.querySelector('[data-next]').onclick = () => {
          if (!selectedMetric) return;
          step = 2;
          render();
        };

      } else {
        // Step 2: target + period
        const goalType   = existing?.goal_type   || 'recurring';
        const periodType = existing?.period_type  || 'weekly';
        const today      = new Date().toISOString().slice(0, 10);
        const isMoney    = selectedMetric === 'earnings';

        const metricLabel = METRICS.find(m => m.value === selectedMetric)?.label
                         || existing?.metric_label
                         || selectedMetric;

        modal.innerHTML = `
          <div class="note-modal-card goal-modal-card">
            <div class="goal-modal-header">
              ${!isEdit ? '<span class="goal-modal-step">Step 2 of 2</span>' : ''}
              <h3>${isEdit ? 'Edit Goal' : metricLabel}</h3>
            </div>

            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <label class="goal-modal-label">Target ${isMoney ? '($)' : ''}</label>
                <input type="number" class="goal-input" id="gm-target"
                       placeholder="${isMoney ? 'e.g. 5000' : 'e.g. 50'}"
                       value="${existing?.target_value ?? ''}">
              </div>

              <div>
                <label class="goal-modal-label">Timeframe</label>
                <div class="goal-type-row">
                  <label class="goal-type-option ${goalType === 'recurring' ? 'selected' : ''}" id="gm-type-recurring">
                    <input type="radio" name="gm-type" value="recurring" ${goalType === 'recurring' ? 'checked' : ''}>
                    Repeating
                  </label>
                  <label class="goal-type-option ${goalType === 'one_time' ? 'selected' : ''}" id="gm-type-one_time">
                    <input type="radio" name="gm-type" value="one_time" ${goalType === 'one_time' ? 'checked' : ''}>
                    Date range
                  </label>
                </div>
              </div>

              <div id="gm-period-row" style="${goalType === 'one_time' ? 'display:none' : ''}">
                <label class="goal-modal-label">Repeats</label>
                <div class="goal-period-pills">
                  ${PERIODS.map(p => `
                    <button class="goal-period-pill ${periodType === p.value ? 'selected' : ''}"
                            data-period="${p.value}" type="button">
                      ${p.label}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div id="gm-dates-row" style="${goalType === 'recurring' ? 'display:none' : ''}">
                <label class="goal-modal-label">Date range</label>
                <div style="display:flex;gap:8px">
                  <input type="date" class="goal-input" id="gm-start"
                         value="${existing?.start_date || today}" style="flex:1">
                  <input type="date" class="goal-input" id="gm-end"
                         value="${existing?.end_date || ''}" style="flex:1">
                </div>
              </div>
            </div>

            <div class="note-modal-actions" style="margin-top:18px">
              ${!isEdit
                ? `<button data-back style="background:#eee;color:#333;border:none">Back</button>`
                : `<button data-cancel style="background:#eee;color:#333;border:none">Cancel</button>`
              }
              <button class="btn-green" data-save>Save</button>
            </div>
          </div>
        `;

        // Period pills
        let activePeriod = periodType;
        modal.querySelectorAll('.goal-period-pill').forEach(pill => {
          pill.addEventListener('click', () => {
            activePeriod = pill.dataset.period;
            modal.querySelectorAll('.goal-period-pill').forEach(p => p.classList.remove('selected'));
            pill.classList.add('selected');
          });
        });

        // Type toggle
        modal.querySelectorAll('input[name="gm-type"]').forEach(radio => {
          radio.addEventListener('change', () => {
            const recurring = radio.value === 'recurring';
            modal.querySelector('#gm-period-row').style.display = recurring ? '' : 'none';
            modal.querySelector('#gm-dates-row').style.display  = recurring ? 'none' : '';
            modal.querySelectorAll('.goal-type-option').forEach(el => el.classList.remove('selected'));
            radio.closest('.goal-type-option').classList.add('selected');
          });
        });

        if (!isEdit) {
          modal.querySelector('[data-back]').onclick = () => { step = 1; render(); };
        } else {
          modal.querySelector('[data-cancel]').onclick = () => modal.remove();
        }

        modal.querySelector('[data-save]').onclick = () => {
          const target   = parseFloat(modal.querySelector('#gm-target').value);
          const goalType = modal.querySelector('input[name="gm-type"]:checked').value;
          const start    = modal.querySelector('#gm-start')?.value;
          const end      = modal.querySelector('#gm-end')?.value;

          if (isNaN(target) || target <= 0) { alert('Enter a target value.'); return; }
          if (goalType === 'one_time' && !start) { alert('Enter a start date.'); return; }

          modal.remove();
          onSave({
            metric:       selectedMetric,
            target_value: target,
            goal_type:    goalType,
            period_type:  goalType === 'recurring' ? activePeriod : null,
            start_date:   start || new Date().toISOString().slice(0, 10),
            end_date:     goalType === 'one_time' ? (end || null) : null,
          });
        };
      }
    }

    render();

  } else {
    // Standard edit flow (active metrics)
    const goalType   = existing.goal_type   || 'recurring';
    const periodType = existing.period_type || 'weekly';
    const today      = new Date().toISOString().slice(0, 10);
    const isMoney    = existing.metric === 'earnings';
    const metricLabel = existing.metric_label || existing.metric;

    modal.innerHTML = `
      <div class="note-modal-card goal-modal-card">
        <div class="goal-modal-header">
          <h3>Edit Goal</h3>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="padding:10px 12px;background:#f7f7f7;border-radius:8px;font-size:14px;color:#555">
            ${esc(metricLabel)}
          </div>

          <div>
            <label class="goal-modal-label">Target ${isMoney ? '($)' : ''}</label>
            <input type="number" class="goal-input" id="gm-target"
                   value="${existing.target_value ?? ''}">
          </div>

          <div>
            <label class="goal-modal-label">Timeframe</label>
            <div class="goal-type-row">
              <label class="goal-type-option ${goalType === 'recurring' ? 'selected' : ''}" id="gm-type-recurring">
                <input type="radio" name="gm-type" value="recurring" ${goalType === 'recurring' ? 'checked' : ''}>
                Repeating
              </label>
              <label class="goal-type-option ${goalType === 'one_time' ? 'selected' : ''}" id="gm-type-one_time">
                <input type="radio" name="gm-type" value="one_time" ${goalType === 'one_time' ? 'checked' : ''}>
                Date range
              </label>
            </div>
          </div>

          <div id="gm-period-row" style="${goalType === 'one_time' ? 'display:none' : ''}">
            <label class="goal-modal-label">Repeats</label>
            <div class="goal-period-pills">
              ${PERIODS.map(p => `
                <button class="goal-period-pill ${periodType === p.value ? 'selected' : ''}"
                        data-period="${p.value}" type="button">
                  ${p.label}
                </button>
              `).join('')}
            </div>
          </div>

          <div id="gm-dates-row" style="${goalType === 'recurring' ? 'display:none' : ''}">
            <label class="goal-modal-label">Date range</label>
            <div style="display:flex;gap:8px">
              <input type="date" class="goal-input" id="gm-start"
                     value="${existing.start_date || today}" style="flex:1">
              <input type="date" class="goal-input" id="gm-end"
                     value="${existing.end_date || ''}" style="flex:1">
            </div>
          </div>
        </div>

        <div class="note-modal-actions" style="margin-top:18px">
          <button data-cancel style="background:#eee;color:#333;border:none">Cancel</button>
          <button class="btn-green" data-save>Save</button>
        </div>
      </div>
    `;

    let activePeriod = periodType;
    modal.querySelectorAll('.goal-period-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        activePeriod = pill.dataset.period;
        modal.querySelectorAll('.goal-period-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
      });
    });

    modal.querySelectorAll('input[name="gm-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const recurring = radio.value === 'recurring';
        modal.querySelector('#gm-period-row').style.display = recurring ? '' : 'none';
        modal.querySelector('#gm-dates-row').style.display  = recurring ? 'none' : '';
        modal.querySelectorAll('.goal-type-option').forEach(el => el.classList.remove('selected'));
        radio.closest('.goal-type-option').classList.add('selected');
      });
    });

    modal.querySelector('[data-cancel]').onclick = () => modal.remove();
    modal.querySelector('[data-save]').onclick = () => {
      const target   = parseFloat(modal.querySelector('#gm-target').value);
      const goalType = modal.querySelector('input[name="gm-type"]:checked').value;
      const start    = modal.querySelector('#gm-start')?.value;
      const end      = modal.querySelector('#gm-end')?.value;

      if (isNaN(target) || target <= 0) { alert('Enter a target value.'); return; }

      modal.remove();
      onSave({
        metric:       existing.metric,
        target_value: target,
        goal_type:    goalType,
        period_type:  goalType === 'recurring' ? activePeriod : null,
        start_date:   start || new Date().toISOString().slice(0, 10),
        end_date:     goalType === 'one_time' ? (end || null) : null,
      });
    };
  }

  document.body.appendChild(modal);
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