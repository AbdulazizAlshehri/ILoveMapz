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

            // 2.1 Apply Filter if present
            const filterText = targetFilterInput ? targetFilterInput.value.toLowerCase().trim() : "";
            if (filterText) {
                const initialCount = polygonsB.length;
                polygonsB = polygonsB.filter(p => {
                    const name = p.properties.name || "";
                    return name.toLowerCase().includes(filterText);
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
                    const res = processTargetFeature(targetPoly, polygonsA);
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
            showStats(results, polygonsA.length);
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
        return toGeoJSON.kml(kmlDom);
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

    function processTargetFeature(targetFeature, sourceList) {
        // Prepare base properties from the Target Feature
        const props = { ...targetFeature.properties };

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

            // Format for Excel
            return {
                ...props,
                "Total_Area_km2": parseFloat(totalAreaKm.toFixed(6)),
                "Covered_Area_km2": parseFloat(coveredAreaKm.toFixed(6)),
                "Coverage_Percent": parseFloat(pct.toFixed(4)), // e.g. 0.5000
                "Status": "Calculated"
            };

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

    function showStats(results, sourceCount) {
        // Average multiplied by 100 purely for UI text display, NOT for Excel
        const avg = results.reduce((acc, r) => acc + (r.Coverage_Percent || 0), 0) / (results.length || 1);

        resultSummary.innerHTML = `
            <div class="stat-box neutral">
                <span class="stat-value">${results.length}</span>
                <span class="stat-label">Targets Analyzed</span>
            </div>
            <div class="stat-box neutral">
                <span class="stat-value">${sourceCount}</span>
                <span class="stat-label">Source Polygons</span>
            </div>
            <div class="stat-box success">
                <span class="stat-value">${(avg * 100).toFixed(2)}%</span>
                <span class="stat-label">Avg Coverage</span>
            </div>
        `;
    }
});
