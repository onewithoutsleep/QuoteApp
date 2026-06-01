export function BottomSheet({ body, onDismiss } = {}) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';

  const sheetBody = document.createElement('div');
  sheetBody.className = 'sheet-body';
  if (typeof body === 'string') sheetBody.innerHTML = body;
  else if (body) sheetBody.appendChild(body);
  sheet.appendChild(sheetBody);

  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet) {
      sheet.remove();
      onDismiss?.();
    }
  });

  const cancelBtn = sheetBody.querySelector('.sheet-cancel-btn');
  cancelBtn?.addEventListener('click', () => {
    sheet.remove();
    onDismiss?.();
  });

  document.body.appendChild(sheet);
  return sheet;
}
