import { BottomSheet } from './sheet.js';

export function openPhoneSheet(rawPhone, digits) {
  return BottomSheet({
    body: `
      <div class="sheet-title">${rawPhone}</div>
      <a href="tel:${digits}" class="sheet-action sheet-action--call">Call</a>
      <a href="sms:${digits}" class="sheet-action sheet-action--text">Text</a>
      <button type="button" class="sheet-cancel-btn">Cancel</button>`,
  });
}

export function bindPhoneLink(el, rawPhone, digits) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    openPhoneSheet(rawPhone, digits);
  });
}
