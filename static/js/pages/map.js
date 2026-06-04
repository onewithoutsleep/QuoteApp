import * as api from '../api.js';
import { renderNav } from '../components/nav.js';

let mapInstance = null;
let mapCleanup = [];

export const mapPage = {
  async mount({ root, slots, navigate }) {
    renderNav(slots.nav, 'map');
    document.body.classList.add('map-active');

    const highlight = new URLSearchParams(location.hash.split('?')[1] || '').get('highlight');

    root.innerHTML = '<div id="map"></div>';

    try {
      const data = await api.getMapData();
      initMap(root.querySelector('#map'), data, highlight, navigate);
    } catch (err) {
      root.innerHTML = '<div class="container"><p>Failed to load map.</p></div>';
      console.error(err);
    }
  },
  unmount() {
    document.body.classList.remove('map-active');
    document.querySelector('.map-controls')?.remove();
    document.querySelector('.map-legend')?.remove();
    document.querySelector('.map-knock-banner')?.remove();
    mapCleanup.forEach((fn) => fn());
    mapCleanup = [];
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  },
};

/* ── SVG icons ──────────────────────────────────────────────── */
const ICONS = {
  legend:  `<svg viewBox="0 0 24 24"><path d="M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zM3 17h2v2H3zm4 0h14v2H7z"/></svg>`,
  locate:  `<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>`,
  knock:   `<svg viewBox="0 0 24 24"><path d="M6 2h10a2 2 0 0 1 2 2v18H6V2zm2 2v16h8V4H8zm5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>`,
  zoomIn:  `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2V7z"/></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>`,
  layers:  `<svg viewBox="0 0 24 24"><path d="M11.99 18.54L4.62 12.81l-2.61 2.05L12 21l9.99-6.14-2.62-2.05-7.38 5.73zM12 16l7.36-5.73L22 8.14 12 2 2 8.14l2.63 2.13L12 16z"/></svg>`,
};

function mkCtrlBtn(iconHtml, title, onClick) {
  const btn = document.createElement('button');
  btn.className = 'map-ctrl-btn';
  btn.setAttribute('aria-label', title);
  btn.title = title;
  btn.innerHTML = iconHtml;
  btn.addEventListener('click', onClick);
  return btn;
}

function time12(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${mStr} ${h < 12 ? 'AM' : 'PM'}`;
}

/* ── Marker color ───────────────────────────────────────────── */
function markerColor(h) {
  if (h.service_id)                   return 'green';
  if (h.quote_id)                     return '#2d89ef';
  if (h.outcome === 'not_interested') return 'red';
  if (h.outcome === 'no_answer')      return '#888';
  return '#e67e22';
}

/* ── Popup HTML ─────────────────────────────────────────────── */
/*
  knockMode=true and house has no quote/service → show outcome chooser view.
  Otherwise show the standard view.
  After an outcome is chosen, the popup re-renders into standard view.
*/
function knockChooserHtml(h) {
  const knockLine = h.knocked_at
    ? `<div class="map-popup-meta">Knocked ${h.knocked_at}</div>` : '';
  const noteHtml  = h.outcome
    ? `<div class="map-popup-meta outcome-label">${outcomeLabel(h.outcome)}</div>` : '';

  return `
    <div class="map-popup">
      <div class="map-popup-header">${h.address || 'No address'}</div>
      <div class="map-popup-body">${knockLine}${noteHtml}</div>
      <div class="map-popup-actions">
        <button class="btn-gray"  data-knock="no_answer">No answer</button>
        <button class="btn-red"   data-knock="not_interested">Not interested</button>
        <button class="btn-green" data-knock="add_quote">Add quote</button>
        <button class="btn-orange" data-knock="add_note">Add note</button>
        <button class="btn-full delete-knock" data-knock="delete">Delete</button>
      </div>
    </div>`;
}

function standardPopupHtml(h) {
  const knockLine    = h.knocked_at
    ? `<div class="map-popup-meta">Knocked ${h.knocked_at}</div>` : '';
  const customerLine = h.quote_id && h.customer
    ? `<div class="map-popup-meta">${h.customer}</div>` : '';
  const outcomeLine  = h.outcome && !h.quote_id
    ? `<div class="map-popup-meta outcome-label">${outcomeLabel(h.outcome)}</div>` : '';
  const noteLine     = h.note
    ? `<div class="map-popup-note">${h.note}</div>` : '';
  const bookingLine  = h.service_id && h.service_date
    ? `<div class="map-popup-booking">Booked: ${h.service_date}${h.service_time ? ' at ' + time12(h.service_time) : ''}</div>`
    : '';
  const editStatusBtn = !h.quote_id && !h.service_id
    ? `<button class="" data-edit-status>Edit status</button>`
    : '';

  let buttons = '';
  if (h.service_id) {
    buttons = `<button data-go="quote-edit">Edit quote</button>
               <button class="btn-green" data-go="service-edit">Edit booking</button>`;
  } else if (h.quote_id) {
    buttons = `<button data-go="quote-edit">Edit quote</button>
               <button class="btn-green" data-go="service-new">Book service</button>`;
  } else {
    buttons = `<button class="btn-green" data-go="quote-new">Add quote</button>`;
  }
  const deleteBtn = !h.quote_id
    ? `<button class="btn-red" data-delete>Delete</button>` : '';
  const moveBtn = `<button class="btn-orange" data-move>Move pin</button>`;

  return `
    <div class="map-popup">
      <div class="map-popup-header">${h.address || 'No address'}</div>
      <div class="map-popup-body">${knockLine}${customerLine}${bookingLine}${outcomeLine}${noteLine}</div>
      <div class="map-popup-actions">${buttons}${moveBtn}${editStatusBtn}${deleteBtn}</div>
    </div>`;
}

function outcomeLabel(outcome) {
  return outcome === 'no_answer' ? 'No answer' :
         outcome === 'not_interested' ? 'Not interested' : '';
}

function openNoteModal(initialValue = '', onSave) {
  const modal = document.createElement('div');

  modal.className = 'note-modal';

  modal.innerHTML = `
    <div class="note-modal-card">
      <textarea>${initialValue}</textarea>

      <div class="note-modal-actions">
        <button data-cancel>Cancel</button>
        <button class="btn-green" data-save>Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('[data-cancel]').onclick = () => {
    modal.remove();
  };

  modal.querySelector('[data-save]').onclick = () => {
    const value = modal.querySelector('textarea').value.trim();
    modal.remove();
    onSave(value);
  };
}

/* ── Main map init ──────────────────────────────────────────── */
function initMap(el, data, highlightId, navigate) {
  const houses       = data.houses || [];
  const fallbackCenter = data.fallback_center || [51.130218, -114.205008];

  const map = L.map(el, { maxZoom: 20, zoomControl: false }).setView(fallbackCenter, 18);
  mapInstance = map;

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 25 });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxNativeZoom: 19, maxZoom: 25 }
  );
  street.addTo(map);

  let moveMode        = false;
  let selectedMarker  = null;
  let selectedHouseId = null;
  let knockMode       = false;
  let legendVisible   = false;
  let currentLayer    = 'street';
  const markerRegistry = {};

  /* ── Legend ─────────────────────────────────────────────── */
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = `
    <div class="map-legend-title">Legend</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#888"></div>No answer</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:red"></div>Not interested</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#2d89ef"></div>Quote saved</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#27ae60"></div>Booked</div>`;
  document.body.appendChild(legend);

  /* ── Knock banner ───────────────────────────────────────── */
  const knockBanner = document.createElement('div');
  knockBanner.className = 'map-knock-banner';
  knockBanner.textContent = 'Knock mode — tap a house';
  document.body.appendChild(knockBanner);

  /* ── Controls ───────────────────────────────────────────── */
  const controls = document.createElement('div');
  controls.className = 'map-controls';

  const group1 = document.createElement('div');
  group1.className = 'map-ctrl-group';

  const legendBtn = mkCtrlBtn(ICONS.legend, 'Toggle legend', () => {
    legendVisible = !legendVisible;
    legend.classList.toggle('visible', legendVisible);
    legendBtn.classList.toggle('active', legendVisible);
  });

  const locateBtn = mkCtrlBtn(ICONS.locate, 'My location', () => {
    if (!navigator.geolocation) return;
    locateBtn.classList.add('active');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 18);
        locateBtn.classList.remove('active');
      },
      () => locateBtn.classList.remove('active'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  const knockBtn = mkCtrlBtn(ICONS.knock, 'Knock mode', () => {
    knockMode = !knockMode;
    knockBtn.classList.toggle('active', knockMode);
    knockBanner.classList.toggle('visible', knockMode);
    // Re-open any open popup so it shows the correct view
    map.closePopup();
  });

  group1.appendChild(legendBtn);
  group1.appendChild(locateBtn);
  group1.appendChild(knockBtn);

  const group2 = document.createElement('div');
  group2.className = 'map-ctrl-group';
  group2.appendChild(mkCtrlBtn(ICONS.zoomIn,  'Zoom in',  () => map.zoomIn()));
  group2.appendChild(mkCtrlBtn(ICONS.zoomOut, 'Zoom out', () => map.zoomOut()));

  const group3 = document.createElement('div');
  group3.className = 'map-ctrl-group';
  const layersBtn = mkCtrlBtn(ICONS.layers, 'Toggle layer', () => {
    if (currentLayer === 'street') {
      map.removeLayer(street); satellite.addTo(map);
      currentLayer = 'satellite'; layersBtn.classList.add('active');
    } else {
      map.removeLayer(satellite); street.addTo(map);
      currentLayer = 'street'; layersBtn.classList.remove('active');
    }
  });
  group3.appendChild(layersBtn);

  controls.appendChild(group1);
  controls.appendChild(group2);
  controls.appendChild(group3);
  document.body.appendChild(controls);

  mapCleanup.push(() => {
    controls.remove();
    legend.remove();
    knockBanner.remove();
  });

  /* ── Geolocation watch ──────────────────────────────────── */
  let locationDot    = null;
  let accuracyCircle = null;
  let firstFix       = true;

  if (navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!locationDot) {
          locationDot = L.circleMarker([lat, lng], {
            radius: 10, color: '#fff', weight: 2, fillColor: '#2d89ef', fillOpacity: 1, interactive: false,
          }).addTo(map);
          accuracyCircle = L.circle([lat, lng], {
            radius: accuracy, color: '#2d89ef', weight: 1, fillColor: '#2d89ef', fillOpacity: 0.1, interactive: false,
          }).addTo(map);
        } else {
          locationDot.setLatLng([lat, lng]);
          accuracyCircle.setLatLng([lat, lng]);
          accuracyCircle.setRadius(accuracy);
        }
        if (firstFix) {
          if (!highlightId) map.setView([lat, lng], 18);
          firstFix = false;
        }
      },
      (err) => console.warn('Geolocation error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    mapCleanup.push(() => navigator.geolocation.clearWatch(watchId));
  }

  /* ── Move marker ────────────────────────────────────────── */
  async function doMove(houseId, marker, lat, lng) {
    try {
      const form = new FormData();
      form.append('lat', lat);
      form.append('lng', lng);
      const result = await api.moveHouse(houseId, form);
      if (result?.status === 'ok') marker.setLatLng([lat, lng]);
    } catch (err) { console.error('Move error:', err); }
    moveMode = false; selectedMarker = null; selectedHouseId = null;
  }

  function toggleMoveMode(houseId, marker) {
    if (moveMode && selectedHouseId === houseId) {
      moveMode = false; selectedMarker = null; selectedHouseId = null;
      map.closePopup(); return;
    }
    moveMode = true; selectedMarker = marker; selectedHouseId = houseId;
    map.closePopup();
  }

  /* ── Delete house ───────────────────────────────────────── */
  async function deleteHouse(id, marker) {
    try {
      const result = await api.deleteHouse(id);
      if (result?.status === 'deleted') {
        map.removeLayer(marker);
      } else if (result?.status === 'has_quote') {
        alert('This house has a quote attached. Delete the quote first.');
      }
    } catch (err) { console.error('Delete error:', err); }
  }

  /* ── Apply outcome to a house object + marker ───────────── */
  async function applyOutcome(houseData, marker, outcome, note) {
    try {
      const body = { outcome, note: note || null };
      const result = await api.updateHouseOutcome(houseData.id, body);
      if (result?.status === 'ok') {
        houseData.outcome = result.outcome;
        houseData.note    = result.note;
        const color = markerColor(houseData);
        marker.setStyle({ color });
      }
    } catch (err) { console.error('Outcome error:', err); }
  }

  /* ── Build and bind a marker ────────────────────────────── */
  function buildMarker(houseData) {
    const isHighlighted = highlightId && String(houseData.id) === String(highlightId);
    const marker = L.circle([houseData.lat, houseData.lng], {
      color:       markerColor(houseData),
      radius:      5,
      fillOpacity: 0.75,
      weight:      2,
    }).addTo(map);

    markerRegistry[houseData.id] = marker;

    // Decide which popup view to show on open
    marker._statusEditMode = false;

    function currentPopupHtml() {
      if (marker._statusEditMode) {
        return knockChooserHtml(houseData);
      }
      return standardPopupHtml(houseData);
    }

    marker.bindPopup(currentPopupHtml(), { maxWidth: 280 });

    // Refresh popup content each time it opens so knock mode is respected
    marker.on('popupopen', () => {
      marker.setPopupContent(currentPopupHtml());
      bindPopupEvents(marker, houseData);
    });

    if (isHighlighted) marker.openPopup();

    return marker;
  }

  /* ── Wire up popup button events ────────────────────────── */
  function bindPopupEvents(marker, houseData) {
    if (moveMode) return;
    const el = marker.getPopup().getElement();
    if (!el) return;

    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);

    // Standard actions
    el.querySelector('[data-delete]')?.addEventListener('click', () => deleteHouse(houseData.id, marker));
    el.querySelector('[data-move]')?.addEventListener('click', () => toggleMoveMode(houseData.id, marker));
    el.querySelector('[data-go="quote-edit"]')?.addEventListener('click', () => navigate(`#/quote/${houseData.quote_id}/edit`));
    el.querySelector('[data-go="service-edit"]')?.addEventListener('click', () => navigate(`#/service/${houseData.service_id}/edit`));
    el.querySelector('[data-go="service-new"]')?.addEventListener('click', () => navigate(`#/services/new/${houseData.quote_id}`));
    el.querySelector('[data-go="quote-new"]')?.addEventListener('click', () => navigate(`#/quotes/new?house_id=${houseData.id}`));
    el.querySelector('[data-edit-status]')?.addEventListener('click', () => {
      marker._statusEditMode = true;
      marker.setPopupContent(knockChooserHtml(houseData));
      bindPopupEvents(marker, houseData);
    });

    // Knock chooser actions
    el.querySelectorAll('[data-knock]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const choice = btn.dataset.knock;
        if (choice === 'delete') {
          deleteHouse(houseData.id, marker);
          return;
        }
        if (choice === 'add_quote') { navigate(`#/quotes/new?house_id=${houseData.id}`); return; }
        if (choice === 'add_note') {
          openNoteModal(houseData.note || '', async (note) => {
            await applyOutcome(
              houseData,
              marker,
              houseData.outcome,
              note
            );
            marker._statusEditMode = false;
            map.closePopup();
          });
          return;
        }
        // no_answer or not_interested
        await applyOutcome(houseData, marker, choice, houseData.note || null);
        marker._statusEditMode = false;
        map.closePopup();
      });
    });
  }

  /* ── Render existing houses ─────────────────────────────── */
  houses.forEach((h) => {
    if (h.lat == null || h.lng == null || isNaN(h.lat) || isNaN(h.lng)) return;
    const marker = buildMarker(h);
    if (highlightId && String(h.id) === String(highlightId)) {
      map.setView([h.lat, h.lng], 19);
      marker.openPopup();
    }
  });

  /* ── Map click: add new house ───────────────────────────── */
  map.on('click', async (e) => {
    if (moveMode && selectedMarker && selectedHouseId) {
      await doMove(selectedHouseId, selectedMarker, e.latlng.lat, e.latlng.lng);
      return;
    }
    if (moveMode) return;
    if (!knockMode) return;

    try {
      const { lat, lng } = e.latlng;
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`
      );
      if (!geoRes.ok) return;
      const geoData = await geoRes.json();
      const houseNumber = geoData.address?.house_number || '';
      const road = geoData.address?.road || geoData.address?.pedestrian || geoData.address?.footway || geoData.address?.path || '';
      if (!road) return;

      const address  = `${houseNumber} ${road}`.trim();
      const realLat  = parseFloat(geoData.lat);
      const realLng  = parseFloat(geoData.lon);
      if (isNaN(realLat) || isNaN(realLng)) return;

      const form = new FormData();
      form.append('lat', realLat);
      form.append('lng', realLng);
      form.append('address', address);
      const result = await api.addHouse(form);
      if (!result || result.status === 'exists') return;

      const houseData = {
        id: result.id, address: result.address || address,
        knocked_at: result.knocked_at, outcome: null, note: null,
        lat: realLat, lng: realLng,
        quote_id: null, service_id: null,
      };
      const marker = buildMarker(houseData);
      marker._statusEditMode = true;
      marker.openPopup();
    } catch (err) {
      console.error('Map click error:', err);
    }
  });
}