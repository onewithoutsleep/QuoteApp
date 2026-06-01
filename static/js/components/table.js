export function Table({ className = 'table', headers = [], rows = [] } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'table-responsive';

  const table = document.createElement('table');
  table.className = ['table', className].filter(Boolean).join(' ');

  if (headers.length) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach((h) => {
      const th = document.createElement('th');
      if (typeof h === 'string') th.textContent = h;
      else th.appendChild(h);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  rows.forEach((cells) => {
    const tr = document.createElement('tr');
    cells.forEach((cell) => {
      const td = document.createElement('td');
      if (typeof cell === 'string') td.innerHTML = cell;
      else td.appendChild(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}
