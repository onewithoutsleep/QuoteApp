import { Button } from './button.js';

export function ActionBar(actions, { bordered = true } = {}) {
  const bar = document.createElement('div');
  bar.className = ['action-bar', bordered && 'action-bar--bordered'].filter(Boolean).join(' ');
  actions.forEach(({ label, variant = 'primary', onClick, attrs = {} }) => {
    const btn = Button({ label, variant, attrs });
    if (onClick) btn.addEventListener('click', onClick);
    bar.appendChild(btn);
  });
  return bar;
}
