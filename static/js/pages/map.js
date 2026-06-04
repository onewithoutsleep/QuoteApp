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
    // Remove injected UI
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

/* ── SVG icons ────────────────────────────────────────────── */
const ICONS = {
  legend: `<svg viewBox="0 0 24 24"><path d="M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zM3 17h2v2H3zm4 0h14v2H7z"/></svg>`,
  locate: `<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>`,
  knock: `<svg viewBox="0 0 24 24"><path d="M6.5 10h-2v7h2v-7zm6 0h-2v7h2v-7zm8.5 9H2v2h19v-2zm-2.5-9h-2v7h2v-7zM11.5 1L2 6v2h19V6l-9.5-5z"/></svg>`,
  zoomIn: `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm.5-7H9v2H7v1h2v2h1v-2h2V9h-2V7z"/></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>`,
  layers: `<svg viewBox="0 0 24 24"><path d="M11.99 18.54L4.62 12.81l-2.61 2.05L12 21l9.99-6.14-2.62-2.05-7.38 5.73zM12 16l7.36-5.73L22 8.14 12 2 2 8.14l2.63 2.13L12 16z"/></svg>`,
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

/* ── Helper ────────────────────────────────────────────────── */
function time12(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${mStr} ${ampm}`;
}

/* ── Knock action sheet ────────────────────────────────────── */
function showKnockSheet(house, onChoice) {
  const sheet = document.createElement('div');
  sheet.className = 'map-knock-sheet';
  sheet.innerHTML = `
    <div class="map-knock-sheet-body">
      <div class="map-knock-sheet-handle"></div>
      <div class="map-knock-sheet-address">${house.address || 'Unknown address'}</div>
      <div class="map-knock-sheet-sub">What happened at this door?</div>
      <button class="map-knock-sheet-btn opt-no-answer" data-choice="no_answer">
        <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
        No answer
      </button>
      <button class="map-knock-sheet-btn opt-not-interested" data-choice="not_interested">
        <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>
        Not interested
      </button>
      <button class="map-knock-sheet-btn opt-add-quote" data-choice="add_quote">
        <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
        Add quote
      </button>
      <button class="map-knock-sheet-btn opt-add-note" data-choice="add_note">
        <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        Add note
      </button>
      <button class="map-knock-sheet-btn opt-cancel" data-choice="cancel">Cancel</button>
    </div>`;

  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-choice]');
    if (btn) {
      sheet.remove();
      onChoice(btn.dataset.choice);
    } else if (e.target === sheet) {
      sheet.remove();
      onChoice('cancel');
    }
  });

  document.body.appendChild(sheet);
}

/* ── Note prompt (simple inline prompt; replace with your sheet if preferred) */
function promptNote(cb) {
  const note = window.prompt('Add a note:');
  if (note !== null) cb(note.trim());
}

/* ── Main map init ─────────────────────────────────────────── */
function initMap(el, data, highlightId, navigate) {
  const houses = data.houses || [];
  const fallbackCenter = data.fallback_center || [51.130218, -114.205008];

  const map = L.map(el, { maxZoom: 20, zoomControl: false }).setView(fallbackCenter, 18);
  mapInstance = map;

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 25 });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxNativeZoom: 19, maxZoom: 25 }
  );
  street.addTo(map);

  // ── State ──────────────────────────────────────────────────
  let moveMode = false;
  let selectedMarker = null;
  let selectedHouseId = null;
  let knockMode = false;
  let legendVisible = false;
  let currentLayer = 'street';
  const markerRegistry = {};

  // ── Legend ─────────────────────────────────────────────────
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = `
    <div class="map-legend-title">Legend</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#c0392b"></div>Not knocked</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#888"></div>No answer</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#e67e22"></div>Not interested</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#2d89ef"></div>Quote saved</div>
    <div class="map-legend-item"><div class="map-legend-dot" style="background:#27ae60"></div>Booked</div>`;
  document.body.appendChild(legend);

  // ── Knock banner ───────────────────────────────────────────
  const knockBanner = document.createElement('div');
  knockBanner.className = 'map-knock-banner';
  knockBanner.textContent = 'Knock mode — tap a house';
  document.body.appendChild(knockBanner);

  // ── Controls panel ─────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className = 'map-controls';

  // Group 1: legend + locate + knock
  const group1 = document.createElement('div');
  group1.className = 'map-ctrl-group';

  const legendBtn = mkCtrlBtn(ICONS.legend, 'Toggle legend', () => {
    legendVisible = !legendVisible;
    legend.classList.toggle('visible', legendVisible);
    legendBtn.classList.toggle('active', legendVisible);
  });

  let locationDot = null;
  let accuracyCircle = null;
  let firstFix = true;

  const locateBtn = mkCtrlBtn(ICONS.locate, 'My location', () => {
    if (!navigator.geolocation) return;
    locateBtn.classList.add('active');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        map.setView([lat, lng], 18);
        locateBtn.classList.remove('active');
      },
      () => locateBtn.classList.remove('active'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  const knockBtn = mkCtrlBtn(ICONS.knock, 'Knock mode', () => {
    knockMode = !knockMode;
    knockBtn.classList.toggle('active', knockMode);
    // knockBtn.classList.toggle('knock-active', knockMode);
    knockBanner.classList.toggle('visible', knockMode);
  });

  group1.appendChild(legendBtn);
  group1.appendChild(locateBtn);
  group1.appendChild(knockBtn);

  // Group 2: zoom +/-
  const group2 = document.createElement('div');
  group2.className = 'map-ctrl-group';

  const zoomInBtn  = mkCtrlBtn(ICONS.zoomIn,  'Zoom in',  () => map.zoomIn());
  const zoomOutBtn = mkCtrlBtn(ICONS.zoomOut, 'Zoom out', () => map.zoomOut());

  group2.appendChild(zoomInBtn);
  group2.appendChild(zoomOutBtn);

  // Group 3: layer toggle
  const group3 = document.createElement('div');
  group3.className = 'map-ctrl-group';

  const layersBtn = mkCtrlBtn(ICONS.layers, 'Toggle layer', () => {
    if (currentLayer === 'street') {
      map.removeLayer(street);
      satellite.addTo(map);
      currentLayer = 'satellite';
      layersBtn.classList.add('active');
    } else {
      map.removeLayer(satellite);
      street.addTo(map);
      currentLayer = 'street';
      layersBtn.classList.remove('active');
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

  // ── Geolocation watch ──────────────────────────────────────
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

  // ── Marker color helper ─────────────────────────────────────
  function markerColor(h) {
    if (h.service_id)    return 'green';
    if (h.quote_id)      return '#2d89ef';
    if (h.outcome === 'no_answer')      return '#888';
    if (h.outcome === 'not_interested') return '#e67e22';
    return 'red';
  }

  // ── Popup HTML ─────────────────────────────────────────────
  function popupHtml(h) {
    const knockLine    = h.knocked_at ? `<div class="map-popup-meta">Knocked ${h.knocked_at}</div>` : '';
    const customerLine = h.quote_id && h.customer ? `<div class="map-popup-meta">${h.customer}</div>` : '';
    const noteLine     = h.note ? `<div class="map-popup-note">${h.note}</div>` : '';
    const bookingLine  = h.service_id && h.service_date
      ? `<div class="map-popup-booking">Booked: ${h.service_date}${h.service_time ? ' at ' + time12(h.service_time) : ''}</div>`
      : '';

    let buttons = '';
    if (h.service_id) {
      buttons = `<button data-go="quote-edit">Edit quote</button>
                 <button class="btn-green" data-go="service-edit">Edit booking</button>`;
    } else if (h.quote_id) {
      buttons = `<button data-go="quote-edit">Edit quote</button>
                 <button class="btn-green" data-go="service-new">Book service</button>`;
    } else {
      buttons = `<button class="btn-green btn-full" data-go="quote-new">Add quote</button>`;
    }
    const deleteBtn = !h.quote_id
      ? `<button class="btn-red" data-delete>Delete</button>` : '';
    const moveBtn   = `<button class="btn-orange" data-move>Move pin</button>`;

    return `
      <div class="map-popup">
        <div class="map-popup-header">${h.address || 'No address'}</div>
        <div class="map-popup-body">${knockLine}${customerLine}${bookingLine}${noteLine}</div>
        <div class="map-popup-actions">${buttons}${deleteBtn}${moveBtn}</div>
      </div>`;
  }

  // ── Move marker ────────────────────────────────────────────
  async function moveMarker(houseId, marker, lat, lng) {
    try {
      const form = new FormData();
      form.append('lat', lat);
      form.append('lng', lng);
      const result = await api.moveHouse(houseId, form);
      if (result?.status === 'ok') marker.setLatLng([lat, lng]);
    } catch (err) {
      console.error('Move error:', err);
    }
    moveMode = false;
    selectedMarker = null;
    selectedHouseId = null;
  }

  // ── Delete house ───────────────────────────────────────────
  async function deleteHouse(id, marker) {
    try {
      const result = await api.deleteHouse(id);
      if (result?.status === 'deleted') {
        map.removeLayer(marker);
      } else if (result?.status === 'has_quote') {
        alert('This house has a quote attached. Delete the quote first.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  // ── Bind popup events ──────────────────────────────────────
  function bindPopup(marker, h) {
    marker.on('popupopen', () => {
      if (moveMode) return;
      const el = marker.getPopup().getElement();
      if (!el) return;
      el.querySelector('[data-delete]')?.addEventListener('click', () => deleteHouse(h.id, marker));
      el.querySelector('[data-move]')?.addEventListener('click', () => {
        toggleMoveMode(h.id, marker);
      });
      el.querySelector('[data-go="quote-edit"]')?.addEventListener('click', () => navigate(`#/quote/${h.quote_id}/edit`));
      el.querySelector('[data-go="service-edit"]')?.addEventListener('click', () => navigate(`#/service/${h.service_id}/edit`));
      el.querySelector('[data-go="service-new"]')?.addEventListener('click', () => navigate(`#/services/new/${h.quote_id}`));
      el.querySelector('[data-go="quote-new"]')?.addEventListener('click', () => navigate(`#/quotes/new?house_id=${h.id}`));
    });
  }

  function toggleMoveMode(houseId, marker) {
    if (moveMode && selectedHouseId === houseId) {
      moveMode = false;
      selectedMarker = null;
      selectedHouseId = null;
      map.closePopup();
      return;
    }
    moveMode = true;
    selectedMarker = marker;
    selectedHouseId = houseId;
    map.closePopup();
  }

  // ── Place existing houses ──────────────────────────────────
  houses.forEach((h) => {
    if (h.lat == null || h.lng == null || isNaN(h.lat) || isNaN(h.lng)) return;
    const isHighlighted = highlightId && String(h.id) === String(highlightId);
    const marker = L.circle([h.lat, h.lng], {
      color: isHighlighted ? '#e67e22' : markerColor(h),
      radius: isHighlighted ? 9 : 5,
      fillOpacity: 0.75,
      weight: isHighlighted ? 3 : 2,
    }).addTo(map);

    markerRegistry[h.id] = marker;
    if (isHighlighted) {
      map.setView([h.lat, h.lng], 19);
    }

    marker.bindPopup(popupHtml(h), { maxWidth: 280 });
    bindPopup(marker, h);

    if (isHighlighted) marker.openPopup();
  });

  // ── Map click: knock mode or add new house ─────────────────
  map.on('click', async (e) => {
    // Move mode: relocate selected marker
    if (moveMode && selectedMarker && selectedHouseId) {
      await moveMarker(selectedHouseId, selectedMarker, e.latlng.lat, e.latlng.lng);
      return;
    }
    if (moveMode) return;

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

      const address = `${houseNumber} ${road}`.trim();
      const realLat = parseFloat(geoData.lat);
      const realLng = parseFloat(geoData.lon);
      if (isNaN(realLat) || isNaN(realLng)) return;

      if (knockMode) {
        // Knock mode: first show the action sheet, then save
        const houseStub = { address, lat: realLat, lng: realLng };
        showKnockSheet(houseStub, async (choice) => {
          if (choice === 'cancel') return;

          const form = new FormData();
          form.append('lat', realLat);
          form.append('lng', realLng);
          form.append('address', address);
          if (choice !== 'add_quote') form.append('outcome', choice);

          const result = await api.addHouse(form);
          if (!result || result.status === 'exists') return;

          let color = 'red';
          if (choice === 'no_answer')      color = '#888';
          if (choice === 'not_interested') color = '#e67e22';

          const houseData = {
            id: result.id,
            address: result.address || address,
            knocked_at: result.knocked_at,
            outcome: choice !== 'add_quote' ? choice : null,
            quote_id: null,
          };

          const marker = L.circle([realLat, realLng], { color, radius: 5, fillOpacity: 0.75, weight: 2 }).addTo(map);
          markerRegistry[result.id] = marker;
          marker.bindPopup(popupHtml(houseData), { maxWidth: 280 });
          bindPopup(marker, houseData);

          if (choice === 'add_quote') {
            navigate(`#/quotes/new?house_id=${result.id}`);
          } else if (choice === 'add_note') {
            promptNote((note) => {
              houseData.note = note;
              marker.setPopupContent(popupHtml(houseData));
            });
            marker.openPopup();
          } else {
            marker.openPopup();
          }
        });
        return;
      }

      // Normal mode: add house and show popup
      const form = new FormData();
      form.append('lat', realLat);
      form.append('lng', realLng);
      form.append('address', address);
      const result = await api.addHouse(form);
      if (!result || result.status === 'exists') return;

      const houseData = { id: result.id, address: result.address || address, knocked_at: result.knocked_at, quote_id: null };
      const marker = L.circle([realLat, realLng], { color: 'red', radius: 5, fillOpacity: 0.75, weight: 2 }).addTo(map);
      markerRegistry[result.id] = marker;
      marker.bindPopup(popupHtml(houseData), { maxWidth: 280 });
      bindPopup(marker, houseData);
      marker.openPopup();
    } catch (err) {
      console.error('Map click error:', err);
    }
  });
}