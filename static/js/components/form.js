import { escapeHtml, escAttr } from './dom.js';

export function FormLabel(text) {
  const lbl = document.createElement('label');
  lbl.className = 'field-label';
  lbl.textContent = text;
  return lbl;
}

export function chipField(label, group) {
  const wrap = document.createElement('div');
  wrap.className = 'form-group';
  wrap.append(FormLabel(label), group);
  return wrap;
}

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
    if (type !== 'hidden') input.className = 'input';
  }
  if (placeholder) input.placeholder = placeholder;
  if (required) input.required = true;
  Object.entries(attrs).forEach(([key, val]) => {
    if (val != null) input.setAttribute(key, val);
  });
  group.appendChild(input);
  return group;
}

export function optionChipGroup({ name, options, selected, thirds = false }) {
  const group = document.createElement('div');
  group.className = ['option-group', thirds && 'option-group--thirds'].filter(Boolean).join(' ');
  options.forEach((opt) => {
    const val = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : (opt.label || opt.value);
    const lbl = document.createElement('label');
    lbl.className = `option-chip${selected === val ? ' selected' : ''}`;
    lbl.innerHTML = `<input type="radio" name="${escapeHtml(name)}" value="${escAttr(val)}" ${selected === val ? 'checked' : ''}> ${escapeHtml(label)}`;
    group.appendChild(lbl);
  });
  return group;
}

export function Form({ id, fields = [], actions = [] }) {
  const form = document.createElement('form');
  if (id) form.id = id;
  fields.forEach((f) => {
    if (typeof f === 'string') {
      form.insertAdjacentHTML('beforeend', f);
    } else {
      form.appendChild(f);
    }
  });
  if (actions.length) {
    const bar = document.createElement('div');
    bar.className = 'form-actions';
    actions.forEach((a) => bar.appendChild(a));
    form.appendChild(bar);
  }
  return form;
}
