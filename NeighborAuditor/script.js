document.addEventListener('DOMContentLoaded', () => {
    // Views
    const uploadView = document.getElementById('upload-view');
    const configView = document.getElementById('config-view');
    const processingView = document.getElementById('processing-view');
    const resultView = document.getElementById('result-view');

    // Config & Actions
    const btnProcess = document.getElementById('btn-process');
    const btnCancel = document.getElementById('btn-cancel');
    const btnDownload = document.getElementById('btn-download');
    const btnRestart = document.getElementById('btn-restart');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressDetails = document.getElementById('progress-details');
    const resultSummary = document.getElementById('result-summary');

    let currentFile = null;
    let generatedBlob = null;
    let generatedName = "";

    const dropZoneController = setupUnifiedDropZone('drop-zone-main', 'file-input', (files) => {
        currentFile = files[0];
        showView(configView);
    }, () => {
        currentFile = null;
    });

    btnCancel.addEventListener('click', () => {
        resetApp();
    });

    btnRestart.addEventListener('click', (e) => {
        e.preventDefault();
        resetApp();
    });

    btnProcess.addEventListener('click', () => {
        if (!currentFile) return;
        startProcessing();
    });

    btnDownload.addEventListener('click', () => {
        if (generatedBlob) {
            saveAs(generatedBlob, generatedName);
        }
    });

    function startProcessing() {
        showView(processingView);
        updateProgress(10, 'Initializing audit...');

        const jobId = JobTracker.start('NeighborAuditor', [currentFile]);

        // Simulate logic
        setTimeout(() => {
            try {
                updateProgress(50, 'Processing data...', `Auditing distances... (${1} item(s))`);

                // --- Business Logic Goes Here ---

                updateProgress(90, 'Finalizing...');

                // Mock result
                generatedBlob = new Blob(["Audit complete"], { type: "text/plain" });
                generatedName = "Audit_Report.xlsx";

                JobTracker.finish(jobId, [new File([generatedBlob], generatedName)]);

                updateProgress(100, 'Done!');
                if (resultSummary) {
                    resultSummary.innerHTML = `
                        <div class="stat-box success">
                            <span class="stat-value">1</span>
                            <span class="stat-label">File Audited</span>
                        </div>
                    `;
                }
                showView(resultView);

                // Auto Download
                saveAs(generatedBlob, generatedName);
            } catch (err) {
                console.error(err);
                JobTracker.fail(jobId, err.message);
                alert("Error during processing: " + err.message);
                resetApp();
            }
        }, 1500);
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

    function resetApp() {
        currentFile = null;
        generatedBlob = null;
        if (dropZoneController) dropZoneController.reset();
        updateProgress(0, "Reading files...");
        if (resultSummary) resultSummary.innerHTML = '';
        showView(uploadView);
    }
});
