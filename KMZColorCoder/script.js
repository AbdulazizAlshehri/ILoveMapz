// KMZ Color Coder Logic
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
            saveAs(outputBlob, `Colored_${mapFile.name.replace('.kml', '.kmz')}`);
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
}

function updateProgress(percent, text, details = '') {
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('progress-text').textContent = text;

    // Add a details block if it doesn't exist, specifically for granular progress
    let detailsEl = document.getElementById('progress-details');
    if (!detailsEl) {
        detailsEl = document.createElement('p');
        detailsEl.id = 'progress-details';
        detailsEl.style = "margin-top: 5px; font-size: 14px; color: #888;";
        const container = document.getElementById('processing-view');
        container.appendChild(detailsEl);
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
        populateSelectOptions('excel-key-select', excelHeaders);
        populateSelectOptions('excel-value-select', excelHeaders);

        showView('config-view');
    } catch (err) {
        console.error("Error parsing Excel", err);
        alert("Failed to parse the Excel file.");
        resetApp();
    }
}

function populateSelectOptions(selectId, optionsArray) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    optionsArray.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
    });
}

// ==============
// PROCESSING
// ==============
async function startProcessing() {
    const matchCol = document.getElementById('excel-key-select').value;
    const valueCol = document.getElementById('excel-value-select').value;
    const kmzAttr = document.getElementById('kmz-key-select').value;
    const palette = document.getElementById('color-palette-select').value;
    const grayUnmatched = document.getElementById('unmatched-gray-check').checked;

    showView('processing-view');
    updateProgress(20, "Extracting Map File...");

    jobContext = window.JobTracker ? window.JobTracker.start('KMZColorCoder', [mapFile, dataFile]) : null;

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

        // Create Data Map
        const dataMap = new Map(); // key -> value
        let isNumeric = true;
        let minVal = Infinity;
        let maxVal = -Infinity;

        parsedExcelData.forEach(row => {
            const k = String(row[matchCol]).trim().toLowerCase();
            const vRaw = row[valueCol];
            dataMap.set(k, vRaw);

            if (palette.startsWith('gradient')) {
                const num = parseFloat(vRaw);
                if (!isNaN(num)) {
                    if (num < minVal) minVal = num;
                    if (num > maxVal) maxVal = num;
                } else {
                    isNumeric = false;
                }
            }
        });

        if (palette.startsWith('gradient') && !isNumeric && minVal === Infinity) {
            alert("Warning: Gradient palette selected but values are not mostly numeric. Results may be unexpected.");
        }

        updateProgress(60, "Coloring features...");

        // Categorical colors generator
        const catColors = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080', '#ffffff', '#000000'];
        let colorIndex = 0;
        const catColorMap = new Map();

        let matchCount = 0;
        let unmatchCount = 0;

        const placemarks = xmlDoc.getElementsByTagName('Placemark');
        const documentNode = xmlDoc.getElementsByTagName('Document')[0] || xmlDoc.documentElement;

        const totalPlacemarks = placemarks.length;
        const chunkSize = 200; // Process 200 placemarks before yielding

        for (let i = 0; i < totalPlacemarks; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize, totalPlacemarks);

            for (let j = i; j < chunkEnd; j++) {
                const pm = placemarks[j];

                let kmzKey = "";
                if (kmzAttr === 'name') {
                    const nameNode = pm.getElementsByTagName('name')[0];
                    if (nameNode) kmzKey = nameNode.textContent.trim().toLowerCase();
                } else if (kmzAttr === 'description') {
                    const descNode = pm.getElementsByTagName('description')[0];
                    if (descNode) kmzKey = descNode.textContent.trim().toLowerCase(); // Requires exact match
                }


                // In actual advanced usage, user might want "contains" logic, but "exact match" is standard for keys.

                let fillColorKML = "80808080"; // Default gray (AABBGGRR)
                let matchFound = dataMap.has(kmzKey);

                if (matchFound) {
                    matchCount++;
                    const val = dataMap.get(kmzKey);

                    let hexColor = ""; // #RRGGBB
                    if (palette.startsWith('gradient')) {
                        const num = parseFloat(val);
                        if (!isNaN(num)) {
                            let ratio = maxVal === minVal ? 0.5 : (num - minVal) / (maxVal - minVal);
                            if (palette === 'gradient-blue-red') {
                                // Blue to Red
                                hexColor = interpolateColor('#0000ff', '#ff0000', ratio);
                            } else {
                                // Red to Green
                                hexColor = interpolateColor('#ff0000', '#00ff00', ratio);
                            }
                        } else {
                            hexColor = "#808080";
                        }
                    } else {
                        // Categorical
                        if (!catColorMap.has(val)) {
                            catColorMap.set(val, catColors[colorIndex % catColors.length]);
                            colorIndex++;
                        }
                        hexColor = catColorMap.get(val);
                    }

                    // Convert KML color format aabbggrr
                    const r = hexColor.substring(1, 3);
                    const g = hexColor.substring(3, 5);
                    const b = hexColor.substring(5, 7);
                    fillColorKML = "aa" + b + g + r; // 66% opacity approx (aa)

                } else {
                    unmatchCount++;
                    if (!grayUnmatched) {
                        continue; // Leave original style
                    }
                    fillColorKML = "80808080";
                }

                // Apply style inline
                let styleNode = pm.getElementsByTagName('Style')[0];
                if (!styleNode) {
                    styleNode = xmlDoc.createElement('Style');
                    pm.appendChild(styleNode);
                }

                // PolyStyle
                let polyStyle = styleNode.getElementsByTagName('PolyStyle')[0];
                if (!polyStyle) {
                    polyStyle = xmlDoc.createElement('PolyStyle');
                    styleNode.appendChild(polyStyle);
                }
                let pColor = polyStyle.getElementsByTagName('color')[0];
                if (!pColor) {
                    pColor = xmlDoc.createElement('color');
                    polyStyle.appendChild(pColor);
                }
                pColor.textContent = fillColorKML;

                // IconStyle (for points)
                let iconStyle = styleNode.getElementsByTagName('IconStyle')[0];
                if (!iconStyle) {
                    iconStyle = xmlDoc.createElement('IconStyle');
                    styleNode.appendChild(iconStyle);
                }
                let iColor = iconStyle.getElementsByTagName('color')[0];
                if (!iColor) {
                    iColor = xmlDoc.createElement('color');
                    iconStyle.appendChild(iColor);
                }
                // For icon color, usually opacity is full 'ff'
                const rIcon = fillColorKML.substring(6, 8);
                const gIcon = fillColorKML.substring(4, 6);
                const bIcon = fillColorKML.substring(2, 4);
                iColor.textContent = "ff" + fillColorKML.substring(2);

            }

            // Update progress and yield to main thread without throttling
            const percent = 60 + Math.floor((chunkEnd / totalPlacemarks) * 20); // Scale from 60% to 80%
            updateProgress(percent, `Coloring features...`, `Processed ${chunkEnd} of ${totalPlacemarks}`);
            await yieldToMain();
        }

        updateProgress(80, "Generating new KMZ...");

        const serializer = new XMLSerializer();
        const outputKmlString = serializer.serializeToString(xmlDoc);

        const outZip = new JSZip();
        outZip.file("doc.kml", outputKmlString);
        outputBlob = await outZip.generateAsync({ type: "blob" });

        updateProgress(100, "Done!");

        if (window.JobTracker) {
            outputBlob.name = `Colored_${mapFile.name.replace('.kml', '.kmz')}`;
            window.JobTracker.finish(jobContext, [outputBlob]);
        }

        setTimeout(() => {
            showResult(matchCount, unmatchCount);
        }, 500);

    } catch (err) {
        console.error("Processing error", err);
        if (window.JobTracker) window.JobTracker.fail(jobContext, err.message);
        alert("An error occurred during processing: " + err.message);
        resetApp();
    }
}

function showResult(matchCount, unmatchCount) {
    const sumDiv = document.getElementById('result-summary');
    sumDiv.innerHTML = `
        <div class="stats-container">
            <div class="stat-card solid-dark">
                <div class="stat-card-value">${formatNumber(matchCount + unmatchCount)}</div>
                <div class="stat-card-label">Total Features</div>
            </div>
            <div class="stat-card solid-success">
                <div class="stat-card-value">${formatNumber(matchCount)}</div>
                <div class="stat-card-label">Colored</div>
            </div>
            <div class="stat-card solid-danger">
                <div class="stat-card-value">${formatNumber(unmatchCount)}</div>
                <div class="stat-card-label">Defaulted</div>
            </div>
        </div>
    `;
    sumDiv.style.background = 'transparent';
    sumDiv.style.padding = '0';
    saveAs(outputBlob, `Colored_${mapFile.name.replace('.kml', '.kmz')}`);
    showView('result-view');
}

function resetApp() {
    mapFile = null;
    dataFile = null;
    parsedExcelData = [];
    outputBlob = null;

    // Reset file inputs visually using the shared tool if possible, else reload
    window.location.reload();
}

// Utils
function interpolateColor(color1, color2, factor) {
    if (arguments.length < 3) { factor = 0.5; }
    var result = color1.slice();
    result = "#" + Math.round(parseInt(color1.substring(1, 3), 16) + factor * (parseInt(color2.substring(1, 3), 16) - parseInt(color1.substring(1, 3), 16))).toString(16).padStart(2, '0') +
        Math.round(parseInt(color1.substring(3, 5), 16) + factor * (parseInt(color2.substring(3, 5), 16) - parseInt(color1.substring(3, 5), 16))).toString(16).padStart(2, '0') +
        Math.round(parseInt(color1.substring(5, 7), 16) + factor * (parseInt(color2.substring(5, 7), 16) - parseInt(color1.substring(5, 7), 16))).toString(16).padStart(2, '0');
    return result;
}
