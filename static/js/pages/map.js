import * as api from '../api.js';
import { renderNav } from '../components/nav.js';

let mapInstance = null;
let mapCleanup = [];

export const mapPage = {
  async mount({ root, slots, navigate, params }) {
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
    mapCleanup.forEach((fn) => fn());
    mapCleanup = [];
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  },
};

function initMap(el, data, highlightId, navigate) {
  const houses = data.houses || [];
  const fallbackCenter = data.fallback_center || [51.130218, -114.205008];

  const map = L.map(el, { maxZoom: 20 }).setView(fallbackCenter, 18);
  mapInstance = map;

  const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 25 });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxNativeZoom: 19, maxZoom: 25 }
  );
  street.addTo(map);
  L.control.layers({ Street: street, Satellite: satellite }).addTo(map);

  let moveMode = false;
  let selectedMarker = null;
  let selectedHouseId = null;
  const markerRegistry = {};

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

  async function deleteHouse(id, marker) {
    try {
      const result = await api.deleteHouse(id);
      if (result?.status === 'deleted') map.removeLayer(marker);
      else if (result?.status === 'has_quote') alert('This house has a quote attached. Delete the quote first.');
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  function popupHtml(h) {
    const knockLine = h.knocked_at ? `<div class="popup-meta">Knocked ${h.knocked_at}</div>` : '';
    const customerLine = h.quote_id && h.customer ? `<div class="popup-meta">${h.customer}</div>` : '';
    const bookingLine = h.service_id && h.service_date
      ? `<div class="popup-booking">Booked: ${h.service_date}${h.service_time ? ' at ' + time12(h.service_time) : ''}</div>`
      : '';

    let buttons = '';
    if (h.service_id) {
      buttons = `<button type="button" data-go="quote-edit">Edit Quote</button>
        <button type="button" class="btn-green" data-go="service-edit">Edit Booking</button>`;
    } else if (h.quote_id) {
      buttons = `<button type="button" data-go="quote-edit">Edit Quote</button>
        <button type="button" class="btn-green" data-go="service-new">Book Service</button>`;
    } else {
      buttons = `<button type="button" data-go="quote-new">Add Quote</button>`;
    }
    const deleteBtn = h.quote_id ? '' : `<button type="button" class="btn-red" data-delete>Delete</button>`;
    const moveBtn = `<button type="button" class="btn-orange" data-move>Move Dot</button>`;

    return `<b>${h.address || 'No Address'}</b><br>${knockLine}${customerLine}${bookingLine}
      <div class="popup-actions">${buttons}${deleteBtn}${moveBtn}</div>`;
  }

  function time12(t) {
    if (!t) return '';
    const [hStr, mStr] = t.split(':');
    const h = parseInt(hStr, 10);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${mStr} ${ampm}`;
  }

  houses.forEach((h) => {
    if (h.lat == null || h.lng == null || isNaN(h.lat) || isNaN(h.lng)) return;
    const isHighlighted = highlightId && String(h.id) === String(highlightId);
    const marker = L.circle([h.lat, h.lng], {
      color: isHighlighted ? '#e67e22' : (h.service_id ? 'green' : h.quote_id ? '#2d89ef' : 'red'),
      radius: isHighlighted ? 9 : 5,
      fillOpacity: 0.7,
      weight: isHighlighted ? 3 : 2,
    }).addTo(map);

    markerRegistry[h.id] = marker;
    if (isHighlighted) {
      map.setView([h.lat, h.lng], 19);
      marker.openPopup();
    }

    marker.bindPopup(popupHtml(h));
    marker.on('popupopen', () => {
      if (moveMode) return;
      const content = marker.getPopup().getElement();
      if (!content) return;
      content.querySelector('[data-delete]')?.addEventListener('click', () => deleteHouse(h.id, marker));
      content.querySelector('[data-move]')?.addEventListener('click', () => toggleMoveMode(h.id, marker));
      content.querySelector('[data-go="quote-edit"]')?.addEventListener('click', () => navigate(`#/quote/${h.quote_id}/edit`));
      content.querySelector('[data-go="service-edit"]')?.addEventListener('click', () => navigate(`#/service/${h.service_id}/edit`));
      content.querySelector('[data-go="service-new"]')?.addEventListener('click', () => navigate(`#/services/new/${h.quote_id}`));
      content.querySelector('[data-go="quote-new"]')?.addEventListener('click', () => {
        navigate(`#/quotes/new?house_id=${h.id}`);
      });
    });
  });

  let locationDot = null;
  let accuracyCircle = null;
  let firstFix = true;

  if (navigator.geolocation) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!locationDot) {
          locationDot = L.circleMarker([lat, lng], {
            radius: 10, color: '#ffffff', weight: 2, fillColor: '#2d89ef', fillOpacity: 1, interactive: false,
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
          map.setView([lat, lng], 18);
          firstFix = false;
        }
      },
      (err) => console.warn('Geolocation error:', err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    mapCleanup.push(() => navigator.geolocation.clearWatch(watchId));
  }

  map.on('click', async (e) => {
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
      const data = await geoRes.json();
      const houseNumber = data.address?.house_number || '';
      const road = data.address?.road || data.address?.pedestrian || data.address?.footway || data.address?.path || '';
      if (!road) return;

      const address = `${houseNumber} ${road}`.trim();
      const realLat = parseFloat(data.lat);
      const realLng = parseFloat(data.lon);
      if (isNaN(realLat) || isNaN(realLng)) return;

      const form = new FormData();
      form.append('lat', realLat);
      form.append('lng', realLng);
      form.append('address', address);
      const result = await api.addHouse(form);
      if (!result || result.status === 'exists') return;

      const houseData = { id: result.id, address: result.address || address, knocked_at: result.knocked_at, quote_id: null };
      const marker = L.circle([realLat, realLng], { color: 'red', radius: 5, fillOpacity: 0.7 }).addTo(map);
      markerRegistry[result.id] = marker;
      marker.bindPopup(popupHtml(houseData));
      marker.on('popupopen', () => {
        const content = marker.getPopup().getElement();
        content?.querySelector('[data-delete]')?.addEventListener('click', () => deleteHouse(result.id, marker));
        content?.querySelector('[data-move]')?.addEventListener('click', () => toggleMoveMode(result.id, marker));
        content?.querySelector('[data-go="quote-new"]')?.addEventListener('click', () => {
          navigate(`#/quotes/new?house_id=${result.id}`);
        });
      });
      marker.openPopup();
    } catch (err) {
      console.error('Map click error:', err);
    }
  });
}
