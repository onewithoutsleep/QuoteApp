export function Button({
  label,
  type = 'button',
  variant = 'primary',
  className = '',
  attrs = {},
} = {}) {
  const btn = document.createElement('button');
  btn.type = type;
  const variants = {
    primary: 'btn btn-primary',
    secondary: 'btn btn-secondary',
    danger: 'btn btn-danger',
    outline: 'btn btn-outline',
    green: 'btn btn-green',
    link: 'btn-link',
  };
  btn.className = [variants[variant] || 'btn', className].filter(Boolean).join(' ');
  btn.textContent = label;
  Object.entries(attrs).forEach(([key, val]) => {
    if (val != null) btn.setAttribute(key, val);
  });
  return btn;
}
