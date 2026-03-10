// KMZ to Excel Converter Logic

// Elements
// dropZone and btnSelect handled by unified helper via ID 'drop-zone-main'
const fileInput = document.getElementById('file-input');
const btnDownload = document.getElementById('btn-download');
const btnRestart = document.getElementById('btn-restart');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressDetails = document.getElementById('progress-details');
const resultSummary = document.getElementById('result-summary');

// Views
const uploadView = document.getElementById('upload-view');
const configView = document.getElementById('config-view');
const processingView = document.getElementById('processing-view');
const resultView = document.getElementById('result-view');

// Config Elements
const btnExtract = document.getElementById('btn-extract');
const btnCancel = document.getElementById('btn-cancel');
const fileNameDisplay = document.getElementById('file-name');
const includeDescCheck = document.getElementById('include-desc-check');
const includeAltCheck = document.getElementById('include-alt-check');

let generatedExcelBlob = null;
let generatedFileName = "Converted_Coordinates.xlsx";
let currentFile = null;

// Drag & Drop (Unified)
const dropZoneController = setupUnifiedDropZone('drop-zone-main', 'file-input', (files) => {
    handleFile(files[0]);
}, () => {
    // Logic if file removed manually (though app likely auto-advanced)
});

async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'kml' && ext !== 'kmz') {
        alert("Please select a valid .kml or .kmz file.");
        return;
    }

    currentFile = file;
    if (fileNameDisplay) {
        fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)}) | Calculating...`;
        fileNameDisplay.title = fileNameDisplay.textContent;
    }
    showView(configView);

    try {
        let kmlText = "";
        if (ext === 'kmz') {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            const kmlFileName = Object.keys(contents.files).find(name => name.endsWith('.kml'));
            if (kmlFileName) kmlText = await contents.file(kmlFileName).async("string");
        } else {
            kmlText = await readFileAsText(file);
        }

        let placemarkCount = 0;
        if (kmlText) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(kmlText, "text/xml");
            placemarkCount = xmlDoc.getElementsByTagName("Placemark").length;
        }

        if (fileNameDisplay) {
            fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)}) | ${placemarkCount} placemarks`;
            fileNameDisplay.title = fileNameDisplay.textContent;
        }
    } catch (e) {
        console.warn("Could not pre-parse KMZ for placemark count", e);
        if (fileNameDisplay) {
            fileNameDisplay.textContent = `${file.name} (${formatFileSize(file.size)})`;
            fileNameDisplay.title = fileNameDisplay.textContent;
        }
    }
}

if (btnExtract) {
    btnExtract.addEventListener('click', () => {
        if (currentFile) startConversion(currentFile);
    });
}

if (btnCancel) {
    btnCancel.addEventListener('click', () => {
        resetApp();
    });
}

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
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText && text) progressText.innerText = text;
    if (progressDetails) {
        if (details) {
            progressDetails.innerText = details;
            progressDetails.style.display = 'block';
        } else {
            progressDetails.innerText = '';
            progressDetails.style.display = 'none';
        }
    }
}

async function startConversion(file) {
    showView(processingView);
    updateProgress(0, "Reading file...");

    // START JOB
    const jobId = JobTracker.start('KMZtoExcel', [file]);

    try {
        let kmlText = "";

        if (file.name.toLowerCase().endsWith('.kmz')) {
            updateProgress(20, "Unzipping KMZ...");
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);

            // Find the KML file (usually doc.kml)
            const kmlFileName = Object.keys(contents.files).find(name => name.endsWith('.kml'));
            if (!kmlFileName) {
                throw new Error("No KML file found inside the KMZ archive.");
            }
            kmlText = await contents.file(kmlFileName).async("string");
        } else {
            // Is KML
            kmlText = await readFileAsText(file);
        }

        updateProgress(50, "Parsing XML...");

        await window.yieldToMain();
        const placemarks = await parseKML(kmlText);

        if (placemarks.length === 0) {
            alert("No placemarks found in this file.");
            JobTracker.fail(jobId, "No placemarks found");
            resetApp();
            return;
        }

        updateProgress(80, "Generating Excel...", `Parsed ${formatNumber(placemarks.length)} placemarks`);
        const generatedBlob = generateExcel(placemarks, file.name);

        // FINISH JOB
        const outName = file.name.replace(/\.[^/.]+$/, "") + "_Excel.xlsx";

        JobTracker.finish(jobId, [new File([generatedBlob], outName)]);

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
        JobTracker.fail(jobId, err.message);
        JobTracker.fail(jobId, err.message);
        resetApp();
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(new TextDecoder("utf-8").decode(e.target.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function parseKML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    const data = [];

    const includeDesc = includeDescCheck ? includeDescCheck.checked : true;
    const includeAlt = includeAltCheck ? includeAltCheck.checked : true;

    for (let i = 0; i < placemarks.length; i++) {
        if (i > 0 && i % 200 === 0) await window.yieldToMain();
        const pm = placemarks[i];

        // Extract Name
        const nameNode = pm.getElementsByTagName("name")[0];
        const name = nameNode ? nameNode.textContent.trim() : "";

        // Extract Description and ExtendedData Attributes
        let description = "";
        let extDataProps = {};

        // Always attempt to pull ExtendedData as distinct columns (Google Earth Schema)
        const dataNodes = ["Data", "SimpleData"];
        for (const tagName of dataNodes) {
            const nodes = pm.getElementsByTagName(tagName);
            for (const node of nodes) {
                const attrName = node.getAttribute("name");
                const valueNode = node.getElementsByTagName("value")[0];
                const attrValue = valueNode ? valueNode.textContent.trim() : node.textContent.trim();
                // Assign each ExtendedData property to a unique column name
                if (attrName && attrValue) {
                    extDataProps[attrName] = attrValue;
                }
            }
        }

        if (includeDesc) {
            const descNode = pm.getElementsByTagName("description")[0];
            description = descNode ? descNode.textContent.trim() : "";

            // Always run Simple HTML strip for the main description tag
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = description;
            description = tempDiv.textContent || tempDiv.innerText || "";
        }

        // Extract Coordinates (Point or Polygon Centroid)
        const pointNode = pm.getElementsByTagName("Point")[0];
        const polyNode = pm.getElementsByTagName("Polygon")[0];
        let lat = "", lon = "", alt = "";

        if (pointNode) {
            const coordNode = pointNode.getElementsByTagName("coordinates")[0];
            if (coordNode) {
                const coords = coordNode.textContent.trim().split(',');
                if (coords.length >= 2) {
                    lon = coords[0].trim();
                    lat = coords[1].trim();
                    if (includeAlt) {
                        alt = coords[2] ? coords[2].trim() : "0";
                    }
                }
            }
        } else if (polyNode) {
            // Find centroid of the polygon
            const coordNode = polyNode.getElementsByTagName("coordinates")[0];
            if (coordNode) {
                const coordString = coordNode.textContent.trim();
                // KML coordinates format: lon,lat,alt lon,lat,alt ...
                const coordPairs = coordString.split(/\s+/).filter(c => c.length > 0);

                let sumLat = 0, sumLon = 0, count = 0;
                for (const pair of coordPairs) {
                    const coords = pair.split(',');
                    if (coords.length >= 2) {
                        let parsedLon = parseFloat(coords[0].trim());
                        let parsedLat = parseFloat(coords[1].trim());
                        if (!isNaN(parsedLon) && !isNaN(parsedLat)) {
                            sumLon += parsedLon;
                            sumLat += parsedLat;
                            count++;
                        }
                        if (includeAlt && coords.length >= 3 && count === 1) {
                            // Just take the first point's altitude roughly
                            alt = coords[2].trim();
                        }
                    }
                }

                if (count > 0) {
                    lon = (sumLon / count).toFixed(6);
                    lat = (sumLat / count).toFixed(6);
                }
            }
        }

        // Folder/Group (Parent name)
        let folder = "Root";
        if (pm.parentNode && pm.parentNode.nodeName === 'Folder') {
            const folderName = pm.parentNode.getElementsByTagName('name')[0];
            if (folderName) folder = folderName.textContent.trim();
        }

        const rowData = {
            "Folder": folder,
            "Name": name,
            "Latitude": lat,
            "Longitude": lon
        };

        if (includeAlt) rowData["Altitude"] = alt;
        if (includeDesc && description) rowData["Description"] = description;

        // Merge the individual ExtendedData columns
        Object.assign(rowData, extDataProps);

        data.push(rowData);
    }

    return data;
}

function generateExcel(data, originalFileName) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Placemarks");

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    generatedExcelBlob = new Blob([wbout], { type: "application/octet-stream" });
    generatedFileName = originalFileName.replace(/\.[^/.]+$/, "") + "_Excel.xlsx";

    updateProgress(100, "Done!");
    setTimeout(() => {
        showView(resultView);
        resultSummary.innerHTML = `
            <div class="stats-container">
                <div class="stat-card solid-success">
                    <div class="stat-card-value">${formatNumber(data.length)}</div>
                    <div class="stat-card-label">Extracted</div>
                </div>
            </div>
            <div style="margin-top: 20px; font-size: 14px; color: #64748b; background: #f8f9fa; padding: 8px 16px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0;">
                <i class="fa-solid fa-file-signature" style="color:var(--color-primary);"></i>
                <span>Output File: <strong style="color: #334155;">${generatedFileName}</strong></span>
            </div>
        `;
        resultSummary.style.background = 'transparent';
        resultSummary.style.padding = '0';

        // Auto-download on success
        if (generatedExcelBlob) {
            saveAs(generatedExcelBlob, generatedFileName);
        }
    }, 500);

    return generatedExcelBlob; // Return for tracking
}

// Download Handler
btnDownload.addEventListener('click', () => {
    if (generatedExcelBlob) {
        saveAs(generatedExcelBlob, generatedFileName);
    }
});

btnRestart.addEventListener('click', () => {
    resetApp();
});

function resetApp() {
    generatedExcelBlob = null;
    generatedFileName = "Converted_Coordinates.xlsx";
    currentFile = null;

    // Reset Drop Zone
    if (dropZoneController) dropZoneController.reset();

    // Reset Progress
    progressBar.style.width = '0%';
    progressText.textContent = '';
    resultSummary.textContent = '';

    showView(uploadView);
}
