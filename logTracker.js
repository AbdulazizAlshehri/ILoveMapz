// logTracker.js — Renders real activity log with Filter, Export, and Clear History

(function () {
    const LOG_KEY = 'nqos_activity_master_log';
    const PAGE_SIZE = 25;
    let currentPage = 1;
    let allJobs = [];       // all JOB entries from localStorage
    let filteredJobs = [];  // after applying filters

    // ─── Formatters ───────────────────────────────────────────────────────────

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatDuration(ms) {
        if (!ms || ms <= 0) return '—';
        if (ms < 1000) return ms + 'ms';
        return (ms / 1000).toFixed(1) + 's';
    }

    function formatTimestamp(iso) {
        try {
            const d = new Date(iso);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        } catch (e) { return iso || '—'; }
    }

    function renderFileCell(files) {
        if (!files || files.length === 0) return '<div style="color:#95a5a6;font-style:italic;">—</div>';
        return files.map(f => {
            const sizeStr = formatBytes(f.size);
            return `<div class="file-name">${f.name}</div>${sizeStr ? `<div style="color:#95a5a6;font-size:11px;margin-top:2px;">${sizeStr}</div>` : ''}`;
        }).join('');
    }

    function renderRow(entry) {
        const d = entry.details || {};
        const files = d.files || [];
        const inputFiles = files.filter(f => f.type === 'in');
        const outputFiles = files.filter(f => f.type === 'out');

        const status = d.status || '—';
        const statusClass = status === 'Success' ? 'status-success'
            : status === 'Error' ? 'status-error'
                : 'status-info';

        const device = entry.device || {};
        const os = device.os || 'Unknown';
        const browser = device.browser || '';
        const deviceLabel = browser ? `${os} / ${browser}` : os;
        const ip = device.ip || '—';

        return `<tr>
            <td>${formatTimestamp(entry.timestamp)}</td>
            <td><span class="job-type">${entry.action || '—'}</span></td>
            <td>${renderFileCell(inputFiles)}</td>
            <td>${renderFileCell(outputFiles)}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td><span class="duration">${formatDuration(d.duration)}</span></td>
            <td>
                <div style="font-weight:500;">${deviceLabel}</div>
                <div style="color:#95a5a6;font-size:11px;margin-top:2px;">${ip}</div>
            </td>
        </tr>`;
    }

    // ─── Stats ─────────────────────────────────────────────────────────────────

    function computeStats(jobs) {
        const total = jobs.length;
        const success = jobs.filter(e => (e.details || {}).status === 'Success').length;
        const rate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
        const totalBytes = jobs.reduce((sum, e) => sum + ((e.details || {}).bytesProcessed || 0), 0);
        const durations = jobs.filter(e => (e.details || {}).duration > 0).map(e => e.details.duration);
        const avgMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        return { total, success, rate, totalBytes, avgMs };
    }

    function updateStats(s) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
        set('stat-total-jobs', s.total);
        set('stat-success-rate', s.rate + '%');
        set('stat-success-sub', s.success + ' successful');
        const mb = s.totalBytes / (1024 * 1024);
        if (mb >= 1) {
            set('stat-data-processed', `${mb.toFixed(1)}<span style="font-size:16px;font-weight:500;margin-left:2px;">MB</span>`);
        } else {
            set('stat-data-processed', `${(s.totalBytes / 1024).toFixed(0)}<span style="font-size:16px;font-weight:500;margin-left:2px;">KB</span>`);
        }
        set('stat-avg-duration', `${(s.avgMs / 1000).toFixed(1)}<span style="font-size:16px;font-weight:500;margin-left:2px;">s</span>`);
    }

    // ─── Pagination ────────────────────────────────────────────────────────────

    function renderPage(page) {
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;

        const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
        currentPage = Math.max(1, Math.min(page, totalPages));

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageJobs = filteredJobs.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = pageJobs.length > 0
            ? pageJobs.map(renderRow).join('')
            : `<tr><td colspan="7" style="text-align:center;color:#95a5a6;padding:40px;">No matching records found.</td></tr>`;

        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        let container = document.getElementById('pagination-controls');
        if (!container) {
            container = document.createElement('div');
            container.id = 'pagination-controls';
            container.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid #ecf0f1;';
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) tableContainer.appendChild(container);
        }

        if (filteredJobs.length === 0) { container.innerHTML = ''; return; }

        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = Math.min(currentPage * PAGE_SIZE, filteredJobs.length);

        container.innerHTML = `
            <span style="color:#7f8c8d;font-size:13px;margin-right:8px;">${start}–${end} of ${filteredJobs.length}</span>
            <button onclick="window._logGoPage(${currentPage - 1})"
                style="padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:${currentPage <= 1 ? '#f5f5f5' : 'white'};color:${currentPage <= 1 ? '#bbb' : '#2c3e50'};cursor:${currentPage <= 1 ? 'default' : 'pointer'};font-size:13px;"
                ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>
            <span style="font-size:13px;color:#2c3e50;font-weight:600;">Page ${currentPage} / ${totalPages}</span>
            <button onclick="window._logGoPage(${currentPage + 1})"
                style="padding:6px 14px;border:1px solid #ddd;border-radius:6px;background:${currentPage >= totalPages ? '#f5f5f5' : 'white'};color:${currentPage >= totalPages ? '#bbb' : '#2c3e50'};cursor:${currentPage >= totalPages ? 'default' : 'pointer'};font-size:13px;"
                ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>
        `;
    }

    window._logGoPage = function (page) {
        renderPage(page);
        const tc = document.querySelector('.table-container');
        if (tc) tc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ─── Filter ────────────────────────────────────────────────────────────────

    function populateJobTypeDropdown() {
        const sel = document.getElementById('filter-job-type');
        if (!sel) return;
        const types = [...new Set(allJobs.map(j => j.action).filter(Boolean))].sort();
        // Keep "All Types" option, add unique types
        sel.innerHTML = '<option value="">All Types</option>' +
            types.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    function applyFilters() {
        const jobType = (document.getElementById('filter-job-type')?.value || '').trim();
        const status = (document.getElementById('filter-status')?.value || '').trim();

        filteredJobs = allJobs.filter(j => {
            const matchType = !jobType || j.action === jobType;
            const matchStatus = !status || (j.details || {}).status === status;
            return matchType && matchStatus;
        });

        currentPage = 1;
        renderPage(1);
        updateStats(computeStats(filteredJobs));

        // Highlight filter button if active
        const btn = document.getElementById('btn-filter');
        if (btn) {
            const isFiltered = jobType || status;
            btn.style.background = isFiltered ? '#95c11f' : '';
            btn.style.color = isFiltered ? 'white' : '';
            btn.style.borderColor = isFiltered ? '#95c11f' : '';
        }
    }

    function resetFilters() {
        const jobTypeSel = document.getElementById('filter-job-type');
        const statusSel = document.getElementById('filter-status');
        if (jobTypeSel) jobTypeSel.value = '';
        if (statusSel) statusSel.value = '';
        filteredJobs = [...allJobs];
        currentPage = 1;
        renderPage(1);
        updateStats(computeStats(allJobs));

        const btn = document.getElementById('btn-filter');
        if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
    }

    // ─── Export ────────────────────────────────────────────────────────────────

    function exportToCSV() {
        if (filteredJobs.length === 0) {
            alert('No records to export.');
            return;
        }

        const headers = ['Timestamp', 'Job Type', 'Input Files', 'Output Files', 'Status', 'Duration (ms)', 'OS', 'Browser', 'IP'];

        const rows = filteredJobs.map(j => {
            const d = j.details || {};
            const files = d.files || [];
            const inputs = files.filter(f => f.type === 'in').map(f => f.name).join('; ');
            const outputs = files.filter(f => f.type === 'out').map(f => f.name).join('; ');
            const device = j.device || {};
            return [
                formatTimestamp(j.timestamp),
                j.action || '',
                inputs,
                outputs,
                d.status || '',
                d.duration || '',
                device.os || '',
                device.browser || '',
                device.ip || ''
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        a.href = url;
        a.download = `nqos_history_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ─── Clear History ─────────────────────────────────────────────────────────

    function clearHistory() {
        if (!confirm('Are you sure you want to clear all history records? This cannot be undone.')) return;
        localStorage.removeItem(LOG_KEY);
        allJobs = [];
        filteredJobs = [];
        currentPage = 1;
        renderPage(1);
        updateStats({ total: 0, success: 0, rate: '0.0', totalBytes: 0, avgMs: 0 });
        resetFilters();
    }

    // ─── Init ──────────────────────────────────────────────────────────────────

    function bindButtons() {
        // Filter toggle
        const btnFilter = document.getElementById('btn-filter');
        const filterPanel = document.getElementById('filter-panel');
        if (btnFilter && filterPanel) {
            btnFilter.addEventListener('click', () => {
                const isVisible = filterPanel.style.display === 'flex';
                filterPanel.style.display = isVisible ? 'none' : 'flex';
            });
        }

        // Apply / Reset
        document.getElementById('btn-filter-apply')?.addEventListener('click', applyFilters);
        document.getElementById('btn-filter-reset')?.addEventListener('click', resetFilters);

        // Export
        document.getElementById('btn-export')?.addEventListener('click', exportToCSV);

        // Clear History
        document.getElementById('btn-clear-history')?.addEventListener('click', clearHistory);
    }

    function render() {
        const tbody = document.getElementById('history-table-body');
        if (!tbody) return;

        const raw = localStorage.getItem(LOG_KEY);
        const log = raw ? JSON.parse(raw) : [];

        allJobs = log.filter(e => e.type === 'JOB');
        filteredJobs = [...allJobs];

        if (allJobs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#95a5a6;padding:40px;">No jobs recorded yet. Use any tool to start logging.</td></tr>`;
            updateStats({ total: 0, success: 0, rate: '0.0', totalBytes: 0, avgMs: 0 });
            return;
        }

        populateJobTypeDropdown();
        updateStats(computeStats(allJobs));
        renderPage(1);
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindButtons();
        render();
    });
})();
