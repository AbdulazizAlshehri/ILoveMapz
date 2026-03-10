// ═══════════════════════════════════════════════════════════════════
//  KMZ Core — Shared Logic
// ═══════════════════════════════════════════════════════════════════

// ─── Color Palette ────────────────────────────────────────────────
// NOTE: All colors must be valid hex/rgb — Canvas 2D cannot parse CSS variables.
const LAYER_COLORS = [
    '#E5322D', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
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
// Tile options: updateWhenIdle waits for panning to stop before loading,
// updateWhenZooming skips intermediate zoom levels, keepBuffer pre-caches
// off-screen tiles so back-panning feels instant.
const TILE_OPTIONS = {
    maxZoom: 19,
    keepBuffer: 4,              // pre-cache 4 tile-widths off-screen (was 2) — smoother panning
    updateWhenIdle: true,
    updateWhenZooming: false,
    crossOrigin: 'anonymous'    // lets the browser share the HTTP cache across origins
};
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    ...TILE_OPTIONS, attribution: '© OpenStreetMap'
});
const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { ...TILE_OPTIONS, attribution: 'Tiles © Esri' }
);
// preferCanvas + smooth movement options:
//   zoomSnap: 0.25  — fractional zoom steps, no jarring snapping
//   wheelDebounceTime: 40 — scroll-wheel zoom is less sensitive/jumpy
//   inertiaDeceleration/MaxSpeed — feels like smooth, natural pan deceleration
const map = L.map('map', {
    layers: [osmLayer],
    preferCanvas: true,
    zoomSnap: 0.25,
    wheelDebounceTime: 40,
    inertia: true,
    inertiaDeceleration: 3000,
    inertiaMaxSpeed: 1500,
    markerZoomAnimation: false,   // skip DOM-marker interpolation during zoom frames
    bounceAtZoomLimits: false     // no zoom-limit bounce — saves layout/paint work
}).setView([23.8859, 45.0792], 5);
L.control.layers({ 'Streets': osmLayer, 'Satellite': satelliteLayer }).addTo(map);

// GPU compositing hint — promotes each pane to its own compositor layer so
// panning/zooming is hardware-accelerated with no layout reflow.
// .leaflet-map-pane is the single element Leaflet CSS-transforms during pan;
// the individual panes need their own layer so they don't dirty each other.
function _applyWillChange() {
    const container = map.getContainer();
    container.querySelectorAll(
        '.leaflet-map-pane, .leaflet-tile-pane, .leaflet-canvas-pane, .leaflet-overlay-pane'
    ).forEach(el => { el.style.willChange = 'transform'; el.style.isolation = 'isolate'; });
}
map.once('load', _applyWillChange);
map.once('layeradd', _applyWillChange); // fires even for local files with no 'load' event

// ─── State ────────────────────────────────────────────────────────
const layers = {};
let layerIdCounter = 0;
let targetLayerId = null;
let highlightLayer = null;
let lastMouseLatLng = null; // Track mouse position for 'I' key lookup
let featureIndex = [];  // { name, lyr, center, layerId } — powers the search box

// ─── Shared Canvas Renderer ───────────────────────────────────────
// A single shared renderer is used for ALL layers so that all features
// share one canvas element. Using a separate L.canvas() per file would
// stack opaque canvases on top of each other, making lower-layer
// polygons unclickable because the upper canvas intercepts all events.
// padding: 1.0 means the canvas is pre-drawn 1× viewport width/height beyond
// every edge. During a pan, Leaflet just CSS-transforms the canvas — no redraw
// until you've moved an entire viewport width. Doubles the smooth-pan range.
const sharedCanvasRenderer = L.canvas({
    padding: 1.0,   // pre-draw 1× viewport beyond each edge — pan buffer
    tolerance: 5    // px slop for click/hover hit-testing; reduces per-frame geometry checks
});

// ─── DOM ──────────────────────────────────────────────────────────
const sidebar = document.getElementById('layer-sidebar');
const layerList = document.getElementById('layer-list');
const uploadOverlay = document.getElementById('upload-overlay');
const mapWrap = document.getElementById('map-wrap');
const featureFlash = document.getElementById('feature-flash');
const navLayerCount = document.getElementById('nav-layer-count');
const navCountNum = document.getElementById('nav-count-num');

// ─── Loading Toast (bottom-right corner) ──────────────────────────
// Small non-intrusive toast — no spinner, just filename + progress bar + %
const _loadingOverlay = document.createElement('div');
_loadingOverlay.id = 'kmz-loading-overlay';
_loadingOverlay.className = 'hidden';
_loadingOverlay.innerHTML = `
    <div class="kmz-loading-filename" id="_lof">Loading…</div>
    <div class="kmz-progress-row">
        <div class="kmz-progress-track">
            <div class="kmz-progress-bar indeterminate" id="_lob"></div>
        </div>
        <span class="kmz-loading-pct" id="_lop">—</span>
    </div>
    <div class="kmz-loading-status" id="_los"></div>`;
if (mapWrap) mapWrap.appendChild(_loadingOverlay);

const _loFilename = () => document.getElementById('_lof');
const _loBar = () => document.getElementById('_lob');
const _loPct = () => document.getElementById('_lop');
const _loStatus = () => document.getElementById('_los');

function showLoadingOverlay(filename) {
    const bar = _loBar();
    if (bar) { bar.style.width = '0%'; bar.classList.add('indeterminate'); }
    if (_loFilename()) _loFilename().textContent = filename;
    if (_loPct()) _loPct().textContent = '—';
    if (_loStatus()) _loStatus().textContent = 'Parsing…';
    _loadingOverlay.classList.remove('hidden');
}

function updateLoadingProgress(loaded, total, label) {
    const bar = _loBar();
    if (!bar) return;
    if (total > 0) {
        const pct = Math.round((loaded / total) * 100);
        bar.classList.remove('indeterminate');
        bar.style.width = `${pct}%`;
        if (_loPct()) _loPct().textContent = `${pct}%`;
    }
    if (_loStatus()) _loStatus().textContent = label || '';
}

function hideLoadingOverlay() {
    _loadingOverlay.classList.add('hidden');
    const bar = _loBar();
    if (bar) { bar.style.width = '0%'; bar.classList.add('indeterminate'); }
    if (_loPct()) _loPct().textContent = '—';
    if (_loStatus()) _loStatus().textContent = '';
}

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

const iconCache = {};
const ImageIconMarker = L.CircleMarker.extend({
    _updatePath: function () {
        if (!this._renderer._drawing) return;
        const ctx = this._renderer._ctx;
        const p = this._point;
        const url = this.options.iconUrl;

        if (!iconCache[url]) {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = url;
            iconCache[url] = { img, loaded: false };
            img.onload = () => {
                iconCache[url].loaded = true;
                if (this._renderer && this._renderer._redraw) this._renderer._redraw();
            };
        }

        const cache = iconCache[url];
        if (cache && cache.loaded) {
            const s = (this.options.iconScale || 1.0);
            const w = 32 * s;
            const h = 32 * s;
            ctx.drawImage(cache.img, p.x - w / 2, p.y - h, w, h);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = this.options.fillColor || 'gray';
            ctx.fill();
        }
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
    showLoadingOverlay(file.name);
    try {
        const buffer = await file.arrayBuffer();
        let kmlText = '';
        const imageBlobs = {};
        if (/\.kmz$/i.test(file.name)) {
            const zip = await JSZip.loadAsync(buffer);
            const kmlFile = Object.keys(zip.files).find(n => /\.kml$/i.test(n));
            if (kmlFile) kmlText = await zip.file(kmlFile).async('string');

            // Extract embedded images
            for (const [filename, fileObj] of Object.entries(zip.files)) {
                if (!fileObj.dir && filename !== kmlFile && /\.(png|jpg|jpeg|gif|svg)$/i.test(filename)) {
                    const blob = await fileObj.async('blob');
                    const blobUrl = URL.createObjectURL(blob);
                    imageBlobs[filename] = blobUrl;
                    const basename = filename.split('/').pop();
                    if (!imageBlobs[basename]) imageBlobs[basename] = blobUrl;
                }
            }
        } else {
            kmlText = new TextDecoder().decode(buffer);
        }
        if (!kmlText) throw new Error('No KML content found');

        const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');

        // --- Extract KML Styles natively as a fallback for toGeoJSON ---
        const styleMap = {};
        const styles = kmlDom.getElementsByTagName('Style');
        for (let i = 0; i < styles.length; i++) {
            const style = styles[i];
            const id = style.getAttribute('id');
            if (id) {
                const sd = {};
                const is = style.getElementsByTagName('IconStyle')[0];
                if (is) {
                    const c = is.getElementsByTagName('color')[0];
                    if (c) sd.iconColor = c.textContent.trim();
                    const s = is.getElementsByTagName('scale')[0];
                    if (s) sd.iconScale = parseFloat(s.textContent.trim());
                    const iNode = is.getElementsByTagName('Icon')[0];
                    if (iNode) {
                        const href = iNode.getElementsByTagName('href')[0];
                        if (href) sd.iconUrl = href.textContent.trim();
                    }
                }
                styleMap['#' + id] = sd;
            }
        }
        const styleMaps = kmlDom.getElementsByTagName('StyleMap');
        for (let i = 0; i < styleMaps.length; i++) {
            const sMap = styleMaps[i];
            const id = sMap.getAttribute('id');
            if (id) {
                const pairs = sMap.getElementsByTagName('Pair');
                for (let j = 0; j < pairs.length; j++) {
                    const key = pairs[j].getElementsByTagName('key')[0];
                    if (key && key.textContent.trim() === 'normal') {
                        const styleUrl = pairs[j].getElementsByTagName('styleUrl')[0];
                        if (styleUrl && styleMap[styleUrl.textContent.trim()]) {
                            styleMap['#' + id] = styleMap[styleUrl.textContent.trim()];
                        }
                        break;
                    }
                }
            }
        }

        // Helper to convert KML aabbggrr to #rgba
        const kmlToHex = (k) => {
            let h = k.replace('#', '');
            if (h.length === 8) return `#${h.substring(6, 8)}${h.substring(4, 6)}${h.substring(2, 4)}`; // Ignore A for now to keep solid colors inside icons, or #rrggbbaa
            if (h.length === 6) return `#${h.substring(4, 6)}${h.substring(2, 4)}${h.substring(0, 2)}`;
            return k;
        };

        const geoJson = toGeoJSON.kml(kmlDom);
        const color = nextColor();
        const features = geoJson.features || [];
        const total = features.length;

        const counts = { Point: 0, LineString: 0, Polygon: 0 };
        const newFeatureEntries = []; // collect { name, lyr, center } for search index

        // GeoJSON layer options shared across all chunks
        const geoJsonOptions = {
            renderer: sharedCanvasRenderer,
            onEachFeature(feature, lyr) {
                const type = feature.geometry?.type;
                if (type === 'Point' || type === 'MultiPoint') counts.Point++;
                else if (type === 'LineString' || type === 'MultiLineString') counts.LineString++;
                else if (type === 'Polygon' || type === 'MultiPolygon') counts.Polygon++;

                const p = feature.properties || {};
                let popup = '';
                if (p.name) popup += `<strong>${p.name}</strong>`;

                // If standard description exists, use it. Otherwise, collect all extended properties.
                if (p.description) {
                    popup += `<div style="margin-top:4px;font-size:12px;">${p.description}</div>`;
                } else {
                    const ignores = ['name', 'styleUrl', 'stroke', 'stroke-opacity', 'stroke-width', 'fill', 'fill-opacity', 'icon', 'marker-color', 'icon-scale', 'styleHash', 'styleMapHash'];
                    let extHtml = '';
                    for (const [key, val] of Object.entries(p)) {
                        if (!ignores.includes(key) && val !== null && val !== undefined && val !== '') {
                            extHtml += `<tr>
                                <td style="padding: 2px 6px 2px 0; border-bottom: 1px solid #eee; color: #666; font-weight: 500;">${key}</td>
                                <td style="padding: 2px 0 2px 6px; border-bottom: 1px solid #eee; color: #333;">${val}</td>
                            </tr>`;
                        }
                    }
                    if (extHtml) {
                        popup += `<div class="popup-ext-data">
                            <table>${extHtml}</table>
                        </div>`;
                    }
                }



                // Add named features to the search index
                if (p.name) {
                    try {
                        const center = lyr.getLatLng ? lyr.getLatLng()
                            : lyr.getBounds ? lyr.getBounds().getCenter()
                                : null;
                        if (center) newFeatureEntries.push({ name: p.name, lyr, center, html: popup });
                    } catch (_) { }
                }
                // Bind click to show the feature description panel
                if (popup.trim()) {
                    const _html = popup;
                    lyr.on('click', e => { _showFeatDesc(e, _html, lyr); });
                }
            },
            pointToLayer(feature, latlng) {
                const p = feature.properties || {};
                let ptColor = p['marker-color'] || p.fill || p.stroke || color;
                let iconUrl = p.icon;
                let scale = p['icon-scale'] || 1.0;

                // Fallback to our native parsed styles if toGeoJSON missed them
                if (p.styleUrl && styleMap[p.styleUrl]) {
                    const sd = styleMap[p.styleUrl];
                    if (!iconUrl && sd.iconUrl) iconUrl = sd.iconUrl;
                    if (!p['marker-color'] && sd.iconColor) ptColor = kmlToHex(sd.iconColor);
                    if (!p['icon-scale'] && sd.iconScale) scale = sd.iconScale;
                }

                if (iconUrl) {
                    const basename = iconUrl.split('/').pop();
                    let finalUrl = iconUrl;
                    if (imageBlobs[iconUrl]) finalUrl = imageBlobs[iconUrl];
                    else if (imageBlobs[basename]) finalUrl = imageBlobs[basename];

                    return new ImageIconMarker(latlng, {
                        renderer: sharedCanvasRenderer,
                        iconUrl: finalUrl,
                        iconScale: p['icon-scale'] || 1.0,
                        fillColor: ptColor
                    });
                }

                return new PinMarker(latlng, {
                    renderer: sharedCanvasRenderer,
                    radius: 6,
                    fillColor: ptColor,
                    color: 'rgba(0,0,0,0.5)',
                    weight: 1, opacity: 1, fillOpacity: 1
                });
            },
            style(feature) {
                const p = feature.properties || {};
                return {
                    color: p.stroke || color,
                    weight: p['stroke-width'] || 2,
                    opacity: p['stroke-opacity'] || 1,
                    fillColor: p.fill || color,
                    fillOpacity: p['fill-opacity'] || 0.4,
                    smoothFactor: 4      // higher = fewer canvas path segments = faster redraws
                };
            }
        };

        // Chunked rendering: yield between chunks via rAF so the browser
        // can repaint the progress bar and stay responsive during large files.
        const CHUNK = 300;
        const layer = L.featureGroup().addTo(map);
        const kmlChunks = []; // keep refs so resetLayerColor can call resetStyle()
        updateLoadingProgress(0, total, total ? `0 / ${total} features` : 'Rendering…');

        for (let i = 0; i < features.length; i += CHUNK) {
            const chunk = { type: 'FeatureCollection', features: features.slice(i, i + CHUNK) };
            const chunkLayer = L.geoJSON(chunk, geoJsonOptions);
            chunkLayer.addTo(layer);
            kmlChunks.push(chunkLayer);

            const loaded = Math.min(i + CHUNK, total);
            updateLoadingProgress(loaded, total, total ? `${loaded} / ${total} features` : 'Rendering…');

            // Yield so the browser stays responsive without background throttling
            await yieldToMain();
        }

        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

        const id = ++layerIdCounter;
        layers[id] = { layer, name: file.name, color, originalColor: color, chunks: kmlChunks, opacity: 1, visible: true, counts };
        if (targetLayerId === null) targetLayerId = id;

        // Register features in the search index now that we have a layerId
        newFeatureEntries.forEach(e => featureIndex.push({ ...e, layerId: id }));

        hideOverlay();
        showSidebar();
        updateNavCount();
        addLayerToUI(id, file.name, color);

        // Smart default opacity: polygon/line layers → 60%, point-only → 100%
        const hasPolygons = counts.Polygon > 0 || counts.LineString > 0;
        if (hasPolygons) {
            layers[id].opacity = 0.6;
            applyLayerOpacity(id, 0.6);
            const pipsEl = document.getElementById(`opacity-pips-${id}`);
            if (pipsEl) {
                pipsEl.querySelectorAll('.opacity-pip:not(.hide-pip)').forEach(b => {
                    b.classList.toggle('active', b.dataset.v === '60');
                });
            }
        }
        // point-only layers: 100% pip already active by default in addLayerToUI

        // Hook for app-specific logic (Auditor needs explicit refresh)
        if (window.onKmzLoaded) window.onKmzLoaded();

        // Reveal the minimap overview panel now that we have spatial data
        showSharedMiniMap();

        window.JobTracker?.finish(jobId, [file]);
    } catch (e) {
        console.error(e);
        alert('Error reading file: ' + e.message);
        window.JobTracker?.fail(jobId, e.message);
    } finally {
        hideLoadingOverlay();
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
    item.draggable = true;
    // Colour accent: left border in the layer's unique palette colour
    item.style.borderLeft = `3px solid ${color}`;
    item.innerHTML = `
        <div class="layer-main-row">
            <span class="layer-drag-handle" title="Drag to reorder">
                <i class="fa-solid fa-grip-vertical"></i>
            </span>
            <div class="layer-info">
                <div class="layer-name" id="layer-name-${id}" title="${name}">${name}</div>
                <div class="layer-meta">${countText}</div>
            </div>
            <button class="layer-btn btn-remove" onclick="removeLayer(${id})" title="Remove">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="layer-controls-row">
            <button class="layer-btn btn-target ${isTarget ? 'active' : ''}"
                id="btn-target-${id}" onclick="setTargetLayer(${id})"
                title="${isTarget ? 'Current search target' : 'Set as search target'}">
                <i class="fa-solid fa-crosshairs"></i>
            </button>
            <div class="layer-ctrl-divider"></div>
            <input type="color" class="layer-color-swatch" id="swatch-${id}"
                value="${color}" title="Change colour"
                onchange="changeLayerColor(${id}, this.value)">
            <button class="btn-reset-color" onclick="resetLayerColor(${id})"
                title="Revert to original colour"><i class="fa-solid fa-rotate-left"></i></button>
            <div class="layer-ctrl-divider"></div>
            <div class="opacity-pips" id="opacity-pips-${id}">
                <button class="opacity-pip hide-pip" id="btn-vis-${id}"
                    onclick="toggleLayer(${id})" title="Hide layer">
                    <i class="fa-solid fa-eye-slash"></i>
                </button>
                <button class="opacity-pip" onclick="changeLayerOpacity(${id},20)" title="20%" data-v="20"></button>
                <button class="opacity-pip" onclick="changeLayerOpacity(${id},40)" title="40%" data-v="40"></button>
                <button class="opacity-pip" onclick="changeLayerOpacity(${id},60)" title="60%" data-v="60"></button>
                <button class="opacity-pip" onclick="changeLayerOpacity(${id},80)" title="80%" data-v="80"></button>
                <button class="opacity-pip active" onclick="changeLayerOpacity(${id},100)" title="100%" data-v="100"></button>
            </div>
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

// ─── Layer Drag-and-Drop Reordering ───────────────────────────────
let _dragSrcId = null;

layerList.addEventListener('dragstart', e => {
    const item = e.target.closest('.layer-item');
    if (!item) return;
    _dragSrcId = parseInt(item.id.replace('layer-item-', ''));
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(_dragSrcId));
});

layerList.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('.layer-item');
    layerList.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    if (item && parseInt(item.id.replace('layer-item-', '')) !== _dragSrcId) {
        item.classList.add('drop-target');
    }
});

layerList.addEventListener('dragleave', e => {
    if (!layerList.contains(e.relatedTarget)) {
        layerList.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    }
});

layerList.addEventListener('drop', e => {
    e.preventDefault();
    const targetItem = e.target.closest('.layer-item');
    if (!targetItem || _dragSrcId == null) return;
    const targetId = parseInt(targetItem.id.replace('layer-item-', ''));
    if (targetId === _dragSrcId) return;

    const srcItem = document.getElementById(`layer-item-${_dragSrcId}`);
    if (!srcItem) return;

    // Determine drop position: insert before or after based on pointer Y
    const rect = targetItem.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (after) targetItem.insertAdjacentElement('afterend', srcItem);
    else targetItem.insertAdjacentElement('beforebegin', srcItem);

    syncLayerOrder(); // Sync map canvas draw order to match sidebar order
});

layerList.addEventListener('dragend', () => {
    layerList.querySelectorAll('.dragging, .drop-target')
        .forEach(el => el.classList.remove('dragging', 'drop-target'));
    _dragSrcId = null;
});

// Re-add all visible layers to the map in sidebar DOM order so the canvas
// draws them in the correct stack (top of sidebar = drawn last = on top).
function syncLayerOrder() {
    const orderedIds = [...layerList.querySelectorAll('.layer-item')]
        .map(el => parseInt(el.id.replace('layer-item-', '')))
        .filter(id => !isNaN(id) && layers[id]);

    // Remove all layers silently
    orderedIds.forEach(id => {
        if (layers[id].visible) map.removeLayer(layers[id].layer);
    });
    // Re-add in DOM order — first item draws at the bottom, last item on top
    orderedIds.forEach(id => {
        if (layers[id].visible) layers[id].layer.addTo(map);
    });
    // Restore styles without overwriting KML per-feature colours:
    // only apply the flat override when the user has explicitly changed the colour.
    orderedIds.forEach(id => {
        const entry = layers[id];
        if (entry.colorOverridden) {
            applyLayerColor(id, entry.color);
        } else {
            (entry.chunks || []).forEach(chunkLayer => {
                chunkLayer.eachLayer(feat => { try { chunkLayer.resetStyle(feat); } catch (_) { } });
            });
        }
        // Re-apply opacity after reorder so the slider value is preserved
        if (entry.opacity !== undefined && entry.opacity < 1) {
            applyLayerOpacity(id, entry.opacity);
        }
    });
}

// ─── User-editable layer color ────────────────────────────────────
// Called by the color swatch <input type="color"> onchange.
window.changeLayerColor = function (id, newColor) {
    if (!layers[id]) return;
    layers[id].color = newColor;
    layers[id].colorOverridden = true;
    applyLayerColor(id, newColor);
    const swatch = document.getElementById(`swatch-${id}`);
    if (swatch) swatch.value = newColor;
    // Re-apply opacity after color change (setStyle resets opacity to defaults)
    if (layers[id].opacity !== undefined && layers[id].opacity < 1) {
        applyLayerOpacity(id, layers[id].opacity);
    }
};

// ─── User-editable layer opacity ───────────────────────────────────
// Called by each opacity pip button.
window.changeLayerOpacity = function (id, value) {
    const opacity = parseInt(value, 10) / 100;
    if (!layers[id]) return;

    // If the layer is hidden, show it and deselect the hide pip first
    if (!layers[id].visible) {
        layers[id].layer.addTo(map);
        layers[id].visible = true;
        const nameEl = document.getElementById(`layer-name-${id}`);
        if (nameEl) nameEl.classList.remove('muted');
        const hideBtn = document.getElementById(`btn-vis-${id}`);
        if (hideBtn) hideBtn.classList.remove('active');
    }

    layers[id].opacity = opacity;
    applyLayerOpacity(id, opacity);
    // Highlight the selected pip (skip hide-pip)
    const pips = document.getElementById(`opacity-pips-${id}`);
    if (pips) {
        pips.querySelectorAll('.opacity-pip:not(.hide-pip)').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.v === String(value));
        });
    }
};

// Scale stroke and fill opacity of every feature in the layer by the given
// multiplier (0–1). Fill is scaled relative to its natural 0.4 base.
function applyLayerOpacity(id, opacity) {
    const entry = layers[id];
    if (!entry) return;
    (entry.chunks || []).forEach(chunk => {
        chunk.eachLayer(feat => {
            try {
                feat.setStyle({ opacity, fillOpacity: opacity });
            } catch (_) { }
        });
    });
}

// Walk the featureGroup → geoJSON sublayers → individual features
// and setStyle with the new color so the canvas redraws them immediately.
function applyLayerColor(id, color) {
    const entry = layers[id];
    if (!entry) return;
    entry.layer.eachLayer(chunk => {          // L.geoJSON chunks inside featureGroup
        if (!chunk.eachLayer) return;
        chunk.eachLayer(feat => {             // individual feature layers
            try {
                if (feat.getLatLng) {
                    // Point / PinMarker — only fill colour changes
                    feat.setStyle({ fillColor: color });
                } else {
                    // Polygon / Line — stroke + fill
                    feat.setStyle({ color, fillColor: color });
                }
            } catch (_) { }
        });
    });
}

// Revert a layer to the colours embedded in the original KMZ/KML file.
// L.geoJSON.resetStyle(feat) re-runs the style function which reads
// p.stroke / p.fill from the feature's own KML properties. Point colors are also preserved.
window.resetLayerColor = function (id) {
    const entry = layers[id];
    if (!entry) return;

    // Re-apply KML-original per-feature styles via Leaflet's resetStyle
    (entry.chunks || []).forEach(chunkLayer => {
        chunkLayer.eachLayer(feat => {
            try { chunkLayer.resetStyle(feat); } catch (_) { }
        });
    });

    // Clear the override flag and revert swatch to palette original
    entry.color = entry.originalColor;
    entry.colorOverridden = false;
    const swatch = document.getElementById(`swatch-${id}`);
    if (swatch) swatch.value = entry.originalColor;
};

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
    const hideBtn = document.getElementById(`btn-vis-${id}`);
    const nameEl = document.getElementById(`layer-name-${id}`);
    if (entry.visible) {
        map.removeLayer(entry.layer);
        entry.visible = false;
        if (hideBtn) hideBtn.classList.add('active');
        if (nameEl) nameEl.classList.add('muted');
        // Deselect all opacity pips while hidden
        const pipsContainer = document.getElementById(`opacity-pips-${id}`);
        if (pipsContainer) {
            pipsContainer.querySelectorAll('.opacity-pip:not(.hide-pip)')
                .forEach(b => b.classList.remove('active'));
        }
    } else {
        entry.layer.addTo(map);
        entry.visible = true;
        if (hideBtn) hideBtn.classList.remove('active');
        if (nameEl) nameEl.classList.remove('muted');
        // Restore the correct opacity pip
        const opacityPct = String(Math.round((entry.opacity ?? 1) * 100));
        const pipsContainer = document.getElementById(`opacity-pips-${id}`);
        if (pipsContainer) {
            pipsContainer.querySelectorAll('.opacity-pip:not(.hide-pip)').forEach(b => {
                b.classList.toggle('active', b.dataset.v === opacityPct);
            });
        }
        // Re-apply opacity so features aren't reset to full after unhide
        if (entry.opacity !== undefined && entry.opacity < 1) {
            applyLayerOpacity(id, entry.opacity);
        }
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
    featureIndex = featureIndex.filter(e => e.layerId !== id); // purge from search index

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
function showSidebar() {
    sidebar.classList.remove('sidebar-hidden');
    setTimeout(() => map.invalidateSize(), 280);
    injectSearchUI(); // idempotent — only builds DOM once
}
function hideOverlay() { uploadOverlay.classList.add('hidden'); }
function showOverlay() { uploadOverlay.classList.remove('hidden'); }

// ─── Feature Search ───────────────────────────────────────────────
let _searchInjected = false;
function injectSearchUI() {
    if (_searchInjected || !sidebar) return;
    _searchInjected = true;

    const header = sidebar.querySelector('.sidebar-header');
    if (!header) return;

    const wrap = document.createElement('div');
    wrap.id = '_search-wrap';
    wrap.className = 'search-wrap';
    wrap.innerHTML = `
        <div class="search-input-wrap">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input type="text" id="_search-box" class="search-input"
                placeholder="Search features…" autocomplete="off" spellcheck="false">
        </div>
        <div id="_search-results" class="search-results hidden"></div>`;
    header.insertAdjacentElement('afterend', wrap);

    const input = wrap.querySelector('#_search-box');
    const results = wrap.querySelector('#_search-results');

    function closeResults() { results.classList.add('hidden'); }

    function renderResults(q, exact) {
        if (!q) { closeResults(); return; }
        const matches = featureIndex
            .filter(e => exact
                ? e.name.toLowerCase() === q          // trailing space → exact match
                : e.name.toLowerCase().includes(q))   // no space → substring match
            .slice(0, 12);

        if (!matches.length) {
            results.innerHTML = `<div class="search-no-result">${exact ? 'No exact match' : 'No matches found'}</div>`;
        } else {
            results.innerHTML = matches.map((e, i) => `
                <div class="search-result-item" data-i="${i}">
                    <span class="search-result-name">${hlMatch(e.name, q)}</span>
                    <span class="search-result-layer">${layers[e.layerId]?.name ?? ''}</span>
                </div>`).join('');
            results.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', () => {
                    flyToFeature(matches[+el.dataset.i]);
                    input.value = matches[+el.dataset.i].name;
                    closeResults();
                });
            });
        }
        results.classList.remove('hidden');
    }

    input.addEventListener('input', () => {
        const raw = input.value;
        const endsWithSpace = raw.endsWith(' '); // trailing space = exact mode
        const q = raw.trim().toLowerCase();
        renderResults(q, endsWithSpace);
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeResults(); input.blur(); }
    });
    // Close when clicking outside
    document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) closeResults();
    }, true);
}

// Highlight matched substring inside a feature name
function hlMatch(text, q) {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return _esc(text);
    return _esc(text.slice(0, i))
        + `<mark>${_esc(text.slice(i, i + q.length))}</mark>`
        + _esc(text.slice(i + q.length));
}
function _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Fly map to a feature: fitBounds for polygons/lines, flyTo for points
function flyToFeature(entry) {
    try {
        let usedBounds = false;
        // Polygons and lines have getBounds — fit the whole shape on screen
        if (entry.lyr.getBounds) {
            try {
                const b = entry.lyr.getBounds();
                if (b.isValid()) {
                    map.flyToBounds(b, { padding: [60, 60], maxZoom: 17, duration: 0.7 });
                    usedBounds = true;
                }
            } catch (_) { }
        }
        // Points (no getBounds) — just centre on the pin
        if (!usedBounds) {
            map.flyTo(entry.center, Math.max(map.getZoom(), 15), { duration: 0.7 });
        }
        // Show feature description panel after the fly animation settles
        setTimeout(() => {
            try {
                if (entry.html) {
                    const panel = _getFeatDescPanel();
                    _featDescActiveLyr = entry.lyr;
                    panel.querySelector('.feat-desc-body').innerHTML = entry.html;
                    panel.classList.remove('feat-desc-hidden');
                    // Position near the feature center in screen space
                    const pt = map.latLngToContainerPoint(entry.center);
                    const mapRect = mapWrap.getBoundingClientRect();
                    _positionFeatDesc(pt.x + mapRect.left, pt.y + mapRect.top, panel);
                } else {
                    entry.lyr.openPopup();
                }
            } catch (_) { }
        }, 800);
    } catch (_) { }
}

// ─── Keyboard shortcut: Ctrl+F or '/' focuses search ─────────────
document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA';
    if ((e.ctrlKey && e.key === 'f') || (!isTyping && e.key === '/')) {
        const box = document.getElementById('_search-box');
        if (box) { e.preventDefault(); box.focus(); box.select(); }
    }
});

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
const FETCH_THROTTLE_MS = 1500; // Min ms between imagery API calls

// Track mouse position for the I-key imagery shortcut
map.on('mousemove', e => { lastMouseLatLng = e.latlng; });

// Debounce helper — coalesces rapid moveend/zoomend into a single call
function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// Update on map move/zoom end — debounced so rapid panning fires only once
const debouncedUpdateImageryDate = debounce(updateImageryDate, 300);
map.on('moveend', debouncedUpdateImageryDate);
map.on('zoomend', debouncedUpdateImageryDate);

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

    // Enforce throttle — skip if called too soon after the last successful fetch
    const now = Date.now();
    if (now - lastImageryFetch < FETCH_THROTTLE_MS) return;

    const center = map.getCenter();

    // Show loading state
    imageryDateDisplay.textContent = 'Checking imagery date...';
    imageryDateDisplay.style.display = 'block';

    try {
        const date = await fetchImageryDate(center);
        lastImageryFetch = Date.now(); // Record time of successful fetch
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

// ─── Feature Description Panel ────────────────────────────────────────────
// Singleton floating panel that shows polygon/feature description on click.
// Smart positioning: prefers right-of / below the click point and flips if
// the panel would overflow the map container edges.
let _featDescPanel = null;
let _featDescActiveLyr = null;
let _featDescClickGuard = false; // prevents map-click from closing the panel that just opened

function _getFeatDescPanel() {
    if (_featDescPanel) return _featDescPanel;
    _featDescPanel = document.createElement('div');
    _featDescPanel.id = 'feat-desc-panel';
    _featDescPanel.classList.add('feat-desc-hidden');
    _featDescPanel.innerHTML = `
        <button class="feat-desc-close" title="Close">
            <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="feat-desc-body"></div>`;
    if (mapWrap) mapWrap.appendChild(_featDescPanel);

    _featDescPanel.querySelector('.feat-desc-close').addEventListener('click', e => {
        e.stopPropagation();
        _closeFeatDesc();
    });

    // Close when clicking on the empty map (guard prevents the opening click from closing it)
    map.on('click', () => {
        if (_featDescClickGuard) { _featDescClickGuard = false; return; }
        _closeFeatDesc();
    });

    return _featDescPanel;
}

function _closeFeatDesc() {
    if (!_featDescPanel) return;
    _featDescPanel.classList.add('feat-desc-hidden');
    _featDescActiveLyr = null;
}

function _showFeatDesc(e, html, lyr) {
    const panel = _getFeatDescPanel();

    // Toggle: clicking the same feature while open → close
    if (_featDescActiveLyr === lyr && !panel.classList.contains('feat-desc-hidden')) {
        _closeFeatDesc();
        _featDescClickGuard = true; // absorb the map-click that will follow
        return;
    }

    _featDescClickGuard = true; // absorb the concurrent map-click
    _featDescActiveLyr = lyr;
    panel.querySelector('.feat-desc-body').innerHTML = html;
    panel.classList.remove('feat-desc-hidden');

    // Capture coords now; position after the browser lays out the panel content
    const cx = e.originalEvent.clientX;
    const cy = e.originalEvent.clientY;
    requestAnimationFrame(() => _positionFeatDesc(cx, cy, panel));
}

// Place the panel in the quadrant with the most available space around (cx, cy).
// cx / cy are viewport-relative coordinates (clientX / clientY).
function _positionFeatDesc(clientX, clientY, panel) {
    const mapRect = mapWrap.getBoundingClientRect();
    const W = 369; // panel CSS width
    const margin = 14;
    const mapW = mapRect.width;
    const mapH = mapRect.height;
    const availH = mapH - margin * 2;
    const cx = clientX - mapRect.left;   // container-relative
    const cy = clientY - mapRect.top;

    // Let the body grow to fill all available map height, then scroll if needed
    const bodyEl = panel.querySelector('.feat-desc-body');
    if (bodyEl) bodyEl.style.maxHeight = `${availH}px`;

    const H = Math.min(panel.offsetHeight || 300, availH);

    // Horizontal: prefer right of click, flip left if it overflows
    let left = cx + margin;
    if (left + W > mapW - margin) left = cx - W - margin;
    left = Math.max(margin, Math.min(left, mapW - W - margin));

    // Vertical: prefer below click, flip above if it overflows
    let top = cy + margin;
    if (top + H > mapH - margin) top = cy - H - margin;
    top = Math.max(margin, Math.min(top, mapH - H - margin));

    // ── Callout arrow ──────────────────────────────────────────────
    // Determine which edge of the panel faces the feature and where
    // along that edge the arrow tip should sit (aligned to click point).
    const ARROW_CLAMP = 22; // keep tip away from rounded corners
    panel.classList.remove('arrow-left', 'arrow-right', 'arrow-top', 'arrow-bottom');

    let arrowSide, arrowOffset;
    if (left >= cx) {
        // Panel is to the right → arrow on left edge, tip at click Y
        arrowSide = 'left';
        arrowOffset = Math.max(ARROW_CLAMP, Math.min(cy - top, H - ARROW_CLAMP));
    } else if (left + W <= cx) {
        // Panel is to the left → arrow on right edge, tip at click Y
        arrowSide = 'right';
        arrowOffset = Math.max(ARROW_CLAMP, Math.min(cy - top, H - ARROW_CLAMP));
    } else if (top >= cy) {
        // Panel is below → arrow on top edge, tip at click X
        arrowSide = 'top';
        arrowOffset = Math.max(ARROW_CLAMP, Math.min(cx - left, W - ARROW_CLAMP));
    } else {
        // Panel is above → arrow on bottom edge, tip at click X
        arrowSide = 'bottom';
        arrowOffset = Math.max(ARROW_CLAMP, Math.min(cx - left, W - ARROW_CLAMP));
    }

    panel.classList.add(`arrow-${arrowSide}`);
    panel.style.setProperty('--arrow-offset', `${arrowOffset}px`);

    // Animate pop-in from the arrow tip
    const origins = { left: `left ${arrowOffset}px`, right: `right ${arrowOffset}px`,
                      top: `${arrowOffset}px top`,   bottom: `${arrowOffset}px bottom` };
    panel.style.transformOrigin = origins[arrowSide] || 'top left';

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${mapH - margin * 2}px`;
}

// ─── Shared Mini-Map Overview ──────────────────────────────────────────────
let miniMapLeaflet = null;
let miniViewportRect = null;
let miniPanel = null;

function initSharedMiniMap() {
    if (miniMapLeaflet) return;

    // 1. Build DOM structure dynamically
    miniPanel = document.createElement('div');
    miniPanel.id = 'mini-map-panel';
    // Hide initially until a layer is actually loaded to keep the map clean
    miniPanel.style.display = 'none';

    miniPanel.innerHTML = `
        <div id="mini-map-container"></div>
        <div id="mini-map-blocker"></div>
        <button id="mini-map-toggle-btn" title="Toggle overview">
            <i class="fa-solid fa-compress"></i>
        </button>
    `;

    // Inject into the map wrapper so it overlays nicely over the primary map
    const wrapper = document.getElementById('map-wrap') || document.body;
    wrapper.appendChild(miniPanel);

    // Bind window toggle function
    document.getElementById('mini-map-toggle-btn').addEventListener('click', () => {
        if (!miniPanel) return;
        const isCollapsed = miniPanel.classList.toggle('collapsed');
        const icon = miniPanel.querySelector('#mini-map-toggle-btn i');
        if (icon) icon.className = isCollapsed ? 'fa-solid fa-expand' : 'fa-solid fa-compress';

        // Refresh Leaflet size after expand finishes (wait for CSS transition)
        if (!isCollapsed && miniMapLeaflet) {
            setTimeout(() => miniMapLeaflet.invalidateSize(), 520);
            syncMiniMapView();
        }
    });

    // 2. Initialize second static Leaflet map — completely read-only
    miniMapLeaflet = L.map('mini-map-container', {
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        zoomControl: false,
        attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMapLeaflet);

    // 3. Bind to the primary map's movement — debounced so rapid pan/zoom frames
    //    don't queue redundant minimap tile fetches and viewport rect updates.
    syncMiniMapView();
    map.on('moveend zoomend', debounce(syncMiniMapView, 120));
}

function syncMiniMapView() {
    if (!miniMapLeaflet) return;

    // Keep the minimap much more zoomed out than the primary map (contextual overview)
    const zoom = Math.max(0, map.getZoom() - 8);
    miniMapLeaflet.setView(map.getCenter(), zoom, { animate: false });

    // Draw / update the viewport rectangle representing the main map's bounds
    const bounds = map.getBounds();
    if (!miniViewportRect) {
        miniViewportRect = L.rectangle(bounds, {
            color: '#e5322d', weight: 2,
            fill: true, fillColor: '#e5322d', fillOpacity: 0.12,
            interactive: false
        }).addTo(miniMapLeaflet);
    } else {
        miniViewportRect.setBounds(bounds);
    }
}

// Function exposed to reveal the minimap when appropriate (e.g. after KMZ load)
function showSharedMiniMap() {
    if (miniPanel && (miniPanel.style.display === 'none' || !miniPanel.style.display)) {
        miniPanel.style.display = 'block';
        // Wait for it to become visible before recalculating canvas size
        setTimeout(() => { if (miniMapLeaflet) miniMapLeaflet.invalidateSize(); }, 100);
    }
}

// Initialize the structure once the DOM is ready
document.addEventListener('DOMContentLoaded', initSharedMiniMap);




