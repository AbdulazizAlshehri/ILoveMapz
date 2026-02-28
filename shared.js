// ==========================================
// NQoS Toolbox - Global Configuration
// ==========================================
const KEYS = {
    USER: 'ilovemapz_visitor_id',
    SESSION: 'ilovemapz_session_current',
    LOG: 'ilovemapz_activity_master_log' // Single source of truth
};
window.KEYS = KEYS; // Ensure global access

document.addEventListener('DOMContentLoaded', () => {
    initializeSession();
    trackPageVisit();
    setupGlobalListeners();
});


function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// --- 1. Session & Identity ---
async function initializeSession() {
    // Persistent Visitor ID
    let visitorId = localStorage.getItem(KEYS.USER);
    if (!visitorId) {
        visitorId = 'User_' + Math.floor(Math.random() * 100000);
        localStorage.setItem(KEYS.USER, visitorId);
    }

    // Current Session
    let session = JSON.parse(sessionStorage.getItem(KEYS.SESSION) || 'null');
    if (!session || !session.visitorId) {
        session = {
            id: 'SESS_' + Date.now().toString(36),
            visitorId: visitorId,
            startTime: Date.now(),
            device: {
                ip: 'Unknown',
                os: getOS(),
                browser: getBrowser(),
                screen: `${window.screen.width}x${window.screen.height}`
            }
        };
        sessionStorage.setItem(KEYS.SESSION, JSON.stringify(session));
        fetchIP(session);
    }

    // Update UI profile
    const profile = document.querySelector('.profile-pic');
    if (profile) profile.textContent = visitorId.substring(0, 2).toUpperCase();
}

async function fetchIP(session) {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        if (res.ok) {
            const data = await res.json();
            session.device.ip = data.ip;
            sessionStorage.setItem(KEYS.SESSION, JSON.stringify(session));
        }
    } catch (e) { }
}

function getOS() {
    const ua = navigator.userAgent;
    if (ua.includes("Win")) return "Windows";
    if (ua.includes("Mac")) return "MacOS";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iPhone")) return "iOS";
    return "Linux/Other";
}

function getBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edg")) return "Edge";
    return "Other";
}

// --- 2. Unified Logging ---

/**
 * Main Logger Function
 * @param {string} type - 'JOB', 'VISIT', 'ADMIN'
 * @param {string} action - 'ExcelToKMZ', 'Page Load', etc.
 * @param {object} details - { files:[], status:'Success', error:'' }
 */
function logActivity(type, action, details = {}) {
    try {
        // 1. Get Context (Best Effort)
        let session = getCleanSession();

        // Fallbacks if session is dead
        const safeVisitorId = session?.visitorId || localStorage.getItem(window.KEYS.USER) || 'Anonymous';
        const safeSessionId = session?.id || 'SESS_Fallback_' + Date.now();
        const safeDevice = session?.device || { ip: '?', os: 'Unknown', browser: 'Unknown' };

        // 2. Construct Entry
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            visitorId: safeVisitorId,
            sessionId: safeSessionId,
            device: safeDevice,
            type: type,
            action: action,
            details: details
        };

        // 3. Save to Master Log
        const rawLog = localStorage.getItem(window.KEYS.LOG);
        const log = rawLog ? JSON.parse(rawLog) : [];
        log.unshift(entry);

        // Limit to 1000 entries
        if (log.length > 1000) log.pop();

        localStorage.setItem(window.KEYS.LOG, JSON.stringify(log));
        console.log(`[UnifiedLog] Saved ${type}: ${action}`, entry);

        // 4. Visual Feedback (toast only, no blocking alerts)
        if (type === 'JOB') {
            showToast(`✓ Job completed: ${action}`);
        }

    } catch (e) {
        console.error("[UnifiedLog] Save Error", e);
    }
}

// Simple Toast Notification
function showToast(msg) {
    let toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; 
        background: #333; color: #fff; padding: 12px 24px; 
        border-radius: 8px; z-index: 10000; font-family: sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); animation: fadeIn 0.3s;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getCleanSession() {
    try {
        const s = sessionStorage.getItem(window.KEYS.SESSION);
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

function trackPageVisit() {
    if (window.location.pathname.includes('history.html')) return; // Don't log admin view as visit

    // Debounce/Check duplicate visits in short time? No, simplified req wants ALL info.
    logActivity('VISIT', document.title, {
        url: window.location.pathname,
        status: 'Viewed'
    });
}

// --- 3. Job Tracker (Wrapper for Unified Log) ---
/* 
   We keep this abstraction so apps don't need changing, 
   but internally it now writes to the Unified Log.
*/
window.JobTracker = {
    start: (toolName, inputFiles = []) => {
        try {
            console.log(`[JobTracker] Starting ${toolName}`, inputFiles);
            const inputs = Array.from(inputFiles || []).map(f => ({
                name: f?.name || 'Unknown File',
                size: f?.size || 0,
                type: 'in'
            }));

            return {
                tool: toolName,
                inputs: inputs,
                startTime: Date.now()
            };
        } catch (e) {
            console.error("[JobTracker] Start Error", e);
            return { tool: toolName, inputs: [], startTime: Date.now() }; // Fallback
        }
    },

    finish: (jobContext, outputFiles = []) => {
        try {
            console.log(`[JobTracker] Finishing ${jobContext?.tool}`, outputFiles);
            if (!jobContext) return;

            const outputs = Array.from(outputFiles || []).map(f => ({
                name: f?.name || 'Unknown Output',
                size: f?.size || 0,
                type: 'out'
            }));

            const allFiles = [...(jobContext.inputs || []), ...outputs];
            const totalBytes = allFiles.reduce((a, b) => a + (b.size || 0), 0);

            logActivity('JOB', jobContext.tool || 'Unknown Tool', {
                status: 'Success',
                files: allFiles,
                bytesProcessed: totalBytes,
                duration: Date.now() - (jobContext.startTime || Date.now())
            });
        } catch (e) {
            console.error("[JobTracker] Finish Error", e);
        }
    },

    fail: (jobContext, errorMessage) => {
        try {
            console.error(`[JobTracker] Failed ${jobContext?.tool}: ${errorMessage}`);
            if (!jobContext) return;

            logActivity('JOB', jobContext.tool || 'Unknown Tool', {
                status: 'Error',
                files: jobContext.inputs || [],
                message: errorMessage,
                duration: Date.now() - (jobContext.startTime || Date.now())
            });
        } catch (e) {
            console.error("[JobTracker] Fail Error", e);
        }
    }
};

// Legacy support if specific apps call trackFile directly (redirect to log)
window.trackFile = (type, file, status) => {
    // Deprecated but kept for safety. 
    // Ideally apps only use JobTracker.
};
window.logEvent = (cat, action, label) => { }; // legacy stubs

// --- Utils ---
function setupGlobalListeners() {
    // Settings logic removed from shared.js as requested
}

// Keyboard shortcut removed from shared.js (now handled locally in index.html)


// ─── UNIFIED DROP ZONE HELPER ──────────────────────────────────────
/**
 * Sets up a standardized file drop zone.
 * @param {string} zoneId - ID of the .file-drop-zone div
 * @param {string} inputId - ID of the hidden file input
 * @param {function} onFileSelect - Callback(files) when files are chosen/dropped
 * @param {function} onFileRemove - Callback() when file is removed (optional)
 */
function setupUnifiedDropZone(zoneId, inputId, onFileSelect, onFileRemove = null) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    // Handle Click -> Open File Dialog
    zone.addEventListener('click', (e) => {
        // Don't trigger if clicking the remove button or inside file info
        if (e.target.closest('.btn-remove-file') || e.target.closest('.file-info')) return;

        input.value = '';
        input.click();
    });

    // Pass click from custom button if it exists separately
    const btn = zone.querySelector('.btn-select-file');
    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent double trigger
            input.value = '';
            input.click();
        });
    }

    // Handle File Input Change
    input.addEventListener('change', () => {
        if (input.files && input.files.length > 0) {
            handleFiles(input.files);
        }
    });

    // Drag & Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        zone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    zone.addEventListener('dragenter', () => zone.classList.add('drag-over'));
    zone.addEventListener('dragover', () => zone.classList.add('drag-over'));

    zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) {
            zone.classList.remove('drag-over');
        }
    });

    zone.addEventListener('drop', (e) => {
        zone.classList.remove('drag-over');
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleFiles(files);
        }
    });

    function handleFiles(files) {
        // Visual feedback
        zone.classList.add('has-file');

        // Update file name display if present
        const fileInfo = zone.querySelector('.file-info');
        if (fileInfo) {
            const names = Array.from(files).map(f => f.name).join(', ');

            // Add Remove Button
            fileInfo.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    <i class="fa-solid fa-file-circle-check" style="color:#2ecc71; margin-right:8px;"></i> 
                    <span class="file-name" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${names}</span>
                    <i class="fa-solid fa-xmark btn-remove-file" title="Remove file" style="cursor:pointer; color:#95c11f; padding:4px; border-radius:50%; transition:background 0.2s;"></i>
                </div>
            `;
            fileInfo.style.display = 'block'; // Block to contain flex

            // Wire up Remove Button
            const btnRemove = fileInfo.querySelector('.btn-remove-file');
            if (btnRemove) {
                btnRemove.addEventListener('mouseover', () => btnRemove.style.background = '#ffebeb');
                btnRemove.addEventListener('mouseout', () => btnRemove.style.background = 'transparent');
                btnRemove.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearFiles();
                });
            }

            // Hide initial prompts to clean up UI
            const initialElements = zone.querySelectorAll('.drop-icon, .drop-title, .drop-subtitle, .btn-select-file');
            initialElements.forEach(el => el.style.opacity = '0.2');
            initialElements.forEach(el => el.style.pointerEvents = 'none'); // Disable clicks on hidden elements
        }

        // Trigger callback
        if (onFileSelect) onFileSelect(files);
    }

    function clearFiles() {
        // Reset Input
        input.value = '';

        // Visual Reset
        zone.classList.remove('has-file');

        // Hide info
        const fileInfo = zone.querySelector('.file-info');
        if (fileInfo) {
            fileInfo.style.display = 'none';
            fileInfo.innerHTML = '';
        }

        // Restore prompts
        const initialElements = zone.querySelectorAll('.drop-icon, .drop-title, .drop-subtitle, .btn-select-file');
        initialElements.forEach(el => {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
        });

        // Trigger remove callback
        if (onFileRemove) onFileRemove();
    }

    return {
        reset: clearFiles
    };
}
