import { escapeHtml, escAttr } from './dom.js';

export function FormField({ label, name, type = 'text', value = '', placeholder = '', required = false, attrs = {} } = {}) {
  const group = document.createElement('div');
  group.className = 'form-group';

  if (label) {
    const lbl = document.createElement('label');
    lbl.className = 'field-label';
    lbl.htmlFor = name || undefined;
    lbl.textContent = label;
    group.appendChild(lbl);
  }

  let input;
  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.name = name;
    input.textContent = value != null ? String(value) : '';
  } else {
    input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = value != null ? String(value) : '';
  }
  input.className = type === 'textarea' ? '' : 'input';
  if (placeholder) input.placeholder = placeholder;
  if (required) input.required = true;
  Object.entries(attrs).forEach(([key, val]) => {
    if (val != null) input.setAttribute(key, val);
  });
  group.appendChild(input);
  return group;
}

export function FormLabel(text) {
  const lbl = document.createElement('label');
  lbl.className = 'field-label';
  lbl.textContent = text;
  return lbl;
}

export function hiddenInput(name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value != null ? String(value) : '';
  return input;
}

export function optionChipGroup({ name, options, selected, groupClass = 'found-via-group', chipClass = 'found-via-option' }) {
  const group = document.createElement('div');
  group.className = groupClass;
  group.id = group.id || `${name}-group`;

  options.forEach((opt) => {
    const val = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
    const lbl = document.createElement('label');
    lbl.className = `${chipClass}${selected === val ? ' selected' : ''}`;
    lbl.innerHTML = `<input type="radio" name="${escapeHtml(name)}" value="${escAttr(val)}" ${selected === val ? 'checked' : ''}> ${escapeHtml(label)}`;
    group.appendChild(lbl);
  });
  return group;
}
