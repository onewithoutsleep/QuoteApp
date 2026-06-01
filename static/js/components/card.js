export function Card({ className = '', header, body, footer } = {}) {
  const card = document.createElement('div');
  card.className = ['card', className].filter(Boolean).join(' ');

  if (header) {
    const headerEl = document.createElement('div');
    headerEl.className = 'card-header';
    if (typeof header === 'string') headerEl.innerHTML = header;
    else headerEl.appendChild(header);
    card.appendChild(headerEl);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'card-body';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  card.appendChild(bodyEl);

  if (footer) {
    const footerEl = document.createElement('div');
    footerEl.className = 'card-footer';
    if (typeof footer === 'string') footerEl.innerHTML = footer;
    else footerEl.appendChild(footer);
    card.appendChild(footerEl);
  }

  return card;
}
