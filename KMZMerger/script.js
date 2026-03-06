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

    let currentFiles = [];
    let generatedBlob = null;
    let generatedName = "";

    const dropZoneController = setupUnifiedDropZone('drop-zone-main', 'file-input', (files) => {
        currentFiles = Array.from(files);
        showView(configView);
    }, () => {
        currentFiles = [];
    });

    btnCancel.addEventListener('click', () => {
        resetApp();
    });

    btnRestart.addEventListener('click', (e) => {
        e.preventDefault();
        resetApp();
    });

    btnProcess.addEventListener('click', () => {
        if (currentFiles.length === 0) return;
        startProcessing();
    });

    btnDownload.addEventListener('click', () => {
        if (generatedBlob) {
            saveAs(generatedBlob, generatedName);
        }
    });

    function startProcessing() {
        showView(processingView);
        updateProgress(10, 'Initializing merge...');

        const jobId = JobTracker.start('KMZMerger', currentFiles);

        // Simulate logic
        setTimeout(() => {
            try {
                updateProgress(50, 'Processing data...', `Merging files... (${currentFiles.length} item(s))`);

                // --- Business Logic Goes Here ---

                updateProgress(90, 'Finalizing...');

                // Mock result
                generatedBlob = new Blob(["Merged complete"], { type: "text/plain" });
                generatedName = "Merged_Result.txt";

                JobTracker.finish(jobId, [new File([generatedBlob], generatedName)]);

                updateProgress(100, 'Done!');
                if (resultSummary) {
                    resultSummary.innerHTML = `
                        <div class="stat-box success">
                            <span class="stat-value">${formatNumber(currentFiles.length)}</span>
                            <span class="stat-label">Files Merged</span>
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

    function resetApp() {
        currentFiles = [];
        generatedBlob = null;
        if (dropZoneController) dropZoneController.reset();
        updateProgress(0, "Reading files...");
        if (resultSummary) resultSummary.textContent = '';
        showView(uploadView);
    }
});
