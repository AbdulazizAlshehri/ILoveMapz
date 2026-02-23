// ═══════════════════════════════════════════════════════════════════
//  KMZ Core — Shared Logic
// ═══════════════════════════════════════════════════════════════════

// ─── Color Palette ────────────────────────────────────────────────
const LAYER_COLORS = [
    'var(--color-primary)', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#00bcd4'
];
let colorIndex = 0;
const nextColor = () => LAYER_COLORS[colorIndex++ % LAYER_COLORS.length];

// Google Earth-style pin icon
function makePinIcon(color) {
    return L.divIcon({
        className: '',
        html: `<div style="width:24px;height:34px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
            <svg viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg" width="24" height="34">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 22 12 22s12-13 12-22C24 5.373 18.627 0 12 0z"
                    fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
                <circle cx="12" cy="12" r="5" fill="white" opacity="0.85"/>
            </svg></div>`,
        iconSize: [24, 34],
        iconAnchor: [12, 34],
        popupAnchor: [0, -34]
    });
}

// ─── Map Setup ────────────────────────────────────────────────────
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
});
const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19, attribution: 'Tiles © Esri' }
);
const map = L.map('map', { layers: [osmLayer] }).setView([23.8859, 45.0792], 5);
L.control.layers({ 'Streets': osmLayer, 'Satellite': satelliteLayer }).addTo(map);

// ─── State ────────────────────────────────────────────────────────
const layers = {};
let layerIdCounter = 0;
let targetLayerId = null;
let highlightLayer = null;
let lastMouseLatLng = null; // Track mouse position for 'I' key lookup

// ─── DOM ──────────────────────────────────────────────────────────
const sidebar = document.getElementById('layer-sidebar');
const layerList = document.getElementById('layer-list');
const uploadOverlay = document.getElementById('upload-overlay');
const mapWrap = document.getElementById('map-wrap');
const featureFlash = document.getElementById('feature-flash');
const navLayerCount = document.getElementById('nav-layer-count');
const navCountNum = document.getElementById('nav-count-num');

// ─── Custom Canvas Pin Renderer ───────────────────────────────────
// High-performance "Teardrop" pin drawn directly on Canvas
const PinMarker = L.CircleMarker.extend({
    _updatePath: function () {
        if (!this._renderer._drawing) return;
        const ctx = this._renderer._ctx;
        const p = this._point;
        const r = 6; // Radius of the head
        const h = 16; // Total height

        ctx.beginPath();
        // Draw teardrop shape
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y - (h - r), r, 0.65 * Math.PI, 2.35 * Math.PI);
        ctx.lineTo(p.x, p.y);
        ctx.closePath();

        if (this.options.fill) {
            ctx.globalAlpha = this.options.fillOpacity;
            ctx.fillStyle = this.options.fillColor || this.options.color;
            ctx.fill();
        }
        if (this.options.stroke && this.options.weight !== 0) {
            ctx.globalAlpha = this.options.opacity;
            ctx.lineWidth = this.options.weight;
            ctx.strokeStyle = this.options.color;
            ctx.stroke();
        }
        // Draw white dot in center
        ctx.beginPath();
        ctx.arc(p.x, p.y - (h - r), 2, 0, 2 * Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
    }
});

// ─── KMZ File Handling ────────────────────────────────────────────
async function handleKmzFiles(files) {
    if (!files || !files.length) return;
    for (const file of files) {
        if (!/\.(kml|kmz)$/i.test(file.name)) {
            alert(`Skipped "${file.name}" — only .kml and .kmz files are supported.`);
            continue;
        }
        try { await processKmzFile(file); }
        catch (err) { console.error(err); alert(`Error processing ${file.name}: ${err.message}`); }
    }
}

async function processKmzFile(file) {
    const jobId = window.JobTracker?.start('KMZProcessing', [file]);
    try {
        const buffer = await file.arrayBuffer();
        let kmlText = '';
        if (/\.kmz$/i.test(file.name)) {
            const zip = await JSZip.loadAsync(buffer);
            const kmlFile = Object.keys(zip.files).find(n => /\.kml$/i.test(n));
            if (kmlFile) kmlText = await zip.file(kmlFile).async('string');
        } else {
            kmlText = new TextDecoder().decode(buffer);
        }
        if (!kmlText) throw new Error('No KML content found');

        const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
        const geoJson = toGeoJSON.kml(kmlDom);
        const color = nextColor();

        const counts = { Point: 0, LineString: 0, Polygon: 0 };
        const canvasRenderer = L.canvas();

        const layer = L.geoJSON(geoJson, {
            renderer: canvasRenderer, // Use Canvas for lines/polygons
            onEachFeature(feature, lyr) {
                // Count geometry types
                const type = feature.geometry?.type;
                if (type === 'Point' || type === 'MultiPoint') counts.Point++;
                else if (type === 'LineString' || type === 'MultiLineString') counts.LineString++;
                else if (type === 'Polygon' || type === 'MultiPolygon') counts.Polygon++;

                const p = feature.properties || {};
                let popup = '';
                if (p.name) popup += `<strong>${p.name}</strong>`;
                if (p.description) popup += `<div style="margin-top:4px;font-size:12px;">${p.description}</div>`;
                if (popup) lyr.bindPopup(popup);
            },
            pointToLayer(feature, latlng) {
                // Use custom Canvas PinMarker
                return new PinMarker(latlng, {
                    renderer: canvasRenderer,
                    radius: 6, // Used for hit detection
                    fillColor: color,
                    color: 'rgba(0,0,0,0.5)',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 1
                });
            },
            style(feature) {
                const p = feature.properties || {};
                return {
                    color: p.stroke || color,
                    weight: p['stroke-width'] || 2,
                    opacity: p['stroke-opacity'] || 1,
                    fillColor: p.fill || color,
                    fillOpacity: p['fill-opacity'] || 0.4
                };
            }
        }).addTo(map);

        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

        const id = ++layerIdCounter;
        layers[id] = { layer, name: file.name, color, visible: true, counts };

        if (targetLayerId === null) targetLayerId = id;

        hideOverlay();
        showSidebar();
        updateNavCount();
        addLayerToUI(id, file.name, color);

        // Hook for app-specific logic (Auditor needs explicit refresh)
        if (window.onKmzLoaded) window.onKmzLoaded();

        window.JobTracker?.finish(jobId, [file]);
    } catch (e) {
        console.error(e);
        alert('Error reading file: ' + e.message);
        window.JobTracker?.fail(jobId, e.message);
    }
}

// ─── Layer UI ─────────────────────────────────────────────────────
function addLayerToUI(id, name, color) {
    const empty = layerList.querySelector('.empty-state');
    if (empty) empty.remove();

    const layer = layers[id];
    const counts = layer.counts || { Point: 0, LineString: 0, Polygon: 0 };

    // Format counts (e.g. "150 pts, 2 polys")
    const parts = [];
    if (counts.Point) parts.push(`${counts.Point} pts`);
    if (counts.Polygon) parts.push(`${counts.Polygon} polys`);
    if (counts.LineString) parts.push(`${counts.LineString} lines`);
    const countText = parts.join(', ') || 'No features';

    const isTarget = (id === targetLayerId);
    const item = document.createElement('div');
    item.id = `layer-item-${id}`;
    item.className = 'layer-item' + (isTarget ? ' is-target' : '');
    item.innerHTML = `
        <span class="layer-swatch" style="background:${color};"></span>
        <div style="flex:1; overflow:hidden;">
            <div class="layer-name" id="layer-name-${id}" title="${name}">${name}</div>
            <div class="layer-meta" style="font-size:10px; color:#999;">${countText}</div>
        </div>
        <div class="layer-actions">
            <button class="layer-btn btn-target ${isTarget ? 'active' : ''}"
                id="btn-target-${id}" onclick="setTargetLayer(${id})"
                title="${isTarget ? 'Current search target' : 'Set as search target'}">
                <i class="fa-solid fa-crosshairs"></i>
            </button>
            <button class="layer-btn btn-vis" id="btn-vis-${id}"
                onclick="toggleLayer(${id})" title="Toggle visibility">
                <i class="fa-solid fa-eye"></i>
            </button>
            <button class="layer-btn btn-remove" onclick="removeLayer(${id})" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;
    layerList.appendChild(item);
}

function refreshTargetLayerDropdown() {
    // This is primarily for the Auditor, but defined here if Preview implements it later
    const selTargetLayer = document.getElementById('sel-target-layer');
    if (!selTargetLayer) return;

    selTargetLayer.innerHTML = '<option value="">— select layer —</option>';
    Object.entries(layers).forEach(([id, entry]) => {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = entry.name;
        if (parseInt(id) === targetLayerId) opt.selected = true;
        selTargetLayer.appendChild(opt);
    });
    // Auto-select if only one layer
    if (Object.keys(layers).length === 1) {
        const onlyId = Object.keys(layers)[0];
        selTargetLayer.value = onlyId;
        targetLayerId = parseInt(onlyId);
    }
}

// ─── Layer Actions ────────────────────────────────────────────────
window.setTargetLayer = function (id) {
    id = parseInt(id);
    if (targetLayerId !== null) {
        document.getElementById(`layer-item-${targetLayerId}`)?.classList.remove('is-target');
        const oldBtn = document.getElementById(`btn-target-${targetLayerId}`);
        if (oldBtn) { oldBtn.classList.remove('active'); oldBtn.title = 'Set as search target'; }
    }
    targetLayerId = id;
    document.getElementById(`layer-item-${id}`)?.classList.add('is-target');
    const newBtn = document.getElementById(`btn-target-${id}`);
    if (newBtn) { newBtn.classList.add('active'); newBtn.title = 'Current search target'; }

    const selTargetLayer = document.getElementById('sel-target-layer');
    if (selTargetLayer) selTargetLayer.value = id;

    // Auto-zoom unless hook handles it
    let handled = false;
    if (window.onTargetLayerSet) {
        handled = window.onTargetLayerSet(id);
    }

    if (!handled) {
        zoomToLayer(id);
    }
};

window.toggleLayer = function (id) {
    const entry = layers[id];
    if (!entry) return;
    const btn = document.getElementById(`btn-vis-${id}`);
    const name = document.getElementById(`layer-name-${id}`);
    if (entry.visible) {
        map.removeLayer(entry.layer);
        entry.visible = false;
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>'; btn.classList.add('hidden-layer'); }
        if (name) name.classList.add('muted');
    } else {
        entry.layer.addTo(map);
        entry.visible = true;
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-eye"></i>'; btn.classList.remove('hidden-layer'); }
        if (name) name.classList.remove('muted');
    }
};

window.zoomToLayer = function (id) {
    const entry = layers[id];
    if (!entry) return;
    if (!entry.visible) toggleLayer(id);
    const bounds = entry.layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
};

window.removeLayer = function (id) {
    id = parseInt(id);
    const entry = layers[id];
    if (!entry) return;
    map.removeLayer(entry.layer);
    delete layers[id];
    document.getElementById(`layer-item-${id}`)?.remove();

    if (targetLayerId === id) {
        targetLayerId = Object.keys(layers)[0] ? parseInt(Object.keys(layers)[0]) : null;
    }
    updateNavCount();
    refreshTargetLayerDropdown();
    if (window.onLayerRemoved) window.onLayerRemoved(id);

    if (!Object.keys(layers).length) {
        layerList.innerHTML = '<div class="empty-state">No layers loaded.</div>';
        showOverlay();
        sidebar.classList.add('sidebar-hidden');
    }
};

// ─── Helpers ──────────────────────────────────────────────────────
function showSidebar() { sidebar.classList.remove('sidebar-hidden'); setTimeout(() => map.invalidateSize(), 280); }
function hideOverlay() { uploadOverlay.classList.add('hidden'); }
function showOverlay() { uploadOverlay.classList.remove('hidden'); }

function updateNavCount() {
    const count = Object.keys(layers).length;
    if (navCountNum) navCountNum.textContent = count;
    if (navLayerCount) navLayerCount.style.display = count > 0 ? 'flex' : 'none';
}

function triggerFlash() {
    featureFlash.classList.remove('hidden');
    featureFlash.style.animation = 'none';
    void featureFlash.offsetWidth;
    featureFlash.style.animation = '';
    setTimeout(() => featureFlash.classList.add('hidden'), 700);
}

// ─── Drag & Drop ──────────────────────────────────────────────────
if (mapWrap) {
    mapWrap.addEventListener('dragover', e => { e.preventDefault(); mapWrap.classList.add('drag-over'); });
    mapWrap.addEventListener('dragleave', e => { if (!mapWrap.contains(e.relatedTarget)) mapWrap.classList.remove('drag-over'); });
    mapWrap.addEventListener('drop', e => {
        e.preventDefault();
        mapWrap.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        const kmz = files.filter(f => /\.(kml|kmz)$/i.test(f.name));
        // Note: Excel handling is app-specific, but we can emit an event or check window.handleExcelFile
        if (kmz.length) handleKmzFiles(kmz);

        const excel = files.find(f => /\.(xlsx|xls|csv)$/i.test(f.name));
        if (excel && window.handleExcelFile) window.handleExcelFile(excel);
    });
}

// ─── Imagery Date Lookup (Shortcut: I) ────────────────────────────
// ─── Imagery Date (Persistent Display) ────────────────────────────
// Create display element if not exists
const imageryDateDisplay = document.createElement('div');
imageryDateDisplay.id = 'imagery-date-display';
imageryDateDisplay.style.display = 'none'; // Hidden by default
if (mapWrap) mapWrap.appendChild(imageryDateDisplay);

let lastImageryFetch = 0;
const FETCH_THROTTLE_MS = 1000; // Throttle slightly for smoothness


// Update on map move/zoom end
map.on('moveend', updateImageryDate);
map.on('zoomend', updateImageryDate);

// Toggle based on active base layer
map.on('baselayerchange', e => {
    if (e.layer === satelliteLayer) {
        updateImageryDate();
    } else {
        imageryDateDisplay.style.display = 'none';
    }
});

async function updateImageryDate() {
    // Only show if Satellite layer is active
    if (!map.hasLayer(satelliteLayer)) {
        imageryDateDisplay.style.display = 'none';
        return;
    }

    const center = map.getCenter();

    // Show loading state
    imageryDateDisplay.textContent = 'Checking imagery date...';
    imageryDateDisplay.style.display = 'block';

    try {
        const date = await fetchImageryDate(center);
        // Double check layer is still active after await
        if (date && map.hasLayer(satelliteLayer)) {
            const age = getImageryAge(date);
            imageryDateDisplay.textContent = `Imagery Date: ${date} ${age}`;
            imageryDateDisplay.style.display = 'block';
        } else {
            imageryDateDisplay.style.display = 'none';
        }
    } catch (err) {
        imageryDateDisplay.style.display = 'none';
    }
}

function getImageryAge(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) return `(${diffDays} days ago)`;
    if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `(${months} month${months > 1 ? 's' : ''} ago)`;
    }
    const years = (diffDays / 365.25).toFixed(1);
    return `(${years} years ago)`;
}

// Initial triggering (only if satellite is default, which it isn't currently, but good practice)
if (map.hasLayer(satelliteLayer)) {
    setTimeout(updateImageryDate, 1000);
}

// Original shortcut 'I' still works for immediate popup check
document.addEventListener('keydown', async e => {
    if ((e.key === 'i' || e.key === 'I') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (!lastMouseLatLng) return;
        const loadingPopup = L.popup()
            .setLatLng(lastMouseLatLng)
            .setContent('<div style="font-size:12px; color:#666;">Checking imagery date...</div>')
            .openOn(map);
        try {
            const date = await fetchImageryDate(lastMouseLatLng);
            if (date) loadingPopup.setContent(`<div style="font-size:13px; font-weight:600;">Imagery Date: ${date}</div>`);
            else loadingPopup.setContent('<div style="font-size:12px; color:#999;">Date unavailable</div>');
        } catch (err) {
            loadingPopup.setContent('<div style="font-size:12px; color:#95c11f;">Offline / Error</div>');
        }
    }
});

async function fetchImageryDate(latlng) {
    const url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/identify';
    const params = new URLSearchParams({
        f: 'json',
        geometry: `${latlng.lng},${latlng.lat}`,
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'all', // Inspect all layers for extensive coverage
        tolerance: '2',
        mapExtent: `${latlng.lng - 0.01},${latlng.lat - 0.01},${latlng.lng + 0.01},${latlng.lat + 0.01}`,
        imageDisplay: '1000,1000,96',
        returnGeometry: 'false'
    });

    const res = await fetch(`${url}?${params}`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    if (data.results && data.results.length > 0) {
        for (const result of data.results) {
            const attrs = result.attributes;
            // Check common fields across different layer versions
            const dateRaw = attrs['SRC_DATE'] || attrs['DATE (YYYYMMDD)'] || attrs['SRC_DATE2'] || attrs['NICE'] || attrs['Date'] || attrs['DATE'];

            if (dateRaw && dateRaw !== 'Null' && dateRaw !== 'null') {
                // Format YYYYMMDD to YYYY-MM-DD
                if (/^\d{8}$/.test(dateRaw)) {
                    return `${dateRaw.substring(0, 4)}-${dateRaw.substring(4, 6)}-${dateRaw.substring(6, 8)}`;
                }
                return dateRaw;
            }
        }
    }
    return null;
}
