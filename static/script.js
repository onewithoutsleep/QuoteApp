// ─────────────────────────────────────────
// PRICE FORMATTING
// ─────────────────────────────────────────
function fmtPrice(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return "—";
    // Show no decimals if whole, otherwise exactly 2
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}


// ─────────────────────────────────────────
// QUOTE CALCULATOR  (quote_form.html only)
// ─────────────────────────────────────────
function calculateQuote() {
    const windows = parseInt(document.getElementById("windows").value) || 0;

    const outside = Math.round(windows * outsideRate);
    const inside  = Math.round(windows * insideRate);
    const both    = Math.round(windows * bothRate);

    document.getElementById("outsideBase").innerText = fmtPrice(outside);
    document.getElementById("insideBase").innerText  = fmtPrice(inside);
    document.getElementById("bothBase").innerText    = fmtPrice(both);

    // Only overwrite the editable fields on a NEW quote (not edit)
    if (!isEditMode) {
        document.getElementById("outside").value = outside;
        document.getElementById("inside").value  = inside;
        document.getElementById("both").value    = both;
    }

    document.getElementById("quoteResults").style.display = "block";
}

// ─────────────────────────────────────────
// MAP  (map.html only)
// ─────────────────────────────────────────
if (document.getElementById("map")) {

    const map = L.map("map", { maxZoom: 20 })
        .setView(fallbackCenter, 18);

    // ── TILE LAYERS ────────────────────────────────────────────────
    const street = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxNativeZoom: 19,
            maxZoom: 25
        }
    );

    const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            maxNativeZoom: 19,
            maxZoom: 25
        }
    );

    street.addTo(map);

    L.control.layers({
        "Street": street,
        "Satellite": satellite
    }).addTo(map);


    // ── CURRENT LOCATION ───────────────────────────────────────────
    let locationDot = null;
    let accuracyCircle = null;
    let firstFix = true;

    function onPosition(pos) {

        const {
            latitude: lat,
            longitude: lng,
            accuracy
        } = pos.coords;

        if (!locationDot) {

            locationDot = L.circleMarker([lat, lng], {
                radius: 10,
                color: "#ffffff",
                weight: 2,
                fillColor: "#2d89ef",
                fillOpacity: 1,
                className: "location-dot",
                interactive: false,
            }).addTo(map);

            accuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: "#2d89ef",
                weight: 1,
                fillColor: "#2d89ef",
                fillOpacity: 0.10,
                interactive: false,
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
    }

    if (navigator.geolocation) {

        navigator.geolocation.watchPosition(
            onPosition,
            err => console.warn("Geolocation error:", err.message),
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 10000
            }
        );
    }


    // ── DELETE HOUSE ───────────────────────────────────────────────
    async function deleteHouse(id, marker) {

        try {

            const res = await fetch(`/delete_knock/${id}`);
            const result = await res.json();

            if (result.status === "deleted") {

                map.removeLayer(marker);

            } else if (result.status === "has_quote") {

                alert("This house has a quote attached. Delete the quote first.");
            }

        } catch (err) {

            console.error("Delete error:", err);
        }
    }


    // ── POPUP HTML ────────────────────────────────────────────────
    function time12(t) {
        if (!t) return '';
        const [hStr, mStr] = t.split(':');
        const h = parseInt(hStr, 10);
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12 = h % 12 || 12;
        return `${h12}:${mStr} ${ampm}`;
    }

    function popupHtml(h) {

        const knockLine = h.knocked_at
            ? `<div style="font-size:14px;color:#888;margin-bottom:8px;">
                    Knocked ${h.knocked_at}
               </div>`
            : "";

        const customerLine = h.quote_id && h.customer
            ? `<div style="font-size:14px;color:#444;margin-bottom:8px;">
                    ${h.customer}
               </div>`
            : "";

        const bookingLine = h.service_id && h.service_date
            ? `<div style="font-size:14px;color:#27ae60;margin-bottom:8px;">
                    Booked: ${h.service_date}${h.service_time ? ' at ' + time12(h.service_time) : ''}
               </div>`
            : "";

        const actionBtn = h.service_id
            ? `<button onclick="window.location.href='/edit/${h.quote_id}'">
                    Edit Quote
               </button>
               <button onclick="window.location.href='/service/edit/${h.service_id}?back=/map'"
                       style="background:#27ae60;">
                    Edit Booking
               </button>`
            : h.quote_id
            ? `<button onclick="window.location.href='/edit/${h.quote_id}'">
                    Edit Quote
               </button>
               <button onclick="window.location.href='/service/new/${h.quote_id}'"
                       style="background:#27ae60;">
                    Book Service
               </button>`
            : `<button onclick="window.location.href='/quote/new?address=${encodeURIComponent(h.address)}&house_id=${h.id}'">
                    Add Quote
               </button>`;

        const deleteBtn = h.quote_id
            ? ""
            : `<button id="delete-${h.id}" style="background:#c0392b;">Delete</button>`;

        return `
            <b>${h.address || "No Address"}</b><br>
            ${knockLine}
            ${customerLine}
            ${bookingLine}
            ${actionBtn}
            ${deleteBtn}
        `;
    }


    // ── LOAD EXISTING HOUSES ──────────────────────────────────────
    houses.forEach(h => {

        // validate coordinates
        if (
            h.lat == null ||
            h.lng == null ||
            isNaN(h.lat) ||
            isNaN(h.lng)
        ) {
            console.warn("Invalid house coords:", h);
            return;
        }

        const marker = L.circle(
            [h.lat, h.lng],
            {
                color: h.service_id ? "green" : h.quote_id ? "#2d89ef" : "red",
                radius: 5,
                fillOpacity: 0.7
            }
        ).addTo(map);

        marker.bindPopup(popupHtml(h));

        marker.on("popupopen", () => {

            const btn = document.getElementById(`delete-${h.id}`);

            if (btn) {
                btn.onclick = () => deleteHouse(h.id, marker);
            }
        });
    });


    // ── CLICK TO ADD HOUSE ────────────────────────────────────────
    map.on("click", async function (e) {

        try {

            const { lat, lng } = e.latlng;

            console.log("Clicked:", lat, lng);

            // reverse geocode
            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`
            );

            if (!geoRes.ok) {
                throw new Error("Reverse geocode failed");
            }

            const data = await geoRes.json();

            console.log("Nominatim result:", data);

            // safer address handling
            const houseNumber = data.address?.house_number || "";
            const road =
                data.address?.road ||
                data.address?.pedestrian ||
                data.address?.footway ||
                data.address?.path ||
                "";

            if (!road) {
                console.warn("No road found");
                return;
            }

            const address = `${houseNumber} ${road}`.trim();

            // Use Nominatim's coords so the dot lands on the actual house
            const realLat = parseFloat(data.lat);
            const realLng = parseFloat(data.lon);

            if (isNaN(realLat) || isNaN(realLng)) {
                console.error("Invalid coordinates");
                return;
            }

            // save to backend (using Nominatim's geocoded coords)
            const form = new FormData();

            form.append("lat", realLat);
            form.append("lng", realLng);
            form.append("address", address);

            const saveRes = await fetch("/add_house", {
                method: "POST",
                body: form
            });

            if (!saveRes.ok) {
                throw new Error("Save failed");
            }

            const result = await saveRes.json();

            console.log("Save result:", result);

            if (result.status === "exists") {
                console.log("House already exists");
                return;
            }

            // create house object
            const houseData = {
                id: result.id,
                address: result.address || address,
                knocked_at: result.knocked_at,
                quote_id: null,
            };

            // create marker
            const marker = L.circle(
                [realLat, realLng],
                {
                    color: "red",
                    radius: 5,
                    fillOpacity: 0.7
                }
            ).addTo(map);

            marker.bindPopup(popupHtml(houseData));

            marker.on("popupopen", () => {

                const btn = document.getElementById(`delete-${result.id}`);

                if (btn) {
                    btn.onclick = () => deleteHouse(result.id, marker);
                }
            });

            marker.openPopup();

        } catch (err) {

            console.error("Map click error:", err);
        }
    });
}
