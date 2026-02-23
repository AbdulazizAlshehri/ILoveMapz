// KMZ to Excel Converter Logic

// Elements
// dropZone and btnSelect handled by unified helper via ID 'drop-zone-main'
const fileInput = document.getElementById('file-input');
const btnDownload = document.getElementById('btn-download');
const btnRestart = document.getElementById('btn-restart');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
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
const stripHtmlCheck = document.getElementById('strip-html-check');
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

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'kml' && ext !== 'kmz') {
        alert("Please select a valid .kml or .kmz file.");
        return;
    }

    currentFile = file;
    if (fileNameDisplay) fileNameDisplay.textContent = file.name;
    showView(configView);
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

function updateProgress(percent, text) {
    progressBar.style.width = `${percent}%`;
    if (text) progressText.textContent = text;
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
        // Use timeout to allow UI update
        setTimeout(() => {
            const placemarks = parseKML(kmlText);

            if (placemarks.length === 0) {
                alert("No placemarks found in this file.");
                JobTracker.fail(jobId, "No placemarks found");
                alert("No placemarks found in this file.");
                JobTracker.fail(jobId, "No placemarks found");
                resetApp();
                return;
            }

            updateProgress(80, "Generating Excel...");
            const generatedBlob = generateExcel(placemarks, file.name);

            // FINISH JOB
            // generateExcel returns blob now (modified below)
            const outName = file.name.replace(/\.[^/.]+$/, "") + "_extracted.xlsx";

            // Note: generateExcel was modifying globals, now we pass job cleanup
            JobTracker.finish(jobId, [new File([generatedBlob], outName)]);

        }, 100);

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
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function parseKML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    const data = [];

    const includeDesc = includeDescCheck ? includeDescCheck.checked : true;
    const stripHtml = stripHtmlCheck ? stripHtmlCheck.checked : true;
    const includeAlt = includeAltCheck ? includeAltCheck.checked : true;

    for (let i = 0; i < placemarks.length; i++) {
        const pm = placemarks[i];

        // Extract Name
        const nameNode = pm.getElementsByTagName("name")[0];
        const name = nameNode ? nameNode.textContent.trim() : "";

        // Extract Description
        let description = "";
        if (includeDesc) {
            const descNode = pm.getElementsByTagName("description")[0];
            description = descNode ? descNode.textContent.trim() : "";

            if (stripHtml) {
                // Simple HTML strip
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = description;
                description = tempDiv.textContent || tempDiv.innerText || "";
            }
        }

        // Extract Coordinates
        const pointNode = pm.getElementsByTagName("Point")[0];
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
        if (includeDesc) rowData["Description"] = description;

        data.push(rowData);
    }

    return data;
}

function generateExcel(data, originalFileName) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Placemarks");

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    generatedExcelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Set filename
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
    generatedFileName = `${baseName}_extracted.xlsx`;

    updateProgress(100, "Done!");
    setTimeout(() => {
        showView(resultView);
        resultSummary.textContent = `Successfully extracted ${data.length} placemarks.`;

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
