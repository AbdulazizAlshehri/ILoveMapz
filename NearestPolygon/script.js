let mapFile = null;
let dataFile = null;
let parsedExcelData = [];
let excelHeaders = [];
let outputBlob = null;
let jobContext = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 1. Setup Drop Zones
    const mapDrop = setupUnifiedDropZone('drop-zone-map', 'map-input', (files) => {
        if (files && files[0]) {
            mapFile = files[0];
            checkStartAvailability();
        }
    }, () => {
        mapFile = null;
        checkStartAvailability();
    });

    const dataDrop = setupUnifiedDropZone('drop-zone-data', 'data-input', (files) => {
        if (files && files[0]) {
            dataFile = files[0];
            checkStartAvailability();
        }
    }, () => {
        dataFile = null;
        checkStartAvailability();
    });

    // Navigation Buttons
    document.getElementById('btn-cancel').addEventListener('click', resetApp);
    document.getElementById('btn-restart').addEventListener('click', resetApp);
    document.getElementById('btn-process').addEventListener('click', startProcessing);
    document.getElementById('btn-download').addEventListener('click', () => {
        if (outputBlob) {
            const outName = dataFile.name.replace(/\.[^/.]+$/, "") + "_Nearest.xlsx";
            saveAs(outputBlob, outName);
        }
    });
}

function checkStartAvailability() {
    if (mapFile && dataFile) {
        document.getElementById('map-file-name').textContent = `${mapFile.name} (${formatFileSize(mapFile.size)})`;
        document.getElementById('map-file-name').title = document.getElementById('map-file-name').textContent;

        document.getElementById('data-file-name').textContent = `${dataFile.name} (${formatFileSize(dataFile.size)})`;
        document.getElementById('data-file-name').title = document.getElementById('data-file-name').textContent;

        parseExcelAndShowConfig();
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    // Hide header description and reduce margin on processing/result views to perfectly center content
    const toolHeader = document.querySelector('.tool-header');
    if (toolHeader) {
        const pView = document.getElementById('processing-view');
        const rView = document.getElementById('result-view');
        if (document.getElementById(viewId) === pView || document.getElementById(viewId) === rView) {
            toolHeader.classList.add('condensed');
        } else {
            toolHeader.classList.remove('condensed');
        }
    }
}

function updateProgress(percent, text, details = '') {
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('progress-text');
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.textContent = text;

    let detailsEl = document.getElementById('progress-details');
    if (!detailsEl) {
        detailsEl = document.createElement('p');
        detailsEl.id = 'progress-details';
        detailsEl.style = "margin-top: 5px; font-size: 14px; color: #888;";
        const container = document.getElementById('processing-view');
        if (container) container.appendChild(detailsEl);
    }
    detailsEl.textContent = details;
}

// ==============
// CONFIG PHASE
// ==============
async function parseExcelAndShowConfig() {
    showView('processing-view');
    updateProgress(10, "Reading Excel...");

    try {
        const data = await dataFile.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        parsedExcelData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (parsedExcelData.length === 0) {
            alert("No data found in the Excel file.");
            resetApp();
            return;
        }

        excelHeaders = Object.keys(parsedExcelData[0]);

        const latSelect = document.getElementById('lat-select');
        const lngSelect = document.getElementById('lng-select');

        latSelect.innerHTML = '';
        lngSelect.innerHTML = '';

        excelHeaders.forEach(opt => {
            const latOpt = document.createElement('option');
            latOpt.value = opt;
            latOpt.textContent = opt;
            latSelect.appendChild(latOpt);

            const lngOpt = document.createElement('option');
            lngOpt.value = opt;
            lngOpt.textContent = opt;
            lngSelect.appendChild(lngOpt);
        });

        // Auto-select Lat/Lng
        const latMatch = excelHeaders.find(h => h.toLowerCase().includes('lat'));
        const lngMatch = excelHeaders.find(h => h.toLowerCase().includes('lon') || h.toLowerCase().includes('lng'));

        if (latMatch) latSelect.value = latMatch;
        if (lngMatch) lngSelect.value = lngMatch;

        showView('config-view');
    } catch (err) {
        console.error("Error parsing Excel", err);
        alert("Failed to parse the Excel file.");
        resetApp();
    }
}

// ==============
// ALGORITHMS
// ==============
// Ray-casting algorithm to determine if a point is inside a polygon
function pointInPolygon(point, vs) {
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i][0], yi = vs[i][1];
        let xj = vs[j][0], yj = vs[j][1];

        let intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Shortest distance from point to a line segment
// Returns distance in meters
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    // A rough approximation for small distances: treat lat/lon as flat cartesian and use haversine only on the closest point
    const x = lon;
    const y = lat;
    const x1 = lon1;
    const y1 = lat1;
    const x2 = lon2;
    const y2 = lat2;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq != 0) //in case of 0 length line
        param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    }
    else if (param > 1) {
        xx = x2;
        yy = y2;
    }
    else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    // Now calculate distance from (lat, lon) to (yy, xx)
    return haversineDistance(lat, lon, yy, xx);
}

// Minimum possible distance from (lat,lon) to a bounding box.
// Returns 0 when the point is inside the box.
function bboxMinDist(lat, lon, bbox) {
    const cLat = Math.max(bbox.minLat, Math.min(lat, bbox.maxLat));
    const cLon = Math.max(bbox.minLon, Math.min(lon, bbox.maxLon));
    return haversineDistance(lat, lon, cLat, cLon);
}

// ==============
// PROCESSING
// ==============
async function startProcessing() {
    const latCol = document.getElementById('lat-select').value;
    const lngCol = document.getElementById('lng-select').value;
    const thresholdInput = document.getElementById('threshold-input').value;
    const threshold = parseFloat(thresholdInput);
    const useThreshold = !isNaN(threshold) && threshold > 0;

    if (!latCol || !lngCol) {
        alert("Please select Latitude and Longitude columns.");
        return;
    }

    showView('processing-view');
    updateProgress(20, "Extracting Map File...");

    jobContext = window.JobTracker ? window.JobTracker.start('NearestPolygon', [dataFile, mapFile]) : null;

    try {
        let kmlString = "";

        // Extract KML from KMZ or read directly
        if (mapFile.name.toLowerCase().endsWith('.kmz')) {
            const zip = await JSZip.loadAsync(mapFile);
            const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
            if (!kmlFile) throw new Error("No KML file inside the KMZ.");
            kmlString = await zip.files[kmlFile].async('string');
        } else {
            kmlString = await mapFile.text();
        }

        updateProgress(40, "Parsing map contents...");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlString, "text/xml");

        // Parse Polygons
        const placemarks = xmlDoc.getElementsByTagName('Placemark');
        const polygons = [];

        for (let i = 0; i < placemarks.length; i++) {
            const pm = placemarks[i];
            const polyNode = pm.getElementsByTagName('Polygon')[0];
            if (!polyNode) continue;

            let name = "Unnamed Polygon";
            const nameNode = pm.getElementsByTagName('name')[0];
            if (nameNode) name = nameNode.textContent.trim();

            const outerBoundaryNode = polyNode.getElementsByTagName('outerBoundaryIs')[0];
            if (!outerBoundaryNode) continue;

            const coordStr = outerBoundaryNode.getElementsByTagName('coordinates')[0].textContent.trim();
            const coordArray = coordStr.split(/\s+/).map(c => {
                const parts = c.split(',');
                return [parseFloat(parts[0]), parseFloat(parts[1])]; // [lon, lat]
            }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

            // Pre-compute bounding box for fast spatial pruning
            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            for (const [lon, lat] of coordArray) {
                if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
            }

            polygons.push({
                name,
                coords: coordArray,
                bbox: { minLat, maxLat, minLon, maxLon }
            });
        }

        if (polygons.length === 0) {
            throw new Error("No polygons found in the uploaded map file.");
        }

        updateProgress(50, "Matching points to polygons...");

        let withinPolygon = 0;   // inside at least one polygon
        let linkedToNearest = 0; // outside but linked to nearest within threshold
        let notLinked = 0;       // outside and beyond threshold (or no threshold set)

        const totalPoints = parsedExcelData.length;
        const chunkSize = 2000; // larger chunks — yieldToMain uses fast MessageChannel

        for (let i = 0; i < totalPoints; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize, totalPoints);
            for (let j = i; j < chunkEnd; j++) {
                const row = parsedExcelData[j];
                const lat = parseFloat(row[latCol]);
                const lon = parseFloat(row[lngCol]);

                if (isNaN(lat) || isNaN(lon)) {
                    row['Container_Polygons'] = "Invalid Coordinates";
                    row['Nearest_Polygon'] = "";
                    row['Distance_to_Nearest (m)'] = "";
                    continue;
                }

                const point = [lon, lat];
                let containedIn = [];

                for (const poly of polygons) {
                    // Bbox pre-check — skip ray-cast when point is outside the box
                    const bb = poly.bbox;
                    if (lat < bb.minLat || lat > bb.maxLat || lon < bb.minLon || lon > bb.maxLon) continue;
                    if (pointInPolygon(point, poly.coords)) containedIn.push(poly.name);
                }

                if (containedIn.length > 0) {
                    const containers = containedIn.join(', ');
                    row['Container_Polygons'] = containers;
                    row['Nearest_Polygon'] = containers;
                    row['Distance_to_Nearest (m)'] = 0;
                    withinPolygon++;
                } else {
                    row['Container_Polygons'] = "";

                    if (useThreshold) {
                        // Nearest-polygon search with bbox lower-bound pruning:
                        // bboxMinDist gives the minimum distance a polygon could possibly
                        // be — if it already exceeds our current best, skip all its segments.
                        let minDist = threshold + 1; // start just above threshold so we only keep candidates ≤ threshold
                        let nearestName = "";

                        for (const poly of polygons) {
                            // Fast lower-bound: skip if bbox is farther than current best
                            if (bboxMinDist(lat, lon, poly.bbox) >= minDist) continue;

                            for (let k = 0; k < poly.coords.length - 1; k++) {
                                const p1 = poly.coords[k];
                                const p2 = poly.coords[k + 1];
                                const dist = pointToSegmentDistance(lat, lon, p1[1], p1[0], p2[1], p2[0]);
                                if (dist < minDist) { minDist = dist; nearestName = poly.name; }
                            }
                        }

                        if (nearestName) {
                            row['Nearest_Polygon'] = nearestName;
                            row['Distance_to_Nearest (m)'] = Number(minDist.toFixed(2));
                            linkedToNearest++;
                        } else {
                            row['Nearest_Polygon'] = "";
                            row['Distance_to_Nearest (m)'] = "";
                            notLinked++;
                        }
                    } else {
                        row['Nearest_Polygon'] = "";
                        row['Distance_to_Nearest (m)'] = "";
                        notLinked++;
                    }
                }
            }
            const percent = 50 + Math.floor((chunkEnd / totalPoints) * 40);
            updateProgress(percent, `Processing points...`, `Processed ${chunkEnd} of ${totalPoints}`);
            await window.yieldToMain();
        }

        updateProgress(90, "Generating Excel File...");

        const newSheet = XLSX.utils.json_to_sheet(parsedExcelData);
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Nearest Polygon");

        const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
        outputBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

        updateProgress(100, "Done!");

        if (window.JobTracker) {
            const outName = dataFile.name.replace(/\.[^/.]+$/, "") + "_Nearest.xlsx";
            outputBlob.name = outName;
            window.JobTracker.finish(jobContext, [outputBlob]);
        }

        setTimeout(() => {
            showResult(withinPolygon, linkedToNearest, notLinked, threshold);
        }, 500);

    } catch (err) {
        console.error("Processing error", err);
        if (window.JobTracker) window.JobTracker.fail(jobContext, err.message);
        alert("An error occurred during processing: " + err.message);
        resetApp();
    }
}

function showResult(withinPolygon, linkedToNearest, notLinked, threshold) {
    const totalLinked = withinPolygon + linkedToNearest;
    const totalPoints = totalLinked + notLinked;
    const sumDiv = document.getElementById('result-summary');
    sumDiv.innerHTML = `
        <div class="stats-container">
            <div class="stat-card solid-dark">
                <div class="stat-card-value">${formatNumber(totalPoints)}</div>
                <div class="stat-card-label">Total Points</div>
            </div>
            <div class="stat-card solid-success">
                <div class="stat-card-value">${formatNumber(totalLinked)}</div>
                <div class="stat-card-label">Linked</div>
            </div>
            <div class="stat-card solid-danger">
                <div class="stat-card-value">${formatNumber(notLinked)}</div>
                <div class="stat-card-label">Not Linked</div>
            </div>
        </div>
        <div style="margin-top:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; font-size:13px; color:#334155; text-align:left; line-height:2;">
            <div style="font-weight:700; margin-bottom:4px; color:#2c3e50;">Linked breakdown</div>
            <div style="display:flex; gap:8px; align-items:center;">
                <span style="color:#aaa; font-size:15px;">├</span>
                <span><strong>${formatNumber(withinPolygon)}</strong> within polygons</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <span style="color:#aaa; font-size:15px;">└</span>
                <span><strong>${formatNumber(linkedToNearest)}</strong> linked to nearest polygon within <strong>${formatNumber(threshold)} m</strong></span>
            </div>
        </div>
        <div style="margin-top: 14px; font-size: 14px; color: #64748b; background: #f8f9fa; padding: 8px 16px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0;">
            <i class="fa-solid fa-file-signature" style="color:var(--color-primary);"></i>
            <span>Output File: <strong style="color: #334155;">${dataFile.name.replace(/\.[^/.]+$/, "")}_Nearest.xlsx</strong></span>
        </div>
    `;
    const outName = dataFile.name.replace(/\.[^/.]+$/, "") + "_Nearest.xlsx";
    saveAs(outputBlob, outName);
    showView('result-view');
}

function resetApp() {
    mapFile = null;
    dataFile = null;
    parsedExcelData = [];
    excelHeaders = [];
    outputBlob = null;
    window.location.reload();
}
