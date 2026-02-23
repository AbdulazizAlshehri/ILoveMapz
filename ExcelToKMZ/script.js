// Improved Script with Robust Parsing & Features

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    // DOM Elements
    // dropZone and btnSelectFile handled by unified helper via ID 'drop-zone-main'
    const fileInput = document.getElementById('file-input');
    const uploadView = document.getElementById('upload-view');
    const configView = document.getElementById('config-view');
    const processingView = document.getElementById('processing-view');
    const resultView = document.getElementById('result-view');
    const fileNameDisplay = document.getElementById('file-name');

    // Config Inputs
    const latSelect = document.getElementById('lat-select');
    const lonSelect = document.getElementById('lon-select');
    const coordSelect = document.getElementById('coord-select');
    const nameSelect = document.getElementById('name-select');
    const groupSelect = document.getElementById('group-select');
    const scaleInput = document.getElementById('scale-input');
    const iconSelect = document.getElementById('icon-select');

    const modeRadios = document.getElementsByName('coord-mode');
    const separateModeInputs = document.getElementById('separate-mode-inputs');
    const singleModeInputs = document.getElementById('single-mode-inputs');

    const btnCancel = document.getElementById('btn-cancel');
    const btnConvert = document.getElementById('btn-convert');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const btnDownload = document.getElementById('btn-download');
    const btnRestart = document.getElementById('btn-restart');
    const resultSummary = document.getElementById('result-summary');

    let currentFile = null;
    let workbook = null;
    let jsonData = null;
    let generatedKmzBlob = null;

    // --- Event Listeners ---

    // File Selection - Unified Helper
    const dropZoneController = setupUnifiedDropZone('drop-zone-main', 'file-input', (files) => {
        handleFile(files[0]);
    }, () => {
        // Optional: clear internal state if user removes file via X button
        currentFile = null;
    });

    // Remove old manual listeners if they exist (clean up)
    // btnSelectFile.addEventListener... (Already handled by helper)
    // fileInput.addEventListener... (Already handled by helper)


    // Mode Toggle
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'separate') {
                separateModeInputs.classList.remove('hidden');
                singleModeInputs.classList.add('hidden');
            } else {
                separateModeInputs.classList.add('hidden');
                singleModeInputs.classList.remove('hidden');
            }
        });
    });

    // Visual Icon Picker Logic
    const iconFamilies = {
        'ms-pushpin': [
            'http://maps.google.com/mapfiles/ms/icons/red-pushpin.png',
            'http://maps.google.com/mapfiles/ms/icons/blue-pushpin.png',
            'http://maps.google.com/mapfiles/ms/icons/grn-pushpin.png',
            'http://maps.google.com/mapfiles/ms/icons/ylw-pushpin.png',
            'http://maps.google.com/mapfiles/ms/icons/purple-pushpin.png',
            'http://maps.google.com/mapfiles/ms/icons/pink-pushpin.png'
        ],
        'ms-dot': [
            'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
            'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
            'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
            'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
            'http://maps.google.com/mapfiles/ms/icons/purple-dot.png',
            'http://maps.google.com/mapfiles/ms/icons/pink-dot.png'
        ],
        'kml-pushpin': [
            'http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/grn-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/purple-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/pink-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/ltblu-pushpin.png',
            'http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png'
        ],
        'kml-paddle': [
            'http://maps.google.com/mapfiles/kml/paddle/red-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/blu-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/grn-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/purple-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/pink-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/ltblu-circle.png',
            'http://maps.google.com/mapfiles/kml/paddle/wht-circle.png'
        ]
    };

    let allIcons = [];
    Object.values(iconFamilies).forEach(family => allIcons.push(...family));

    const iconPopup = document.getElementById('icon-popup');
    let activeStyleButton = null;
    let currentIconSelections = {};

    if (iconPopup) {
        iconPopup.innerHTML = '';
        allIcons.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'popup-icon-option';
            img.style = 'width: 24px; height: 24px; cursor: pointer; padding: 4px; border-radius: 4px; border: 2px solid transparent; object-fit: contain;';

            img.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeStyleButton) {
                    activeStyleButton.querySelector('img').src = url;
                    const groupKey = activeStyleButton.getAttribute('data-group');
                    currentIconSelections[groupKey] = url;
                    activeStyleButton.style.borderColor = '#ecf0f1';
                }
                iconPopup.classList.add('hidden');
            });

            img.addEventListener('mouseover', () => img.style.borderColor = 'var(--color-primary)');
            img.addEventListener('mouseout', () => img.style.borderColor = 'transparent');

            iconPopup.appendChild(img);
        });
    }

    // Hide popup on outside click
    document.addEventListener('click', (e) => {
        if (iconPopup && !iconPopup.classList.contains('hidden') && !e.target.closest('.style-picker-btn') && !e.target.closest('#icon-popup')) {
            iconPopup.classList.add('hidden');
            if (activeStyleButton) activeStyleButton.style.borderColor = '#ecf0f1';
        }
    });

    function updateStyleConfigUI() {
        const container = document.getElementById('style-config-container');
        if (!container) return;

        container.innerHTML = '';
        currentIconSelections = {};

        const groupColIndex = groupSelect.value;
        const ignoreCase = document.getElementById('ignore-case-check').checked;

        let groupsToRender = ['Points Style'];

        if (groupColIndex !== "" && jsonData && jsonData.length > 1) {
            const groupCounts = new Map();
            for (let i = 1; i < jsonData.length; i++) {
                let val = jsonData[i][groupColIndex];
                if (val !== undefined && val !== null) {
                    let strVal = String(val).trim();
                    if (!strVal) strVal = "Uncategorized";

                    let key = ignoreCase ? strVal.toLowerCase() : strVal;
                    if (!groupCounts.has(key)) {
                        groupCounts.set(key, new Map());
                    }
                    const counts = groupCounts.get(key);
                    counts.set(strVal, (counts.get(strVal) || 0) + 1);
                }
            }
            if (groupCounts.size > 0) {
                const displayNames = [];
                groupCounts.forEach((counts, key) => {
                    let maxCount = -1;
                    let bestName = key;
                    counts.forEach((count, rawName) => {
                        if (count > maxCount) {
                            maxCount = count;
                            bestName = rawName;
                        }
                    });
                    displayNames.push(bestName);
                });
                groupsToRender = displayNames.sort();
            }
        }

        groupsToRender.forEach((groupName, idx) => {
            let defaultIconUrl = 'http://maps.google.com/mapfiles/ms/icons/red-pushpin.png';
            if (groupsToRender.length > 1) {
                const family = iconFamilies['ms-pushpin'];
                defaultIconUrl = family[idx % family.length];
            }

            currentIconSelections[groupName] = defaultIconUrl;

            const row = document.createElement('div');
            row.style = "display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0;";

            const label = document.createElement('span');
            label.style = "font-size: 14px; color: #34495e; font-weight: 500; word-break: break-all; padding-right: 12px;";
            label.textContent = groupName;

            const btn = document.createElement('button');
            btn.className = 'style-picker-btn';
            btn.setAttribute('data-group', groupName);
            btn.style = "background: white; border: 1px solid #ecf0f1; border-radius: 6px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: border-color 0.2s;";

            const img = document.createElement('img');
            img.src = defaultIconUrl;
            img.style = "width: 20px; height: 20px; object-fit: contain;";

            const caret = document.createElement('i');
            caret.className = 'fa-solid fa-chevron-down';
            caret.style = "font-size: 10px; color: #95a5a6;";

            btn.appendChild(img);
            btn.appendChild(caret);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (activeStyleButton) activeStyleButton.style.borderColor = '#ecf0f1';
                activeStyleButton = btn;
                btn.style.borderColor = 'var(--color-primary)';

                const rect = btn.getBoundingClientRect();
                iconPopup.style.left = rect.left + 'px';
                iconPopup.style.top = (rect.bottom + window.scrollY + 4) + 'px';
                iconPopup.classList.remove('hidden');
            });

            row.appendChild(label);
            row.appendChild(btn);
            container.appendChild(row);
        });
    }

    groupSelect.addEventListener('change', updateStyleConfigUI);
    document.getElementById('ignore-case-check').addEventListener('change', updateStyleConfigUI);

    // Config Actions
    btnCancel.addEventListener('click', resetApp);

    btnConvert.addEventListener('click', () => {
        const mode = document.querySelector('input[name="coord-mode"]:checked').value;

        let config = {
            mode: mode,
            nameIndex: nameSelect.value,
            groupIndex: groupSelect.value,
            scale: parseFloat(scaleInput.value) || 1.2,
            iconMap: currentIconSelections,
            latIndex: null,
            lonIndex: null,
            coordIndex: null
        };

        if (mode === 'separate') {
            config.latIndex = latSelect.value;
            config.lonIndex = lonSelect.value;
            if (!config.latIndex || !config.lonIndex) {
                alert("Please select both Latitude and Longitude columns.");
                return;
            }
        } else {
            config.coordIndex = coordSelect.value;
            if (!config.coordIndex) {
                alert("Please select the Coordinates column.");
                return;
            }
        }

        startConversion(config);
    });

    // Download / Restart
    btnDownload.addEventListener('click', () => {
        if (generatedKmzBlob) {
            const outName = currentFile.name.replace(/\.[^/.]+$/, "") + ".kmz";
            saveAs(generatedKmzBlob, outName);
        }
    });

    btnRestart.addEventListener('click', resetApp);


    // --- Functions ---

    function handleFile(file) {
        console.log("ExcelToKMZ: handleFile called for", file.name);
        currentFile = file;
        fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)})`;
        fileNameDisplay.title = fileNameDisplay.textContent;

        // Show processing briefly while parsing
        showView(processingView);
        updateProgress(10, "Reading file...");

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log("ExcelToKMZ: File read complete. Parsing...");
            const data = new Uint8Array(e.target.result);
            try {
                workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Use header:1 to get raw array of arrays, better for robust handling
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                console.log("ExcelToKMZ: JSON Data parsed. Rows:", jsonData ? jsonData.length : 0);

                if (!jsonData || jsonData.length < 2) {
                    alert("File appears to be empty or invalid (no data rows).");
                    resetApp();
                    return;
                }

                console.log("ExcelToKMZ: Populating Config...");
                populateConfig(jsonData);
                updateStyleConfigUI(); // Ensure UI is updated based on auto-selected grouping column

                // Update file pill with row count
                const validRows = Math.max(0, jsonData.length - 1);
                fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)}) | ${validRows} rows`;
                fileNameDisplay.title = fileNameDisplay.textContent;

                console.log("ExcelToKMZ: Config Populated. Showing Config View.");
                showView(configView);
            } catch (error) {
                console.error("ExcelToKMZ Error:", error);
                alert("Error parsing file. Please check if it's a valid Excel or CSV.");
                resetApp();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function populateConfig(data) {
        // Headers are first row
        const headers = data[0].map(String); // Ensure strings

        // Clear selects and add placeholders (Strict Rule: Do not select accidental defaults)
        latSelect.innerHTML = '<option value="">(Select Column)</option>';
        lonSelect.innerHTML = '<option value="">(Select Column)</option>';
        coordSelect.innerHTML = '<option value="">(Select Column)</option>';
        nameSelect.innerHTML = '<option value="">(None)</option>';
        groupSelect.innerHTML = '<option value="">(None)</option>';

        headers.forEach((header, index) => {
            if (!header.trim()) return; // Skip empty headers

            const option = document.createElement('option');
            option.value = index;
            option.textContent = header;

            latSelect.appendChild(option.cloneNode(true));
            lonSelect.appendChild(option.cloneNode(true));
            coordSelect.appendChild(option.cloneNode(true));
            nameSelect.appendChild(option.cloneNode(true));
            groupSelect.appendChild(option.cloneNode(true));
        });

        // Smart Detection Logic - Strict & Expanded
        // Use word boundaries (\b) or start/end anchors to avoid "Long Shop Code" matching "Long"
        // Also support "GPS", "Coordinates", "Point"

        const latRegex = /\b(lat|latitude|northing|y_coord|y-coord)\b/i;
        const lonRegex = /\b(lon|long|longitude|easting|x_coord|x-coord)\b/i;

        // Exclude common false positives for Longitude
        const lonExcludeRegex = /shop|code|description|distance|duration/i;

        const coordRegex = /\b(coord|coordinates|location|position|lat.*lon|gps|point)\b/i;
        const nameRegex = /\b(name|id|site|cell|label|identifier)\b/i;
        const groupRegex = /\b(group|folder|category|technology|cluster|zone)\b/i;

        let foundLat = -1;
        let foundLon = -1;
        let foundCoord = -1;
        let foundName = -1;
        let foundGroup = -1;

        headers.forEach((header, index) => {
            const h = header.toLowerCase();

            if (foundLat === -1 && latRegex.test(h)) foundLat = index;

            if (foundLon === -1 && lonRegex.test(h)) {
                // Strict check: Ensure it doesn't contain excluded words
                if (!lonExcludeRegex.test(h)) {
                    foundLon = index;
                }
            }

            if (foundCoord === -1 && coordRegex.test(h)) foundCoord = index;
            if (foundName === -1 && nameRegex.test(h)) foundName = index;
            if (foundGroup === -1 && groupRegex.test(h)) foundGroup = index;
        });

        // Apply Detections
        if (foundLat !== -1) latSelect.value = foundLat;
        if (foundLon !== -1) lonSelect.value = foundLon;
        if (foundName !== -1) nameSelect.value = foundName;
        if (foundGroup !== -1) groupSelect.value = foundGroup;
        if (foundCoord !== -1) coordSelect.value = foundCoord;

        // Auto-Detect Mode (1 Column vs 2 Columns)
        if (foundLat !== -1 && foundLon !== -1) {
            // Found Separate Columns -> Mode Separate
            modeRadios[0].checked = true;
            modeRadios[0].dispatchEvent(new Event('change'));
        } else if (foundCoord !== -1) {
            // Found Single Column -> Mode Single
            modeRadios[1].checked = true;
            modeRadios[1].dispatchEvent(new Event('change'));
        } else {
            // Default match nothing -> Separate mode (default)
            modeRadios[0].checked = true;
            modeRadios[0].dispatchEvent(new Event('change'));
        }
    }
    function startConversion(config) {
        // Init config with UI values
        config.ignoreCase = document.getElementById('ignore-case-check').checked;

        showView(processingView);
        updateProgress(0, "Starting conversion...");

        // START JOB (Moved from dead code)
        const jobId = JobTracker.start('ExcelToKMZ', [currentFile]);

        // Use setTimeout to allow UI to update (non-blocking)
        setTimeout(async () => {
            try {
                const results = generateKML(jsonData, config);

                if (results.validCount === 0) {
                    alert("No valid coordinates found!");
                    JobTracker.fail(jobId, "No valid coordinates found");
                    resetApp();
                    return;
                }

                updateProgress(80, "Compressing to KMZ...");
                const zip = new JSZip();
                zip.file("doc.kml", results.kml);

                generatedKmzBlob = await zip.generateAsync({ type: "blob" });

                const outName = currentFile.name.replace(/\.[^/.]+$/, "") + ".kmz";

                // Note: We don't auto-download here, we wait for user.
                // But for tracking purposes, the "Work" is done.
                // Ideally we track when they download, but tracking "Conversion Success" is better here.
                // We'll pass the blob to finish() so it logs size.

                JobTracker.finish(jobId, [new File([generatedKmzBlob], outName)]);

                updateProgress(100, "Done!");
                setTimeout(() => {
                    showView(resultView);
                    resultSummary.innerHTML = `
                        <div class="stat-box success">
                            <span class="stat-value">${results.validCount}</span>
                            <span class="stat-label">Converted</span>
                        </div>
                    `;
                    if (results.errorCount > 0) {
                        resultSummary.innerHTML += `
                            <div class="stat-box error">
                                <span class="stat-value">${results.errorCount}</span>
                                <span class="stat-label">Skipped</span>
                            </div>
                        `;
                    }

                    // Auto-download on success
                    if (generatedKmzBlob) {
                        saveAs(generatedKmzBlob, outName);
                    }
                }, 500);

            } catch (err) {
                console.error(err);
                alert("An error occurred: " + err.message);
                JobTracker.fail(jobId, err.message);
                resetApp();
            }
        }, 100);
    }
    function generateKML(data, config) {
        const headers = data[0];
        const rows = data.slice(1);

        let validCount = 0;
        let errorCount = 0;
        const total = rows.length;

        // Collect rows and process groups
        let processedRows = [];
        let uniqueGroups = new Set();
        let groupDisplayMap = new Map(); // Key -> Display Name
        const baseColors = [
            'ff0000ff', 'ff00ff00', 'ffff0000', 'ffffff00', 'ff00ffff', 'ffff00ff', 'ff800000', 'ff008000', 'ff000080'
        ]; // Red, Green, Blue, Cyan, Yellow, Magenta... (KML is AABBGGRR)

        // Map for frequency counting: groupKey -> { rawValue: count }
        let groupValueCounts = new Map();

        rows.forEach((row, i) => {
            // Update progress roughly
            if (i % 200 === 0) updateProgress(10 + (i / total) * 30, "Parsing rows...");

            if (!row || row.length === 0 || row.every(cell => !cell)) return;

            let lat = null;
            let lon = null;

            try {
                if (config.mode === 'separate') {
                    lat = parseCoordinate(row[config.latIndex]);
                    lon = parseCoordinate(row[config.lonIndex]);
                } else {
                    const raw = row[config.coordIndex];
                    const parts = splitCoordinates(raw);
                    if (parts) {
                        lat = parseCoordinate(parts.lat);
                        lon = parseCoordinate(parts.lon);
                    }
                }

                if (isValidLatLon(lat, lon)) {
                    let groupVal = "Default";
                    if (config.groupIndex && row[config.groupIndex] !== undefined && row[config.groupIndex] !== null) {
                        groupVal = String(row[config.groupIndex]).trim();
                        if (!groupVal) groupVal = "Uncategorized";
                    }

                    // Handle Case Insensitivity
                    let groupKey = groupVal;
                    if (config.ignoreCase) {
                        groupKey = groupVal.toLowerCase();
                    }

                    // Track frequency of this specific case style
                    if (!groupValueCounts.has(groupKey)) {
                        groupValueCounts.set(groupKey, new Map());
                    }
                    const counts = groupValueCounts.get(groupKey);
                    counts.set(groupVal, (counts.get(groupVal) || 0) + 1);

                    uniqueGroups.add(groupKey);

                    processedRows.push({
                        row,
                        lat,
                        lon,
                        groupKey: groupKey, // Use normalized key for grouping logic
                        originalIndex: i
                    });
                    validCount++;
                } else {
                    errorCount++;
                }
            } catch (e) { errorCount++; }
        });

        // Determine Final Display Names based on frequency
        groupValueCounts.forEach((counts, key) => {
            let maxCount = -1;
            let bestName = key; // Default fallback

            counts.forEach((count, rawName) => {
                if (count > maxCount) {
                    maxCount = count;
                    bestName = rawName;
                }
            });
            groupDisplayMap.set(key, bestName);
        });

        // Generate Styles
        let kmlStyles = '';
        let groupColorMap = {};

        if (config.groupIndex) {
            // Iterate over unique KEYS
            Array.from(uniqueGroups).sort().forEach(gKey => {
                let gDisplay = groupDisplayMap.get(gKey);
                let specificIconUrl = config.iconMap[gDisplay] || config.iconMap['Points Style'] || 'http://maps.google.com/mapfiles/ms/icons/red-pushpin.png';

                // Safe ID using key
                let safeId = "style_" + gKey.replace(/[^a-zA-Z0-9]/g, '_');
                kmlStyles += `
    <Style id="${safeId}">
      <IconStyle>
        <scale>${config.scale}</scale>
        <Icon><href>${specificIconUrl}</href></Icon>
      </IconStyle>
    </Style>`;
            });
        }
        else {
            let singleIconUrl = config.iconMap['Points Style'] || 'http://maps.google.com/mapfiles/ms/icons/red-pushpin.png';
            // Single default style with native icon
            kmlStyles += `
    <Style id="defaultStyle">
      <IconStyle>
        <scale>${config.scale}</scale>
        <Icon><href>${singleIconUrl}</href></Icon>
      </IconStyle>
    </Style>`;
        }


        // Build KML Body
        let kmlBody = '';

        if (config.groupIndex) {
            // Grouped output
            Array.from(uniqueGroups).sort().forEach(gKey => {
                let displayGroup = groupDisplayMap.get(gKey);
                kmlBody += `<Folder><name>${escapeXml(displayGroup)}</name>`;

                const groupRows = processedRows.filter(r => r.groupKey === gKey);
                groupRows.forEach(item => {
                    kmlBody += createPlacemark(item, headers, config, gKey);
                });

                kmlBody += `</Folder>`;
            });
        } else {
            // Flat output (either no group selected, or group selected but not colorized)
            processedRows.forEach(item => {
                kmlBody += createPlacemark(item, headers, config, null);
            });
        }

        const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Converted Locations</name>
    ${kmlStyles}
    ${kmlBody}
  </Document>
</kml>`;

        return { kml, validCount, errorCount };
    }

    function createPlacemark(item, headers, config, groupName) {
        const row = item.row;
        const nameIdx = config.nameIndex;
        let name = (nameIdx && row[nameIdx] !== undefined && row[nameIdx] !== null) ? String(row[nameIdx]) : `Point ${item.originalIndex + 1}`;
        name = escapeXml(name);

        let styleUrl = '#defaultStyle';
        if (config.groupIndex && groupName) {
            styleUrl = '#style_' + groupName.replace(/[^a-zA-Z0-9]/g, '_');
        }

        let description = '<table border="1" cellpadding="2" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 10pt;">';
        headers.forEach((h, colIdx) => {
            let val = row[colIdx];
            if (val !== undefined && val !== null && String(val).trim() !== "") {
                description += `<tr><td style="background-color: #f0f0f0;"><b>${escapeXml(String(h))}</b></td><td>${escapeXml(String(val))}</td></tr>`;
            }
        });
        description += '</table>';

        return `
    <Placemark>
      <name>${name}</name>
      <styleUrl>${styleUrl}</styleUrl>
      <description><![CDATA[${description}]]></description>
      <Point>
        <coordinates>${item.lon},${item.lat},0</coordinates>
      </Point>
    </Placemark>`;
    }


    function isValidLatLon(lat, lon) {
        return (
            typeof lat === 'number' && !isNaN(lat) &&
            typeof lon === 'number' && !isNaN(lon) &&
            Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
            !(lat === 0 && lon === 0)
        );
    }

    function splitCoordinates(raw) {
        if (!raw) return null;
        const str = String(raw).trim();
        let parts = str.split(/[,;|]+|\s+/).filter(p => p.trim().length > 0);

        if (parts.length >= 2) {
            return { lat: parts[0], lon: parts[1] };
        }
        return null;
    }

    function parseCoordinate(value) {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number') return value;

        const str = String(value).trim();

        if (/[NSEW]/i.test(str) || str.includes('°')) {
            return parseDMS(str);
        }

        const cleaned = str.replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);

        if (!isNaN(parsed)) return parsed;

        return null;
    }

    function parseDMS(dmsStr) {
        const isSouth = /S/i.test(dmsStr);
        const isWest = /W/i.test(dmsStr);
        const cleanStr = dmsStr.replace(/[°'"d]/g, ' ').replace(/[NSEW]/gi, ' ').trim();
        const parts = cleanStr.split(/\s+/).map(Number).filter(n => !isNaN(n));

        if (parts.length < 1) return null;

        let deg = parts[0];
        let min = parts.length > 1 ? parts[1] : 0;
        let sec = parts.length > 2 ? parts[2] : 0;

        let decimal = deg + (min / 60) + (sec / 3600);

        if (isSouth || isWest) decimal = -decimal;

        return decimal;
    }

    function escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    // UI Helpers
    function showView(viewElement) {
        [uploadView, configView, processingView, resultView].forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('active');
        });
        viewElement.classList.remove('hidden');
        viewElement.classList.add('active');

        // Hide header description and reduce margin on processing/result views to perfectly center content
        const toolHeader = document.querySelector('.tool-header');
        if (toolHeader) {
            if (viewElement === processingView || viewElement === resultView) {
                toolHeader.classList.add('condensed');
            } else {
                toolHeader.classList.remove('condensed');
            }
        }
    }

    function updateProgress(percent, text) {
        progressBar.style.width = `${percent}%`;
        if (text) progressText.textContent = text;
    }

    function resetApp() {
        currentFile = null;
        workbook = null;
        jsonData = null;
        generatedKmzBlob = null;

        // Reset Drop Zone Visuals
        if (dropZoneController) dropZoneController.reset();

        progressBar.style.width = '0%';
        if (resultSummary) {
            resultSummary.textContent = '';
        }

        // Reset state
        modeRadios[0].checked = true; // Default to separate on reset
        separateModeInputs.classList.remove('hidden');
        singleModeInputs.classList.add('hidden');

        showView(uploadView);
    }
});
