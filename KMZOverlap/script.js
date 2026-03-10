document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const dropZoneA = document.getElementById('drop-zone-a'); // Coverage Source
    const fileInputA = document.getElementById('file-input-a');
    const btnSelectA = document.getElementById('btn-select-a');
    const fileNameA = document.getElementById('file-name-a');

    const dropZoneB = document.getElementById('drop-zone-b'); // Target Reference
    const fileInputB = document.getElementById('file-input-b');
    const btnSelectB = document.getElementById('btn-select-b');
    const fileNameB = document.getElementById('file-name-b');
    const targetFilterInput = document.getElementById('target-filter'); // Filter Input
    const filterColSelect = document.getElementById('filter-col-select');
    const overlapColSelect = document.getElementById('overlap-col-select');

    const btnAnalyze = document.getElementById('btn-analyze');

    // Views
    const uploadView = document.getElementById('upload-view');
    const configView = document.getElementById('config-view');
    const processingView = document.getElementById('processing-view');
    const resultView = document.getElementById('result-view');

    // Progress
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressDetails = document.getElementById('progress-details');

    // Result
    const resultSummary = document.getElementById('result-summary');
    const btnDownload = document.getElementById('btn-download');
    const btnRestart = document.getElementById('btn-restart');

    // --- State ---
    let fileA = null; // Source
    let fileB = null; // Target
    let resultWorkbook = null;

    // --- Event Listeners ---

    // --- Event Listeners ---
    // File A (Base)
    setupUnifiedDropZone('drop-zone-a', 'file-input-a', (files) => {
        handleFileSelect(files[0], 'A');
    }, () => {
        fileA = null;
        checkReady();
    });

    // File B (Target)
    setupUnifiedDropZone('drop-zone-b', 'file-input-b', (files) => {
        handleFileSelect(files[0], 'B');
    }, () => {
        fileB = null;
        checkReady();
    });

    // Manual Select Buttons (now delegated by helper, but kept for clarity/legacy specific logic if any)
    // The helper handles clicks on the zone and internal buttons.
    // We just need to ensure the logic here doesn't conflict. 
    // The original code attached click to btnSelectA -> fileInputA.click().
    // The helper does this too. We can remove the manual listeners if the IDs match.
    // In index.html, I removed IDs btn-select-a/b from buttons to rely on helper's class-based selection.

    const btnCancel = document.getElementById('btn-cancel');
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            fileA = null;
            fileB = null;
            if (document.getElementById('drop-zone-a').controller) document.getElementById('drop-zone-a').controller.reset();
            if (document.getElementById('drop-zone-b').controller) document.getElementById('drop-zone-b').controller.reset();
            showView(uploadView);
        });
    }

    // Logic
    btnAnalyze.addEventListener('click', () => {
        startAnalysis();
    });
    btnDownload.addEventListener('click', downloadResult);
    btnRestart.addEventListener('click', () => location.reload()); // Simple reset

    // --- Functions ---
    // setupDragDrop removed (replaced by shared helper)

    async function handleFileSelect(file, type) {
        if (!file || !file.name.match(/\.(kmz|kml)$/i)) {
            alert('Please select a valid .kmz or .kml file.');
            return;
        }

        let displayEl = null;
        if (type === 'A') {
            fileA = file;
            displayEl = fileNameA;
        } else {
            fileB = file;
            displayEl = fileNameB;
        }

        if (displayEl) {
            displayEl.textContent = `${file.name} (${formatFileSize(file.size)}) | Calculating...`;
            displayEl.title = displayEl.textContent;
            try {
                const geoJson = await parseFileToGeoJSON(file);
                const polygons = extractPolygons(geoJson);
                displayEl.textContent = `${file.name} (${formatFileSize(file.size)}) | ${polygons.length} features`;
                displayEl.title = displayEl.textContent;

                // Populate dropdowns when Target (B) file is loaded
                if (type === 'B' && geoJson && geoJson.features) {
                    const cols = new Set();
                    const allFeatures = geoJson.features;

                    allFeatures.forEach(p => {
                        if (!p.properties) return;

                        // 1. Read standard properties (ExtendedData / SimpleData)
                        const skip = ['styleUrl', 'styleHash', 'styleMapHash', 'stroke', 'stroke-width',
                            'stroke-opacity', 'fill', 'fill-opacity', 'description', 'visibility'];
                        Object.keys(p.properties).forEach(k => {
                            if (!skip.includes(k)) cols.add(k);
                        });

                        // 2. Parse HTML table inside description balloon
                        // (Many KMZ files store attributes as HTML tables in the description)
                        const desc = p.properties.description || '';
                        if (desc) {
                            try {
                                const domParser = new DOMParser();
                                const doc = domParser.parseFromString(desc, 'text/html');

                                // Generic Raw Text Extraction
                                const rawText = doc.body.textContent.replace(/\s+/g, ' ').trim();
                                if (rawText) {
                                    p.properties['Description (Text)'] = rawText;
                                    cols.add('Description (Text)');
                                }

                                // Format A: Tables (<tr><td>Key</td><td>Value</td></tr>)
                                doc.querySelectorAll('tr').forEach(row => {
                                    const cells = row.querySelectorAll('td, th');
                                    if (cells.length >= 2) {
                                        const key = cells[0].textContent.trim().replace(/:$/, '');
                                        const val = cells[1].textContent.trim();
                                        if (key && key.length < 50) {
                                            cols.add(key);
                                            p.properties[key] = val; // Store explicit pair
                                        }
                                    }
                                });

                                // Format B: Bold tags (<b>Key:</b> Value)
                                doc.querySelectorAll('b, strong').forEach(b => {
                                    const key = b.textContent.trim().replace(/:$/, '');
                                    const valNode = b.nextSibling;
                                    if (key && key.length < 50 && valNode) {
                                        cols.add(key);
                                        p.properties[key] = valNode.textContent.trim(); // Store explicit pair
                                    }
                                });

                                // Format C: Simple string parsing (Key: Value<br>)
                                const lines = desc.split(/<br\s*\/?>/i);
                                lines.forEach(line => {
                                    const parts = line.split(':');
                                    if (parts.length >= 2) {
                                        // Strip HTML tags
                                        const cleanKey = parts[0].replace(/<[^>]+>/g, '').trim();
                                        if (cleanKey && cleanKey.length > 0 && cleanKey.length < 50) {
                                            cols.add(cleanKey);
                                        }
                                    }
                                });
                            } catch (_) { }
                        }
                    });

                    // 'name' always appears first, then the rest alphabetically
                    const colArr = ['name', ...Array.from(cols).filter(c => c !== 'name').sort()];

                    // Populate Filter Column dropdown
                    if (filterColSelect) {
                        filterColSelect.innerHTML = '';
                        colArr.forEach(col => {
                            const opt = document.createElement('option');
                            opt.value = col;
                            opt.textContent = col === 'name' ? 'Name (Default)' : col;
                            if (col === 'name') opt.selected = true;
                            filterColSelect.appendChild(opt);
                        });
                    }

                    // Populate Overlap Column dropdown
                    if (overlapColSelect) {
                        overlapColSelect.innerHTML = '<option value="">(None)</option>';
                        colArr.filter(c => c !== 'name').forEach(col => {
                            const opt = document.createElement('option');
                            opt.value = col;
                            opt.textContent = col;
                            overlapColSelect.appendChild(opt);
                        });
                    }
                }
            } catch (e) {
                console.warn("Could not parse file for features count", e);
                displayEl.textContent = `${file.name} (${formatFileSize(file.size)})`;
                displayEl.title = displayEl.textContent;
            }
        }

        checkReady();
    }

    function checkReady() {
        if (fileA && fileB) {
            showView(configView);
        }
    }

    async function startAnalysis() {
        showView(processingView);
        updateProgress(0, "Starting...", "Initializing processors");

        const jobId = JobTracker.start('PolygonsOverlap', [fileA, fileB]);
        try {
            // 1. Parse File A (Coverage Source)
            updateProgress(10, "Processing File A (Source)...", "Extracting KML/KMZ");
            const geoJsonA = await parseFileToGeoJSON(fileA);
            const polygonsA = extractPolygons(geoJsonA);

            if (polygonsA.length === 0) throw new Error("File A (Source) contains no valid polygons.");

            let totalAreaA = 0;
            polygonsA.forEach(p => {
                p._area = turf.area(p);
                p.bbox = turf.bbox(p);
                totalAreaA += p._area;
            });
            totalAreaA = totalAreaA / 1_000_000;

            // 2. Parse File B (Target Reference)
            updateProgress(30, "Processing File B (Target)...", "Extracting KML/KMZ");
            const geoJsonB = await parseFileToGeoJSON(fileB);
            let polygonsB = extractPolygons(geoJsonB);

            if (polygonsB.length === 0) throw new Error("File B (Target) contains no valid polygons.");

            const totalDataLoaded = polygonsB.length; // save before filter

            let totalAreaB = 0;
            polygonsB.forEach(p => {
                p._area = turf.area(p);
                p.bbox = turf.bbox(p);
                totalAreaB += p._area;
            });
            totalAreaB = totalAreaB / 1_000_000;

            // 2.1 Apply Filter if present
            const filterText = targetFilterInput ? targetFilterInput.value.toLowerCase().trim() : "";
            const filterCol = filterColSelect ? filterColSelect.value : "name";
            const overlapCol = overlapColSelect ? overlapColSelect.value : "";

            let filteredAreaB = 0;

            if (filterText) {
                const initialCount = polygonsB.length;
                polygonsB = polygonsB.filter(p => {
                    let val = p.properties[filterCol] || "";
                    if (filterCol === "name" && !val && p.id) val = p.id;
                    return String(val).toLowerCase() === filterText;
                });
                if (polygonsB.length === 0) {
                    throw new Error(`No Target polygons found matching filter "${filterText}". (Total in file: ${initialCount})`);
                }
                updateProgress(35, "Filtering...", `Filtered targets from ${initialCount} down to ${polygonsB.length}`);

                polygonsB.forEach(p => { filteredAreaB += p._area; });
                filteredAreaB = filteredAreaB / 1_000_000;
            }

            // 3. Analysis Loop: Iterate Target (B) and check overlap with Source (A)

            updateProgress(40, "Calculating Overlap...", `Analyzing ${polygonsB.length} target zones against ${polygonsA.length} source shapes`);

            const results = [];
            const total = polygonsB.length;

            // Build Grid Spatial Index for Source (A)
            const spatialIdx = buildGridIndex(polygonsA);

            // Allow UI updates
            const chunkSize = 20;
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = polygonsB.slice(i, i + chunkSize);

                chunk.forEach(targetPoly => {
                    const res = processTargetFeature(targetPoly, polygonsA, spatialIdx, overlapCol);
                    results.push(res);
                });

                const percent = 40 + Math.floor((i / total) * 50); // 40% to 90%
                updateProgress(percent, "Calculating Overlap...", `Processed ${Math.min(i + chunkSize, total)} / ${total} zones`);

                // Yield to main thread without background throttling
                await yieldToMain();
            }

            // 5. Generate Excel
            updateProgress(90, "Finalizing...", "Generating Excel Report");
            const blob = generateExcel(results);

            // Finish Job
            const outName = fileB.name.replace(/\.[^/.]+$/, "") + "_Overlap.xlsx";
            JobTracker.finish(jobId, [new File([blob], outName)]);

            updateProgress(100, "Done!", "");
            showStats(results, polygonsA.length, overlapCol, {
                totalDataLoaded: totalDataLoaded,
                filteredCount: filterText ? polygonsB.length : null,
                totalAreaA: totalAreaA,
                totalAreaB: totalAreaB,
                filteredAreaB: filteredAreaB
            });
            showView(resultView);

            // Auto-Download
            saveAs(blob, outName);

        } catch (err) {
            console.error('Analysis error:', err);
            JobTracker.fail(jobId, err.message);
            // Show error in processing view instead of reloading
            updateProgress(0, 'Analysis Failed', err.message);
            document.getElementById('progress-bar').style.background = 'var(--color-primary)';
            // Add a back button
            const backBtn = document.createElement('button');
            backBtn.className = 'btn-action-main';
            backBtn.style.marginTop = '20px';
            backBtn.style.background = '#555';
            backBtn.textContent = 'Try Again';
            backBtn.onclick = () => location.reload();
            processingView.querySelector('.tool-card').appendChild(backBtn);
        }
    }

    // --- Logic Helpers ---

    async function parseFileToGeoJSON(file) {
        if (!file) throw new Error('No file provided to parser.');
        let kmlText = '';
        if (file.name.toLowerCase().endsWith('.kmz')) {
            const zip = await JSZip.loadAsync(file);
            const kmlFile = Object.values(zip.files).find(f => f.name.match(/\.kml$/i));
            if (!kmlFile) throw new Error("No KML file found inside KMZ.");
            kmlText = await kmlFile.async("string");
        } else {
            kmlText = await file.text();
        }

        const parser = new DOMParser();
        const kmlDom = parser.parseFromString(kmlText, "text/xml");
        const geojson = toGeoJSON.kml(kmlDom);

        // --- Custom Extended Extractor ---
        // tools like MapInfo generate <SimpleData> without a strict schema that toGeoJSON drops
        // other tools use <Data> tags or <Snippet> tags that get lost.
        try {
            const placemarks = kmlDom.getElementsByTagName("Placemark");
            if (placemarks && placemarks.length > 0) {
                let featureIndex = 0;

                for (let i = 0; i < placemarks.length; i++) {
                    const pm = placemarks[i];

                    // toGeoJSON only emits features for Placemarks with geometries
                    const hasGeom = pm.getElementsByTagName('Polygon').length > 0 ||
                        pm.getElementsByTagName('Point').length > 0 ||
                        pm.getElementsByTagName('LineString').length > 0 ||
                        pm.getElementsByTagName('MultiGeometry').length > 0 ||
                        pm.getElementsByTagName('LinearRing').length > 0;

                    if (hasGeom && featureIndex < geojson.features.length) {
                        const feature = geojson.features[featureIndex];
                        if (!feature.properties) feature.properties = {};

                        // SimpleData
                        const simpleDataElements = pm.getElementsByTagName("SimpleData");
                        for (let j = 0; j < simpleDataElements.length; j++) {
                            const sd = simpleDataElements[j];
                            const name = sd.getAttribute("name");
                            if (name) feature.properties[name] = sd.textContent || "";
                        }

                        // Standard Data
                        const dataElements = pm.getElementsByTagName("Data");
                        for (let j = 0; j < dataElements.length; j++) {
                            const d = dataElements[j];
                            const name = d.getAttribute("name");
                            const valNode = d.getElementsByTagName("value")[0];
                            if (name && valNode) feature.properties[name] = valNode.textContent || "";
                        }

                        // Snippet
                        const snippet = pm.getElementsByTagName("Snippet")[0];
                        if (snippet && snippet.textContent) {
                            feature.properties["Snippet"] = snippet.textContent;
                        }

                        featureIndex++;
                    }
                }
            }
        } catch (e) {
            console.warn("Could not parse XML fallback info", e);
        }

        return geojson;
    }

    function extractPolygons(geoJson) {
        const polys = [];
        turf.flattenEach(geoJson, (feature) => {
            if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                polys.push(feature);
            }
        });
        return polys;
    }

    function processTargetFeature(targetFeature, sourceList, spatialIdx, overlapCol) {
        // Prepare base properties from the Target Feature
        const props = { ...targetFeature.properties };

        // Fallback for missing 'name' property but existing feature ID
        if (!props.name && targetFeature.id) {
            props.name = targetFeature.id;
        }

        // Clean up internal KML props & Unwanted columns
        delete props.styleUrl;
        delete props.styleHash;
        delete props.styleMapHash;
        delete props["stroke-width"];
        delete props["stroke-opacity"];
        delete props["fill-opacity"];
        delete props["stroke"];
        delete props["fill"];

        // Valid geometry check
        if (!targetFeature.geometry || targetFeature.geometry.coordinates.length === 0) {
            return {
                ...props,
                "Total_Area_km2": 0,
                "Covered_Area_km2": 0,
                "Coverage_Percent": 0,
                "Status": "Invalid Geometry"
            };
        }

        try {
            const totalAreaSqM = targetFeature._area || turf.area(targetFeature);
            let coveredAreaSqM = 0;

            // Use pre-computed bbox + spatial index to get candidates
            const targetBbox = targetFeature.bbox || turf.bbox(targetFeature);
            const candidateIndices = querySpatialIndex(spatialIdx, targetBbox);
            const overlappingSources = [...candidateIndices]
                .map(i => sourceList[i])
                .filter(src => !disjointBbox(targetBbox, src.bbox));

            // Calculate Union of Intersections
            const clips = [];
            overlappingSources.forEach(src => {
                try {
                    const intersection = turf.intersect(targetFeature, src);
                    if (intersection) clips.push(intersection);
                } catch (e) {
                    // Geometry errors - skip
                }
            });

            if (clips.length > 0) {
                coveredAreaSqM = turf.area(unionClips(clips));
            }

            // Decimal Fraction (0-1) scale as requested
            const pct = (totalAreaSqM > 0) ? (coveredAreaSqM / totalAreaSqM) : 0;

            // Convert to KM2
            const totalAreaKm = totalAreaSqM / 1_000_000;
            const coveredAreaKm = coveredAreaSqM / 1_000_000;

            const finalRow = {
                ...props,
                "Total_Area_km2": parseFloat(totalAreaKm.toFixed(6)),
                "Covered_Area_km2": parseFloat(coveredAreaKm.toFixed(6)),
                "Coverage_Percent": parseFloat(pct.toFixed(4)), // e.g. 0.5000
                "Status": "Calculated"
            };

            if (overlapCol && props[overlapCol]) {
                const rawVal = parseFloat(props[overlapCol].replace(/[^\d.-]/g, '')) || 0;
                finalRow[`CoveredData_${overlapCol}`] = rawVal;
                finalRow[`Overlapping_${overlapCol}`] = parseFloat((rawVal * pct).toFixed(4));
            }

            return finalRow;

        } catch (err) {
            console.error("Processing Error:", err);
            return { ...props, "Status": "Error: " + err.message };
        }
    }

    function disjointBbox(b1, b2) {
        return b1[2] < b2[0] || b1[0] > b2[2] || b1[3] < b2[1] || b1[1] > b2[3];
    }

    // Grid spatial index — cell size is 2× the median polygon span
    function buildGridIndex(polygons) {
        if (!polygons.length) return { index: new Map(), cellSize: 1 };
        const spans = polygons.map(p => Math.max(p.bbox[2] - p.bbox[0], p.bbox[3] - p.bbox[1]));
        spans.sort((a, b) => a - b);
        const median = spans[Math.floor(spans.length / 2)] || 1;
        const cellSize = Math.max(median * 2, 0.01);
        const index = new Map();
        polygons.forEach((poly, i) => {
            const b = poly.bbox;
            const x0 = Math.floor(b[0] / cellSize), x1 = Math.floor(b[2] / cellSize);
            const y0 = Math.floor(b[1] / cellSize), y1 = Math.floor(b[3] / cellSize);
            for (let x = x0; x <= x1; x++) {
                for (let y = y0; y <= y1; y++) {
                    const key = `${x},${y}`;
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push(i);
                }
            }
        });
        return { index, cellSize };
    }

    function querySpatialIndex(spatialIdx, bbox) {
        const { index, cellSize } = spatialIdx;
        const x0 = Math.floor(bbox[0] / cellSize), x1 = Math.floor(bbox[2] / cellSize);
        const y0 = Math.floor(bbox[1] / cellSize), y1 = Math.floor(bbox[3] / cellSize);
        const candidates = new Set();
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                const cell = index.get(`${x},${y}`);
                if (cell) cell.forEach(i => candidates.add(i));
            }
        }
        return candidates;
    }

    // Binary-tree union reduction — avoids growing polygon complexity with each sequential merge
    function unionClips(clips) {
        if (clips.length === 1) return clips[0];
        let level = clips;
        while (level.length > 1) {
            const next = [];
            for (let i = 0; i < level.length; i += 2) {
                if (i + 1 < level.length) {
                    try { next.push(turf.union(level[i], level[i + 1])); }
                    catch (e) { next.push(level[i]); }
                } else {
                    next.push(level[i]);
                }
            }
            level = next;
        }
        return level[0];
    }

    function generateExcel(results) {
        const worksheet = XLSX.utils.json_to_sheet(results);
        resultWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(resultWorkbook, worksheet, "Polygons Overlap");

        const excelBuffer = XLSX.write(resultWorkbook, { bookType: 'xlsx', type: 'array' });
        return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function downloadResult() {
        if (!resultWorkbook) return;
        const nameA = fileA.name.replace(/\.[^/.]+$/, "");
        const nameB = fileB.name.replace(/\.[^/.]+$/, "");
        XLSX.writeFile(resultWorkbook, `${nameB}_Overlap.xlsx`);
    }

    // --- UI Helpers ---

    function showView(view) {
        [uploadView, configView, processingView, resultView].forEach(v => {
            if (v) {
                v.classList.add('hidden');
                v.classList.remove('active');
            }
        });
        if (view) {
            view.classList.remove('hidden');
            view.classList.add('active');
        }

        // Hide header description and reduce margin on processing/result views to perfectly center content
        const toolHeader = document.querySelector('.tool-header');
        if (toolHeader) {
            if (view === processingView || view === resultView) {
                toolHeader.classList.add('condensed');
            } else {
                toolHeader.classList.remove('condensed');
            }
        }
    }

    function updateProgress(percent, text, details) {
        progressBar.style.width = `${percent}%`;
        if (text) progressText.innerText = text;
        if (details) progressDetails.innerText = details;
    }

    function showStats(results, sourceCount, overlapCol, ctx) {
        ctx = ctx || {};
        const fmt = formatNumber;
        const totalDataLoaded = ctx.totalDataLoaded != null ? ctx.totalDataLoaded : results.length;
        const filteredCount = ctx.filteredCount != null ? ctx.filteredCount : null;
        const totalAreaA = ctx.totalAreaA || 0;
        const totalAreaB = ctx.totalAreaB || 0;
        const filteredAreaB = ctx.filteredAreaB || 0;

        // Overlap (Covered Space)
        const totalCovered = results.reduce(function (acc, r) { return acc + (r.Covered_Area_km2 || 0); }, 0);

        // Make the view wide enough to comfortably fit the pipeline
        resultView.style.maxWidth = '1200px';
        resultView.style.width = '100%';
        resultSummary.style.maxWidth = '100%'; // Override shared.css 600px restriction
        resultSummary.style.display = 'block'; // Override shared.css flex

        const showProcessed = filteredCount !== null;
        let gridCols = "auto 1fr";
        if (showProcessed) gridCols += " 30px 1fr";
        if (overlapCol) gridCols += " 30px 1fr";

        let html = `<div style="display:grid; grid-template-columns: ${gridCols}; grid-template-rows: auto 1fr 1fr; gap: 15px; width:100%; align-items: stretch; margin-top:20px;">`;

        const solidArrow = `<div style="display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:18px;"><i class="fa-solid fa-chevron-right"></i></div>`;
        const faintArrow = `<div style="display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:18px; opacity:0.3;"><i class="fa-solid fa-chevron-right"></i></div>`;

        // --- ROW 0: Headers ---
        html += `
            <div></div> <!-- Empty top-left -->
            <div style="text-align:center; font-weight:600; color:#7f8c8d; font-size:13px; text-transform:uppercase; letter-spacing:1px; padding-bottom:5px; border-bottom:2px solid #eee;">Input</div>
        `;
        if (showProcessed) {
            html += `<div></div><div style="text-align:center; font-weight:600; color:#7f8c8d; font-size:13px; text-transform:uppercase; letter-spacing:1px; padding-bottom:5px; border-bottom:2px solid #eee;">Processed</div>`;
        }
        if (overlapCol) {
            html += `<div></div><div style="text-align:center; font-weight:600; color:#7f8c8d; font-size:13px; text-transform:uppercase; letter-spacing:1px; padding-bottom:5px; border-bottom:2px solid #eee;">Feature Match</div>`;
        }

        const cardStyle = "border:1px solid #e2e8f0; box-shadow:none; padding:15px; display:flex; flex-direction:column; justify-content:flex-start;";

        // --- ROW 1: Source File ---
        html += `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:flex-end; text-align:right; border-right:3px solid var(--color-primary); padding-right:15px; min-width:140px;">
                <span style="font-weight:700; color:var(--color-primary); font-size:15px;">Coverage Layer</span>
                <span style="font-size:12px; color:#95a5a6;">(Upper Layer)</span>
            </div>

            <!-- Col 1: Input -->
            <div class="stat-card" style="${cardStyle}">
                <div class="stat-card-value" style="color:var(--color-primary); font-size:24px;">${fmt(sourceCount)}</div>
                <div class="stat-card-label" style="font-size:12px;">Polygons Parsed</div>
                <div style="margin-top:auto; padding-top:12px; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:12px; color:#64748b;">Total Space: <strong>${fmt(totalAreaA)} km²</strong></div>
                </div>
            </div>
        `;
        if (showProcessed) {
            html += faintArrow;
            html += `<div class="stat-card" style="border:1px dashed #cbd5e1; background:transparent; box-shadow:none; opacity:0.3;"></div>`;
        }
        if (overlapCol) {
            html += faintArrow;
            html += `<div class="stat-card" style="border:1px dashed #cbd5e1; background:transparent; box-shadow:none; opacity:0.3;"></div>`;
        }

        // --- ROW 2: Target File ---
        html += `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:flex-end; text-align:right; border-right:3px solid #16a34a; padding-right:15px;">
                <span style="font-weight:700; color:#2c3e50; font-size:15px;">Covered Layer</span>
                <span style="font-size:12px; color:#95a5a6;">(Bottom Layer)</span>
            </div>

            <!-- Col 1: Input -->
            <div class="stat-card" style="${cardStyle}">
                <div class="stat-card-value" style="color:#2c3e50; font-size:24px;">${fmt(totalDataLoaded)}</div>
                <div class="stat-card-label" style="font-size:12px;">Polygons Loaded</div>
                <div style="margin-top:auto; padding-top:12px; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:12px; color:#64748b;">Total Space: <strong>${fmt(totalAreaB)} km²</strong></div>
                    ${!showProcessed ? `<div style="font-size:12px; color:#16a34a;">Covered Space: <strong>${fmt(totalCovered)} km²</strong></div>` : ''}
                </div>
            </div>
        `;

        if (showProcessed) {
            html += solidArrow;
            html += `
            <!-- Col 2: Processed -->
            <div class="stat-card" style="${cardStyle} border-color:#fde68a; background:#fffbf1;">
                <div class="stat-card-value" style="color:#d97706; font-size:24px;">${fmt(filteredCount)}</div>
                <div class="stat-card-label" style="font-size:12px;">Filtered Polygons</div>
                <div style="margin-top:auto; padding-top:12px; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:12px; color:#64748b;">Filtered Space: <strong>${fmt(filteredAreaB)} km²</strong></div>
                    <div style="font-size:12px; color:#16a34a;">Covered Space: <strong>${fmt(totalCovered)} km²</strong></div>
                </div>
            </div>
            `;
        }

        if (overlapCol) {
            html += solidArrow;
            const sumCol = results.reduce(function (acc, r) { return acc + (r['CoveredData_' + overlapCol] || 0); }, 0);
            const sumOverlapCol = results.reduce(function (acc, r) { return acc + (r['Overlapping_' + overlapCol] || 0); }, 0);
            let pctStr = '—';
            if (sumCol > 0) {
                let pctVal = (sumOverlapCol / sumCol) * 100;
                pctStr = pctVal >= 10 ? pctVal.toFixed(1) + '%' : pctVal.toFixed(2) + '%';
            }
            const colPct = pctStr;

            html += `
            <!-- Col Last: Feature Match -->
            <div class="stat-card" style="${cardStyle} border-color:#bfdbfe; background:#eff6ff;">
                <div class="stat-card-value" style="color:#2563eb; font-size:24px;">${colPct}</div>
                <div class="stat-card-label" style="font-size:12px;">Matched of '${overlapCol}'</div>
                <div style="margin-top:auto; padding-top:12px; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:12px; color:#64748b;">Total sum: <strong>${fmt(sumCol)}</strong></div>
                    <div style="font-size:12px; color:#2563eb;">Matched sum: <strong>${fmt(sumOverlapCol)}</strong></div>
                </div>
            </div>
            `;
        }

        html += '</div>';

        const outName = `${fileB.name.replace(/\.[^/.]+$/, "")}_Overlap.xlsx`;
        html += `
        <div style="margin-top: 25px; text-align: center;">
            <div style="font-size: 14px; color: #64748b; background: #f8f9fa; padding: 8px 16px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0;">
                <i class="fa-solid fa-file-signature" style="color:var(--color-primary);"></i>
                <span>Output File: <strong style="color: #334155;">${outName}</strong></span>
            </div>
        </div>
        `;

        resultSummary.innerHTML = html;
    }
});
