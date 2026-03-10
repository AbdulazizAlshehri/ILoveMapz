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

    async function startProcessing() {
        showView(processingView);
        updateProgress(10, 'Initializing split...');

        const jobId = JobTracker.start('KMLSplitter', [currentFile]);

        // Simulate logic
        try {
            await window.yieldToMain();

            updateProgress(50, 'Processing data...', `Splitting features... (${1} item(s))`);

            // --- Business Logic Goes Here ---

            updateProgress(90, 'Finalizing...');

            // Mock result
            generatedBlob = new Blob(["Split complete"], { type: "text/plain" });
            generatedName = currentFile.name.replace(/\.[^/.]+$/, "") + "_Split.zip";

            JobTracker.finish(jobId, [new File([generatedBlob], generatedName)]);

            updateProgress(100, 'Done!');
            if (resultSummary) {
                resultSummary.innerHTML = `
                    <div class="stat-box success">
                        <span class="stat-value">1</span>
                        <span class="stat-label">File Split</span>
                    </div>
                    <div style="margin-top: 20px; font-size: 14px; color: #64748b; background: #f8f9fa; padding: 8px 16px; border-radius: 6px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0;">
                        <i class="fa-solid fa-file-signature" style="color:var(--color-primary);"></i>
                        <span>Output File: <strong style="color: #334155;">${generatedName}</strong></span>
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
