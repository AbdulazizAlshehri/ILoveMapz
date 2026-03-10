// ═══════════════════════════════════════════════════════════════════
//  KMZ Field Auditor — App Logic
// ═══════════════════════════════════════════════════════════════════

const SESSION_KEY = 'kmz_field_auditor_session';

// ─── State ────────────────────────────────────────────────────────
// Note: 'map', 'layers', 'layerIdCounter', 'targetLayerId' are global from kmz_core.js

let excelRows = [];
let excelHeaders = [];
let lookupCol = '';
let noteColName = 'Audit Note';
let annotations = {};
let currentRow = 0;
let auditReady = false;   // true when both Excel + KMZ loaded and lookup col chosen

// ─── DOM ──────────────────────────────────────────────────────────
// Core DOM elements (sidebar, mapWrap) are in kmz_core.js

// Config panel
const selLookupCol = document.getElementById('sel-lookup-col');
const selTargetLayer = document.getElementById('sel-target-layer');
const inpNoteCol = document.getElementById('inp-note-col');
const excelFilename = document.getElementById('excel-filename');
const btnLoadExcel = document.getElementById('btn-load-excel');
const fileInputExcel = document.getElementById('file-input-excel');

// Progress
const progCur = document.getElementById('prog-cur');
const progTotal = document.getElementById('prog-total');
const progPct = document.getElementById('prog-pct');
const progAnnotated = document.getElementById('prog-annotated');
const auditProgressBar = document.getElementById('audit-progress-bar');

// Row info
const rowIdLabel = document.getElementById('row-id-label');
const rowMatchStatus = document.getElementById('row-match-status');
const rowExtraFields = document.getElementById('row-extra-fields');
const notFoundBanner = document.getElementById('not-found-banner');
const noteColNameSpan = document.getElementById('note-col-name');

// Note
const auditNote = document.getElementById('audit-note');
const auditStatsList = document.getElementById('audit-stats-list');
const statsTotalBadge = document.getElementById('stats-total-badge');

// Navigation
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const rowJumpInput = document.getElementById('row-jump-input');
const btnJump = document.getElementById('btn-jump');

// File inputs (Core handles KMZ inputs, we handle Excel)
const fileInputInitial = document.getElementById('file-input-initial');
const fileInputMap = document.getElementById('file-input-map');
const fileInputNav = document.getElementById('file-input-nav');

// export button
const btnExport = document.getElementById('btn-export');



// ─── Core Hooks ───────────────────────────────────────────────────
// Called by kmz_core.js when KMZ files are loaded
window.onKmzLoaded = function () {
    refreshTargetLayerDropdown();
    checkAuditReady();
    if (auditReady) renderAuditRow();
};

// Called by kmz_core.js when a layer is removed
window.onLayerRemoved = function () {
    refreshTargetLayerDropdown();
    checkAuditReady();
};

// Override setTargetLayer behavior to update audit state
window.onTargetLayerSet = function (id) {
    selTargetLayer.value = id;

    let zoomedToFeature = false;
    checkAuditReady();
    if (auditReady) {
        zoomedToFeature = renderAuditRow();
    }

    // Return true if we handled the zoom (so core doesn't double-zoom)
    return zoomedToFeature;
};

// Expose handleExcelFile globally for drag-and-drop in core
window.handleExcelFile = handleExcelFile;

// ─── Event Wiring ─────────────────────────────────────────────────
// KMZ inputs -> handled by core logic via handlers below
document.getElementById('btn-select-kmz-initial').addEventListener('click', () => fileInputInitial.click());
document.getElementById('btn-upload-nav').addEventListener('click', () => fileInputNav.click());
document.getElementById('btn-add-more').addEventListener('click', () => fileInputMap.click());
document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (!Object.keys(layers).length) return;
    if (confirm('Remove all layers?')) [...Object.keys(layers)].forEach(id => removeLayer(id));
});

fileInputInitial.addEventListener('change', e => { handleKmzFiles(e.target.files); fileInputInitial.value = ''; });
fileInputMap.addEventListener('change', e => { handleKmzFiles(e.target.files); fileInputMap.value = ''; });
fileInputNav.addEventListener('change', e => { handleKmzFiles(e.target.files); fileInputNav.value = ''; });

// Excel inputs
btnLoadExcel.addEventListener('click', () => fileInputExcel.click());
btnExport.addEventListener('click', exportExcel);
fileInputExcel.addEventListener('change', e => { handleExcelFile(e.target.files[0]); fileInputExcel.value = ''; });

// Inline config — react immediately on change
selLookupCol.addEventListener('change', () => {
    lookupCol = selLookupCol.value;
    noteColNameSpan.textContent = lookupCol ? noteColName : '';
    checkAuditReady();
    if (auditReady) renderAuditRow();
    saveSession();
});

selTargetLayer.addEventListener('change', () => {
    const id = parseInt(selTargetLayer.value);
    if (!isNaN(id)) window.setTargetLayer(id); // Calls core -> calls our hook
    saveSession();
});

inpNoteCol.addEventListener('change', () => {
    noteColName = inpNoteCol.value.trim() || 'Audit Note';
    noteColNameSpan.textContent = noteColName;
    saveSession();
});


// Navigation
btnPrev.addEventListener('click', () => navigateTo(currentRow - 1));
btnNext.addEventListener('click', () => navigateTo(currentRow + 1));
btnJump.addEventListener('click', () => {
    const n = parseInt(rowJumpInput.value, 10);
    if (!isNaN(n) && n >= 1 && n <= excelRows.length) navigateTo(n - 1);
    rowJumpInput.value = '';
});
rowJumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnJump.click(); });

document.addEventListener('keydown', e => {
    if (!auditReady) return;
    if (document.activeElement === auditNote) return;
    if (document.activeElement === rowJumpInput) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigateTo(currentRow + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navigateTo(currentRow - 1); }
});

auditNote.addEventListener('input', () => {
    if (!excelRows.length) return;
    annotations[currentRow] = auditNote.value;
    updateProgress();
    saveSession();
});

// Enter (without Shift) in the note textarea → save & go to next row
auditNote.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // navigateTo will handle the skipped! logic itself
        navigateTo(currentRow + 1);
    }
});

// ─── Excel File Handling ──────────────────────────────────────────
async function handleExcelFile(file) {
    if (!file) return;
    try {
        const buffer = await file.arrayBuffer();
        let wb;
        if (/\.csv$/i.test(file.name)) {
            wb = XLSX.read(new TextDecoder().decode(buffer), { type: 'string' });
        } else {
            wb = XLSX.read(buffer, { type: 'array' });
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data.length) { alert('Excel file appears to be empty.'); return; }

        excelRows = data;
        excelHeaders = Object.keys(data[0]);
        annotations = {};
        currentRow = 0;

        // Update filename display
        excelFilename.textContent = `${file.name} (${data.length} rows)`;
        excelFilename.classList.add('loaded');

        // Populate lookup col dropdown
        selLookupCol.innerHTML = '<option value="">— select column —</option>';
        excelHeaders.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h; opt.textContent = h;
            if (h === lookupCol) opt.selected = true;
            selLookupCol.appendChild(opt);
        });

        // Auto-select if only one column or previous selection matches
        if (!lookupCol && excelHeaders.length === 1) {
            selLookupCol.value = excelHeaders[0];
            lookupCol = excelHeaders[0];
        }

        btnExport.style.display = 'flex';
        updateProgress();
        checkAuditReady();
        if (auditReady) renderAuditRow();
        saveSession();
    } catch (e) {
        console.error(e);
        alert('Error reading Excel file: ' + e.message);
    }
}

// ─── Audit Readiness ──────────────────────────────────────────────
function checkAuditReady() {
    lookupCol = selLookupCol.value;
    noteColName = inpNoteCol.value.trim() || 'Audit Note';
    noteColNameSpan.textContent = lookupCol ? noteColName : '';

    const wasReady = auditReady;
    auditReady = !!(excelRows.length && lookupCol && targetLayerId !== null);

    btnPrev.disabled = !auditReady || currentRow === 0;
    btnNext.disabled = !auditReady || currentRow === excelRows.length - 1;

    if (auditReady && !wasReady) {
        // Just became ready — render first row
        renderAuditRow();
        updateProgress();
    }
}

// ─── Navigation ───────────────────────────────────────────────────
function navigateTo(index) {
    if (!auditReady || !excelRows.length) return;
    // Auto-mark as "skipped!" when leaving a row with no annotation
    annotations[currentRow] = auditNote.value.trim() ? auditNote.value : 'skipped!';
    saveSession();

    currentRow = Math.max(0, Math.min(index, excelRows.length - 1));
    renderAuditRow();
    updateProgress();
}

// ─── Render Current Row ───────────────────────────────────────────
function renderAuditRow() {
    if (!excelRows.length || !lookupCol) return false;

    const row = excelRows[currentRow];
    const lookupValue = String(row[lookupCol] ?? '').trim();

    rowIdLabel.textContent = lookupValue || `Row ${currentRow + 1}`;

    // Extra fields
    rowExtraFields.innerHTML = '';
    excelHeaders.filter(h => h !== lookupCol).slice(0, 3).forEach(h => {
        const d = document.createElement('div');
        d.className = 'extra-field';
        d.innerHTML = `<span class="ef-key">${h}:</span><span class="ef-val">${row[h] ?? ''}</span>`;
        rowExtraFields.appendChild(d);
    });

    // Restore annotation
    auditNote.value = annotations[currentRow] || '';

    // Nav state
    btnPrev.disabled = currentRow === 0;
    btnNext.disabled = currentRow === excelRows.length - 1;

    // Feature match + zoom
    const found = zoomToFeature(lookupValue);

    rowMatchStatus.className = 'match-status';
    if (!lookupValue) {
        rowMatchStatus.textContent = '';
        rowMatchStatus.className += ' no-excel';
        notFoundBanner.classList.add('hidden');
    } else if (found) {
        rowMatchStatus.textContent = '✓ Found';
        rowMatchStatus.className += ' found';
        notFoundBanner.classList.add('hidden');
    } else {
        rowMatchStatus.textContent = '⚠ Not found';
        rowMatchStatus.className += ' missing';
        notFoundBanner.classList.remove('hidden');
    }

    triggerFlash();
    setTimeout(() => auditNote.focus(), 80);
    return found;
}

// ─── Feature Zoom + Highlight ─────────────────────────────────────
// Scores a candidate feature name against the lookup value:
//   3 = exact match, 2 = feature starts with lookup, 1 = feature contains lookup, 0 = no match
function matchScore(featureName, lookup) {
    if (featureName === lookup) return 3;
    if (featureName.startsWith(lookup)) return 2;
    if (featureName.includes(lookup)) return 1;
    return 0;
}

function zoomToFeature(name) {
    if (!name || targetLayerId === null) return false;
    const entry = layers[targetLayerId];
    if (!entry) return false;

    const nameLower = name.toLowerCase();
    if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }

    // Collect all candidates scored by match quality, then pick the best.
    // entry.layer is L.featureGroup → chunk L.geoJSON layers → individual features.
    let bestScore = 0;
    let bestLyr = null;

    entry.layer.eachLayer(chunk => {
        if (!chunk.eachLayer) return;
        chunk.eachLayer(lyr => {
            const featureName = String(lyr.feature?.properties?.name ?? '').trim().toLowerCase();
            if (!featureName) return;
            const score = matchScore(featureName, nameLower);
            // Prefer higher score; on tie prefer shorter (more specific) feature name
            if (score > bestScore || (score === bestScore && score > 0 && featureName.length < String(bestLyr?.feature?.properties?.name ?? '').trim().toLowerCase().length)) {
                bestScore = score;
                bestLyr = lyr;
            }
        });
    });

    if (!bestLyr || bestScore === 0) return false;

    try {
        const b = bestLyr.getBounds ? bestLyr.getBounds() : null;
        if (b && b.isValid()) {
            map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
        } else if (bestLyr.getLatLng) {
            map.setView(bestLyr.getLatLng(), 14);
        }
    } catch (_) { }

    try {
        const feat = bestLyr.feature;
        if (feat) {
            const pulseIcon = L.divIcon({
                className: '',
                html: '<div class="pulse-ring"></div>',
                iconSize: [40, 40], iconAnchor: [20, 20]
            });
            highlightLayer = L.geoJSON(feat, {
                style: { color: '#f1c40f', weight: 3, opacity: 0.9, fillColor: '#f1c40f', fillOpacity: 0.2 },
                pointToLayer: (f, ll) => L.marker(ll, { icon: pulseIcon })
            }).addTo(map);
        }
    } catch (_) { }

    return true;
}

// ─── Progress ─────────────────────────────────────────────────────
function updateProgress() {
    if (!excelRows.length) return;
    const cur = currentRow + 1;
    const total = excelRows.length;
    const pct = Math.round((cur / total) * 100);
    const annotatedCount = Object.values(annotations).filter(v => v && v.trim()).length;

    progCur.textContent = cur;
    progTotal.textContent = total;
    progPct.textContent = pct + '%';
    progAnnotated.textContent = `${annotatedCount} annotated`;
    auditProgressBar.style.width = pct + '%';

    updateStats();
}

function updateStats() {
    if (!auditStatsList) return;

    // Count values
    const counts = {};
    Object.values(annotations).forEach(val => {
        if (!val || !val.trim()) return;
        const v = val.trim(); // Case sensitive or capitalize? Stick to raw for now
        counts[v] = (counts[v] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]); // Descending count
    const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

    // Update badge in header
    if (statsTotalBadge) {
        statsTotalBadge.textContent = totalCount ? `(${totalCount})` : '';
    }

    if (!sorted.length) {
        auditStatsList.innerHTML = '<span class="stats-empty">No annotations yet</span>';
        return;
    }

    auditStatsList.innerHTML = '';
    sorted.forEach(([val, count]) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        // Add title attribute for tooltip on hover
        item.title = val;

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = val;

        const badge = document.createElement('span');
        badge.className = 'stat-badge';
        badge.textContent = count;

        item.appendChild(label);
        item.appendChild(badge);
        // Click to filter? For now just stats.
        auditStatsList.appendChild(item);
    });
}

// ─── Export ───────────────────────────────────────────────────────
function exportExcel() {
    if (!excelRows.length) { alert('No Excel data loaded.'); return; }
    const col = inpNoteCol.value.trim() || 'Audit Note';
    const output = excelRows.map((row, i) => ({ ...row, [col]: annotations[i]?.trim() || '' }));
    const ws = XLSX.utils.json_to_sheet(output);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    const filename = excelFilename.textContent.split(' ')[0].replace(/\.[^/.]+$/, "") + `_Audited.xlsx`;
    XLSX.writeFile(wb, filename);
    window.JobTracker?.finish(window.JobTracker?.start('KMZFieldAuditor_Export', []), [{ name: filename, size: 0 }]);
}

// ─── Session ──────────────────────────────────────────────────────
function saveSession() {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            lookupCol, noteColName, targetLayerId, currentRow, annotations
        }));
    } catch (_) { }
}

function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
}

// Restore on load
(function () {
    const s = loadSession();
    if (!s) return;
    if (s.lookupCol) lookupCol = s.lookupCol;
    if (s.noteColName) { noteColName = s.noteColName; inpNoteCol.value = s.noteColName; }
    if (s.annotations) annotations = s.annotations;
    if (s.currentRow !== undefined) currentRow = s.currentRow;
})();
