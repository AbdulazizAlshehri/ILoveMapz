// ═══════════════════════════════════════════════════════════════════
//  KMZ Preview — App Logic
// ═══════════════════════════════════════════════════════════════════

// Note: Core map logic is in ../kmz_core.js

// ─── DOM ──────────────────────────────────────────────────────────
const fileInputInitial = document.getElementById('file-input-initial');
const fileInputMap = document.getElementById('file-input-map');
const fileInputNav = document.getElementById('file-input-nav');

// ─── Event Wiring ─────────────────────────────────────────────────
// ─── Event Wiring ─────────────────────────────────────────────────
// Manual Event Wiring for Initial Upload (Reverted from Unified)
const btnInitial = document.getElementById('btn-select-file-initial');
if (btnInitial && fileInputInitial) {
    btnInitial.addEventListener('click', () => fileInputInitial.click());
    fileInputInitial.addEventListener('change', e => {
        handleKmzFiles(e.target.files);
        fileInputInitial.value = '';
    });
}

document.getElementById('btn-upload-nav')?.addEventListener('click', () => fileInputNav.click());
document.getElementById('btn-add-more')?.addEventListener('click', () => fileInputMap.click());

document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    // layers object is global from kmz_core.js
    if (!Object.keys(layers).length) return;
    if (confirm('Remove all layers?')) [...Object.keys(layers)].forEach(id => removeLayer(id));
});

// File inputs -> handleKmzFiles (global from kmz_core.js)
// fileInputInitial handled by helper
fileInputMap?.addEventListener('change', e => { handleKmzFiles(e.target.files); fileInputMap.value = ''; });
fileInputNav?.addEventListener('change', e => { handleKmzFiles(e.target.files); fileInputNav.value = ''; });

// ─── Init ─────────────────────────────────────────────────────────
console.log('KMZ Preview ready.');
