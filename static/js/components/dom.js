export function escapeHtml(value) {
  if (value == null) return '';
  const el = document.createElement('div');
  el.textContent = String(value);
  return el.innerHTML;
}

export function escAttr(value) {
  if (value == null) return '';
  return String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function capitalize(value) {
  const s = value != null ? String(value) : '';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
