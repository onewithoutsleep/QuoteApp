const VARIANT_CLASS = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  danger: 'btn btn-danger',
  success: 'btn btn-success',
  outline: 'btn btn-outline',
  link: 'btn-link',
  sm: 'btn btn-sm btn-ghost--success',
  icon: 'btn btn-icon',
  'icon-success': 'btn btn-icon btn-icon--success',
  ghost: 'btn btn-ghost',
};

export function Button({ label, type = 'button', variant = 'primary', className = '', attrs = {} } = {}) {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = [VARIANT_CLASS[variant] || VARIANT_CLASS.primary, className].filter(Boolean).join(' ');
  btn.textContent = label;
  Object.entries(attrs).forEach(([key, val]) => {
    if (val != null) btn.setAttribute(key, val);
  });
  return btn;
}
