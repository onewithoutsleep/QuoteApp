export function fmtPrice(n) {
  const v = parseFloat(n);
  if (isNaN(v)) return '—';
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}

export function time12(value) {
  if (!value) return '';
  try {
    const [hStr, mStr] = value.split(':');
    const h = parseInt(hStr, 10);
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${ampm}`;
  } catch {
    return value;
  }
}

export function fmtPhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function fmtDate(value) {
  if (!value) return '';
  try {
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[dt.getDay()]} ${months[m - 1]} ${d}, ${y}`;
  } catch {
    return value;
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function handlePhone(e, rawPhone, digits) {
  e.preventDefault();
  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-title">${rawPhone}</div>
      <a href="tel:${digits}" class="sheet-action sheet-action--call">Call</a>
      <a href="sms:${digits}" class="sheet-action sheet-action--text">Text</a>
      <button type="button" class="sheet-cancel-btn">Cancel</button>
    </div>`;
  sheet.querySelector('.sheet-cancel-btn').addEventListener('click', () => sheet.remove());
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}

export function bindRadioGroup(container) {
  container.querySelectorAll('.found-via-option input, .cat-opt input').forEach((radio) => {
    radio.addEventListener('change', () => {
      const labelClass = radio.closest('.cat-opt') ? '.cat-opt' : '.found-via-option';
      container.querySelectorAll(labelClass).forEach((l) => l.classList.remove('selected'));
      radio.closest('label')?.classList.add('selected');
    });
  });
}

export function serviceTimeTo24(hour, min, ampm) {
  if (!hour) return '';
  const h24 = parseInt(hour, 10) % 12 + (ampm === 'PM' ? 12 : 0);
  return `${h24.toString().padStart(2, '0')}:${min || '00'}`;
}

export function parseTime24(t) {
  if (!t || !t.includes(':')) {
    return { hour: '12', min: '00', ampm: 'AM' };
  }
  const [hStr, mStr] = t.split(':');
  const h24 = parseInt(hStr, 10);
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const hour = String(h24 % 12 || 12).padStart(2, '0');
  return { hour, min: (mStr || '00').slice(0, 2), ampm };
}
