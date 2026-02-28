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

        const jobId = JobTracker.start('KMZOverlap', [fileA, fileB]);
        try {
            // 1. Parse File A (Coverage Source)
            updateProgress(10, "Processing File A (Source)...", "Extracting KML/KMZ");
            const geoJsonA = await parseFileToGeoJSON(fileA);
            const polygonsA = extractPolygons(geoJsonA);

            if (polygonsA.length === 0) throw new Error("File A (Source) contains no valid polygons.");

            // 2. Parse File B (Target Reference)
            updateProgress(30, "Processing File B (Target)...", "Extracting KML/KMZ");
            const geoJsonB = await parseFileToGeoJSON(fileB);
            let polygonsB = extractPolygons(geoJsonB);

            if (polygonsB.length === 0) throw new Error("File B (Target) contains no valid polygons.");

            const totalTargetLoaded = polygonsB.length; // save before filter

            // 2.1 Apply Filter if present
            const filterText = targetFilterInput ? targetFilterInput.value.toLowerCase().trim() : "";
            const filterCol = filterColSelect ? filterColSelect.value : "name";
            const overlapCol = overlapColSelect ? overlapColSelect.value : "";
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
            }

            // 3. Analysis Loop: Iterate Target (B) and check overlap with Source (A)

            updateProgress(40, "Calculating Overlap...", `Analyzing ${polygonsB.length} target zones against ${polygonsA.length} source shapes`);

            const results = [];
            const total = polygonsB.length;

            // Build Spatial Index for Source (A) to speed up lookups
            // Simple approach: Pre-calculate BBoxes for A
            polygonsA.forEach(p => p.bbox = turf.bbox(p));

            // Allow UI updates
            const chunkSize = 5;
            for (let i = 0; i < total; i += chunkSize) {
                const chunk = polygonsB.slice(i, i + chunkSize);

                chunk.forEach(targetPoly => {
                    const res = processTargetFeature(targetPoly, polygonsA, overlapCol);
                    results.push(res);
                });

                const percent = 40 + Math.floor((i / total) * 50); // 40% to 90%
                updateProgress(percent, "Calculating Overlap...", `Processed ${Math.min(i + chunkSize, total)} / ${total} zones`);

                // Yield to main thread
                await new Promise(r => setTimeout(r, 0));
            }

            // 5. Generate Excel
            updateProgress(90, "Finalizing...", "Generating Excel Report");
            const blob = generateExcel(results);

            // Finish Job
            const outName = `Overlap_on_${fileB.name}_by_${fileA.name}.xlsx`;
            JobTracker.finish(jobId, [new File([blob], outName)]);

            updateProgress(100, "Done!", "");
            showStats(results, polygonsA.length, overlapCol, {
                totalTargetLoaded: totalTargetLoaded,
                filteredCount: filterText ? polygonsB.length : null
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

    function processTargetFeature(targetFeature, sourceList, overlapCol) {
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
            const totalAreaSqM = turf.area(targetFeature);
            let coveredAreaSqM = 0;

            // Optimization: Filter Source Layer by BBox intersection with Target
            const targetBbox = turf.bbox(targetFeature);
            const overlappingSources = sourceList.filter(src => {
                return !disjointBbox(targetBbox, src.bbox);
            });

            // Calculate Union of Intersections
            const clips = [];
            overlappingSources.forEach(src => {
                try {
                    // Turf v6 syntax: two arguments
                    const intersection = turf.intersect(targetFeature, src);
                    if (intersection) clips.push(intersection);
                } catch (e) {
                    // Geometry errors - skip
                }
            });

            if (clips.length > 0) {
                // Union all clips to merge overlapping coverage areas
                let unionPoly = clips[0];
                for (let i = 1; i < clips.length; i++) {
                    try {
                        // Turf v6 syntax: two arguments
                        unionPoly = turf.union(unionPoly, clips[i]);
                    } catch (e) { /* skip bad geometry */ }
                }
                coveredAreaSqM = turf.area(unionPoly);
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
                finalRow[`Target_${overlapCol}`] = rawVal;
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

    function generateExcel(results) {
        const worksheet = XLSX.utils.json_to_sheet(results);
        resultWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(resultWorkbook, worksheet, "Overlap Analysis");

        const excelBuffer = XLSX.write(resultWorkbook, { bookType: 'xlsx', type: 'array' });
        return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    function downloadResult() {
        if (!resultWorkbook) return;
        const nameA = fileA.name.replace(/\.[^/.]+$/, "");
        const nameB = fileB.name.replace(/\.[^/.]+$/, "");
        XLSX.writeFile(resultWorkbook, `Overlap_on_${nameB}_by_${nameA}.xlsx`);
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
        const fmt = function (n) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); };
        const totalTargetLoaded = ctx.totalTargetLoaded != null ? ctx.totalTargetLoaded : results.length;
        const filteredCount = ctx.filteredCount != null ? ctx.filteredCount : null;
        const avg = results.reduce(function (acc, r) { return acc + (r.Coverage_Percent || 0); }, 0) / (results.length || 1);
        const totalCovered = results.reduce(function (acc, r) { return acc + (r.Covered_Area_km2 || 0); }, 0);

        // Make the view wide enough to comfortably fit the pipeline
        resultView.style.maxWidth = '100%';
        resultSummary.style.maxWidth = '100%'; // Override shared.css 600px restriction
        resultSummary.style.display = 'block'; // Override shared.css flex

        // Helper for floating arrows between grid columns
        const arrowHtml = (color) => `<div style="position:absolute; right:-30px; top:50%; transform:translateY(-50%); font-size:20px; color:${color};"><i class="fa-solid fa-arrow-right-long"></i></div>`;

        var html = '<div style="display:grid; grid-template-rows: 1fr 1fr; grid-auto-columns: minmax(240px, 1fr); gap: 20px 40px; width:100%; overflow-x:auto; padding: 10px 30px 20px 10px;">';

        let col = 1;

        // ==========================================
        // STAGE 1: Upload (Col 1)
        // ==========================================
        // 1. Base Layer Status (Row 1)
        html += `<div class="flow-stage" style="grid-row: 1; grid-column: ${col}; margin:0; border-left:4px solid var(--color-primary); background:#fff; position:relative;">`;
        html += '<div class="flow-stage-icon"><i class="fa-solid fa-map" style="color: var(--color-primary);"></i></div>';
        html += '<div class="flow-stage-items" style="flex:1;">';
        html += '<div class="flow-stage-label" style="border:none; margin:0;" title="The polygon geometry that serves as the boundary bounds.">Base Layer (Source)</div>';
        html += '<div class="flow-item"><span class="flow-item-value" style="color:var(--color-primary);">' + fmt(sourceCount) + '</span><span class="flow-item-sub">Polygons</span></div>';
        html += '</div>';
        html += arrowHtml('var(--color-primary)'); // Arrow to Col 2
        html += '</div>';

        // 2. Target Layer Status (Row 2)
        html += `<div class="flow-stage" style="grid-row: 2; grid-column: ${col}; margin:0; border-left:4px solid #333; background:#fff; position:relative;">`;
        html += '<div class="flow-stage-icon"><i class="fa-solid fa-map-location-dot" style="color: #333;"></i></div>';
        html += '<div class="flow-stage-items" style="flex:1;">';
        html += '<div class="flow-stage-label" style="border:none; margin:0;">Target Layer (Data)</div>';
        html += '<div class="flow-item"><span class="flow-item-value" style="color:#333;">' + fmt(totalTargetLoaded) + '</span><span class="flow-item-sub">Analyzed</span></div>';
        html += '</div>';
        html += arrowHtml('#333'); // Arrow to Col 2
        html += '</div>';

        col++;

        // ==========================================
        // STAGE 2: Area / Filters (Col 2)
        // ==========================================
        // 1. Base Layer Outcome - Area Covered (Row 1)
        html += `<div class="flow-stage" style="grid-row: 1; grid-column: ${col}; margin:0; border-left:4px solid #2ecc71; background:#fff; position:relative;">`;
        html += '<div class="flow-stage-icon"><i class="fa-solid fa-draw-polygon" style="color: #2ecc71;"></i></div>';
        html += '<div class="flow-stage-items" style="flex:1;">';
        html += '<div class="flow-stage-label" style="border:none; margin:0;" title="The total physical area from the Base Layer that landed on valid Targets.">Union Area Covered</div>';
        html += '<div class="flow-item"><span class="flow-item-value" style="color:#2c3e50;">' + fmt(totalCovered) + ' <span style="font-size:12px;">km²</span></span><span class="flow-item-sub">Total Spanned</span></div>';
        html += '</div></div>';

        // 2. Target Filter Result (Row 2)
        if (filteredCount !== null) {
            html += `<div class="flow-stage" style="grid-row: 2; grid-column: ${col}; margin:0; border-left:4px solid #f39c12; background:#fff; position:relative;">`;
            html += '<div class="flow-stage-icon"><i class="fa-solid fa-filter" style="color: #f39c12;"></i></div>';
            html += '<div class="flow-stage-items" style="flex:1;">';
            html += '<div class="flow-stage-label" style="border:none; margin:0;">Filtered</div>';
            html += '<div class="flow-item"><span class="flow-item-value" style="color:#f39c12;">' + fmt(filteredCount) + '</span><span class="flow-item-sub">Matches Surviving</span></div>';
            html += '</div>';
            html += arrowHtml('#333');
            html += '</div>';
            col++;
        }

        // ==========================================
        // STAGE 3: Overlap Coverage (Col 3)
        // ==========================================
        html += `<div class="flow-stage" style="grid-row: 2; grid-column: ${col}; margin:0; border-left:4px solid #27ae60; background:#fff; position:relative;">`;
        html += '<div class="flow-stage-icon"><i class="fa-solid fa-percentage" style="color: #27ae60;"></i></div>';
        html += '<div class="flow-stage-items" style="flex:1;">';
        html += '<div class="flow-stage-label" style="border:none; margin:0;">Target Coverage</div>';
        html += '<div class="flow-item"><span class="flow-item-value" style="color:#27ae60;">' + (avg * 100).toFixed(2) + '%</span><span class="flow-item-sub">Avg Hit Per Target</span></div>';
        html += '</div>';
        if (overlapCol) html += arrowHtml('#333');
        html += '</div>';

        // ==========================================
        // STAGE 4: Math Extraction (Col 4)
        // ==========================================
        if (overlapCol) {
            col++;
            var sumCol = results.reduce(function (acc, r) { return acc + (r['Target_' + overlapCol] || 0); }, 0);
            var sumOverlapCol = results.reduce(function (acc, r) { return acc + (r['Overlapping_' + overlapCol] || 0); }, 0);
            var colPct = sumCol > 0 ? (sumOverlapCol / sumCol * 100).toFixed(2) + '%' : '—';

            html += `<div class="flow-stage" style="grid-row: 2; grid-column: ${col}; margin:0; border-left:4px solid #8e44ad; background:#fff; position:relative;">`;
            html += '<div class="flow-stage-icon"><i class="fa-solid fa-calculator" style="color:#8e44ad;"></i></div>';
            html += '<div class="flow-stage-items" style="flex:1;">';
            html += '<div class="flow-stage-label" style="border:none; margin:0;" title="' + overlapCol + '">' + (overlapCol.length > 18 ? overlapCol.substring(0, 18) + '...' : overlapCol) + '</div>';
            html += '<div class="flow-item"><span class="flow-item-value" style="color:#8e44ad;">' + fmt(sumOverlapCol) + '</span><span class="flow-item-sub">Values Captured (' + colPct + ')</span></div>';
            html += '</div></div>';
        }

        html += '</div>'; // End Grid Wrapper

        resultSummary.innerHTML = html;
    }
});
