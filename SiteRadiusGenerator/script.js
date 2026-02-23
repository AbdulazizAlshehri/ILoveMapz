document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    // dropZone and btnSelectFile handled by unified helper via ID 'drop-zone-main'
    const fileInput = document.getElementById('file-input');

    // View Handling
    const uploadView = document.getElementById('upload-view');
    const configView = document.getElementById('config-view');
    const processingView = document.getElementById('processing-view');
    const resultView = document.getElementById('result-view');

    // Config Elements
    const fileNameDisplay = document.getElementById('file-name');
    const latSelect = document.getElementById('lat-select');
    const lonSelect = document.getElementById('lon-select');
    const nameSelect = document.getElementById('name-select');
    const radiusInput = document.getElementById('radius-input');
    const colorizeCheck = document.getElementById('colorize-check');
    const opacityInput = document.getElementById('opacity-input');

    // Actions
    const btnCancel = document.getElementById('btn-cancel');
    const btnGenerate = document.getElementById('btn-generate');
    const btnDownload = document.getElementById('btn-download');
    const btnRestart = document.getElementById('btn-restart');

    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const resultSummary = document.getElementById('result-summary');

    // State
    let currentFile = null;
    let jsonData = null;
    let generatedKmzBlob = null;

    // --- constants ---
    const COLORS = [
        '50', 'F0', '14', '00',  // ~Green
        '14', 'F0', 'FF', '00',  // ~Yellow
        '14', '00', 'FF', '00',  // ~Red
        'F0', '14', '00', '00',  // ~Blue
        'F0', '14', 'F0', '00'   // ~Magenta
    ]; // KML color format: aabbggrr (hex) - but KML uses simple hex values in color tag.
    // Actually KML is AABBGGRR.
    // Let's define some standard colors in KML format (Opacity will be handled dynamically)
    // Red, Blue, Green, Yellow, Orange, Purple
    const BASE_COLORS = [
        '0000FF', // Red (KML is BGR)
        'FF0000', // Blue
        '00FF00', // Green
        '00FFFF', // Yellow
        '0080FF', // Orange
        '800080'  // Purple
    ];


    // --- Event Listeners ---


    // File Selection (Unified)
    const dropZoneController = setupUnifiedDropZone('drop-zone-main', 'file-input', (files) => {
        handleFile(files[0]);
    }, () => {
        currentFile = null;
    });

    // Buttons
    btnCancel.addEventListener('click', resetApp);
    btnRestart.addEventListener('click', resetApp);

    btnGenerate.addEventListener('click', () => {
        const config = {
            latIndex: latSelect.value,
            lonIndex: lonSelect.value,
            nameIndex: nameSelect.value,
            radiusStr: radiusInput.value,
            colorize: colorizeCheck.checked,
            opacity: parseFloat(opacityInput.value) || 0.4
        };

        if (!config.latIndex || !config.lonIndex) {
            alert('Please select Latitude and Longitude columns.');
            return;
        }

        startGeneration(config);
    });

    btnDownload.addEventListener('click', () => {
        if (generatedKmzBlob) {
            const outName = currentFile.name.replace(/\.[^/.]+$/, "") + "_Radius.kmz";
            saveAs(generatedKmzBlob, outName);
        }
    });

    // --- Core Logic ---

    function handleFile(file) {
        currentFile = file;
        fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)})`;
        fileNameDisplay.title = fileNameDisplay.textContent;

        showView(processingView);
        updateProgress(10, "Reading file...");

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheet];

                // Get data as array of arrays
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (!jsonData || jsonData.length < 2) {
                    throw new Error("File appears empty or invalid.");
                }

                populateConfig(jsonData[0]); // First row is header

                const validRows = Math.max(0, jsonData.length - 1);
                fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)}) | ${validRows} rows`;
                fileNameDisplay.title = fileNameDisplay.textContent;

                showView(configView);

            } catch (err) {
                console.error(err);
                alert("Error reading file: " + err.message);
                resetApp();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function populateConfig(headers) {
        // Clear options
        [latSelect, lonSelect, nameSelect].forEach(sel => sel.innerHTML = '<option value="">(Select Column)</option>');

        // Regex for detection
        const latRegex = /\b(lat|latitude|northing|y_coord)\b/i;
        const lonRegex = /\b(lon|long|longitude|easting|x_coord)\b/i;
        const nameRegex = /\b(name|id|site|cell|label)\b/i;

        headers.forEach((h, i) => {
            const headerStr = String(h);
            if (!headerStr.trim()) return;

            const option = new Option(headerStr, i);

            latSelect.add(option.cloneNode(true));
            lonSelect.add(option.cloneNode(true));
            nameSelect.add(option.cloneNode(true));

            // Auto-select
            if (latRegex.test(headerStr) && !latSelect.value) latSelect.value = i;
            else if (lonRegex.test(headerStr) && !lonSelect.value) lonSelect.value = i;
            else if (nameRegex.test(headerStr) && !nameSelect.value) nameSelect.value = i;
        });
    }

    function startGeneration(config) {
        // Parse Radii
        const radii = config.radiusStr.split(',')
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n) && n > 0);

        if (radii.length === 0) {
            alert("Please enter at least one valid radius in meters.");
            return;
        }

        showView(processingView);
        updateProgress(10, "Generating circles...");

        const jobId = JobTracker.start('SiteRadiusGenerator', [currentFile]);

        // Non-blocking loop
        setTimeout(async () => {
            try {
                const results = generateKML(jsonData.slice(1), config, radii); // Skip header

                if (results.count === 0) {
                    throw new Error("No valid coordinates found in file.");
                }

                updateProgress(80, "Compressing KMZ...");
                const zip = new JSZip();
                zip.file("doc.kml", results.kml);

                generatedKmzBlob = await zip.generateAsync({ type: "blob" });

                const outName = currentFile.name.replace(/\.[^/.]+$/, "") + "_Radius.kmz";
                JobTracker.finish(jobId, [new File([generatedKmzBlob], outName)]);

                updateProgress(100, "Done!");
                if (resultSummary) {
                    resultSummary.innerHTML = `
                        <div class="stat-box success">
                            <span class="stat-value">${results.count}</span>
                            <span class="stat-label">Sites Generated</span>
                        </div>
                    `;
                }
                showView(resultView);

                // Auto-download on success
                saveAs(generatedKmzBlob, outName);

            } catch (err) {
                console.error(err);
                alert("Generation failed: " + err.message);
                JobTracker.fail(jobId, err.message);
                resetApp();
            }
        }, 100);
    }

    function generateKML(rows, config, radii) {
        let kmlBody = '';
        let validCount = 0;

        // Style definitions
        let styles = '';

        // Ensure hex opacity is 2 chars e.g. '80' for 50%
        const opacityHex = Math.floor(config.opacity * 255).toString(16).padStart(2, '0');

        // Create styles for each radius level (or cycle colors)
        radii.forEach((r, i) => {
            const color = config.colorize ? BASE_COLORS[i % BASE_COLORS.length] : '0000FF'; // Default Red
            const styleId = `style_r${i}`;

            styles += `
            <Style id="${styleId}">
                <LineStyle>
                    <color>ff${color}</color>
                    <width>2</width>
                </LineStyle>
                <PolyStyle>
                    <color>${opacityHex}${color}</color>
                </PolyStyle>
            </Style>`;
        });

        // Generate Polygons
        rows.forEach(row => {
            if (!row || row.length === 0) return;

            const lat = parseFloat(row[config.latIndex]);
            const lon = parseFloat(row[config.lonIndex]);

            if (isValidLatLon(lat, lon)) {
                const name = (config.nameIndex && row[config.nameIndex]) ? String(row[config.nameIndex]) : `Site ${validCount + 1}`;

                kmlBody += `<Folder><name>${escapeXml(name)}</name>`;

                radii.forEach((r, i) => {
                    const circleCoords = generateCircleCoords(lat, lon, r);
                    const styleId = `style_r${i}`;

                    kmlBody += `
                    <Placemark>
                        <name>${escapeXml(name)} - ${r}m</name>
                        <styleUrl>#${styleId}</styleUrl>
                        <Polygon>
                            <outerBoundaryIs>
                                <LinearRing>
                                    <coordinates>${circleCoords}</coordinates>
                                </LinearRing>
                            </outerBoundaryIs>
                        </Polygon>
                    </Placemark>`;
                });

                kmlBody += `</Folder>`;
                validCount++;
            }
        });

        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Site Radius Generation</name>
    ${styles}
    ${kmlBody}
  </Document>
</kml>`;

        return { kml, count: validCount };
    }

    // --- Math Helpers ---

    function isValidLatLon(lat, lon) {
        return !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    }

    function generateCircleCoords(lat, lon, radiusMeters) {
        const points = 36; // Every 10 degrees is enough for small circles, maybe 60 is smoother
        const coords = [];

        // Earth radius in meters
        const R = 6378137;

        // Convert lat/lon to radians
        const latRad = lat * (Math.PI / 180);
        const lonRad = lon * (Math.PI / 180);
        const d_rad = radiusMeters / R; // Angular distance in radians

        for (let i = 0; i <= points; i++) {
            const bearing = (i * 360 / points) * (Math.PI / 180);

            const lat2Rad = Math.asin(Math.sin(latRad) * Math.cos(d_rad) + Math.cos(latRad) * Math.sin(d_rad) * Math.cos(bearing));
            const lon2Rad = lonRad + Math.atan2(Math.sin(bearing) * Math.sin(d_rad) * Math.cos(latRad), Math.cos(d_rad) - Math.sin(latRad) * Math.sin(lat2Rad));

            const lat2 = lat2Rad * (180 / Math.PI);
            const lon2 = lon2Rad * (180 / Math.PI);

            coords.push(`${lon2},${lat2},0`);
        }

        return coords.join(' ');
    }

    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
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

    function updateProgress(percent, text) {
        progressBar.style.width = `${percent}%`;
        if (text) progressText.innerText = text;
    }

    function resetApp() {
        currentFile = null;
        fileInput.value = '';
        if (resultSummary) resultSummary.textContent = '';

        // Reset Drop Zone Visuals
        if (dropZoneController) dropZoneController.reset();

        progressBar.style.width = '0%';
        showView(uploadView);
    }
});
