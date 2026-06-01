export function ListCard({ className = '', children } = {}) {
  const el = document.createElement('div');
  el.className = ['list-card', className].filter(Boolean).join(' ');
  if (typeof children === 'string') el.innerHTML = children;
  else if (children) el.append(...[].concat(children));
  return el;
}

export function ListCardRow({ body, aside, center = false, stackAside = false } = {}) {
  const row = document.createElement('div');
  row.className = ['list-card-row', center && 'list-card-row--center'].filter(Boolean).join(' ');

  const bodyEl = document.createElement('div');
  bodyEl.className = 'list-card-body';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.appendChild(body);
  row.appendChild(bodyEl);

  if (aside) {
    const asideEl = document.createElement('div');
    asideEl.className = ['list-card-aside', stackAside && 'list-card-aside--stack'].filter(Boolean).join(' ');
    if (typeof aside === 'string') asideEl.innerHTML = aside;
    else asideEl.appendChild(aside);
    row.appendChild(asideEl);
  }
  return row;
}
