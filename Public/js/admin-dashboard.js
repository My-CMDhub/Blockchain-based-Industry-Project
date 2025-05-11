// All admin dashboard JavaScript moved from admin-dashboard.html
// (No logic changes, just modularization)

    // --- Next-Level Admin Dashboard State & Logic ---
    const dashboardState = {
        type: 'merchant', // 'merchant' or 'user'
        status: 'all', // 'all', 'pending', 'confirmed', 'wrong', 'release'
        search: '',
        activities: { merchant: [], user: [] },
        raw: []
    };

    // API Base URL - Set correctly based on server port
    const API_BASE_URL = 'http://localhost:3000';

    // Utility: Show toast notifications
    function showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toastContainer.appendChild(toastEl);
        
        // Initialize and show toast
        const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 5000 });
        toast.show();
        
        // Remove toast after it's hidden
        toastEl.addEventListener('hidden.bs.toast', function() {
            toastEl.remove();
        });
    }

    // Utility: Fetch JSON file (local or server)
    async function fetchJSON(path) {
        // Use absolute URL for API requests, relative for local JSON files
        const isApiRequest = path.startsWith('/api/');
        const url = isApiRequest ? `${API_BASE_URL}${path}` : path;
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
            return await res.json();
        } catch (err) {
            showToast(`Error loading ${path}: ${err.message}`, 'danger');
            return null;
        }
    }

    // --- Database Management Functions ---
    // Make all these available globally by adding them to window
    
    // Load and display database health status
    async function loadDatabaseHealth() {
        const healthStatusEl = document.getElementById('database-health-status');
        if (!healthStatusEl) return;
        
        healthStatusEl.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Checking database health...</p>
            </div>
        `;
        
        try {
            const data = await fetchJSON('/api/admin/database-status?force=true');
            if (!data || !data.success) {
                throw new Error(data?.error || 'Failed to check database health');
            }
            
            renderDatabaseHealth(data.status);
        } catch (error) {
            healthStatusEl.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    Error checking database health: ${error.message}
                </div>
            `;
        }
    }
    
    // Render the database health status UI
    function renderDatabaseHealth(status) {
        const healthStatusEl = document.getElementById('database-health-status');
        if (!healthStatusEl) return;
        
        const isHealthy = status.isHealthy;
        const issues = status.issues || [];
        const lastChecked = status.lastChecked ? new Date(status.lastChecked).toLocaleString() : 'Never';
        
        let statusHtml = '';
        
        if (isHealthy) {
            statusHtml = `
                <div class="text-center mb-4">
                    <div class="d-inline-block p-3 bg-success bg-opacity-10 rounded-circle mb-3">
                        <i class="fas fa-check-circle text-success fa-3x"></i>
                    </div>
                    <h5 class="mb-1">Database is healthy</h5>
                    <p class="text-secondary">All files are intact and properly formatted</p>
                </div>
                <div class="small text-muted text-center">Last checked: ${lastChecked}</div>
            `;
        } else {
            const corruptedFiles = status.corruptedFiles || [];
            const missingFiles = status.missingFiles || [];
            
            let issuesList = '';
            
            if (corruptedFiles.length > 0) {
                issuesList += `
                    <div class="alert alert-danger mb-3">
                        <h6><i class="fas fa-file-alt me-2"></i>Corrupted Files:</h6>
                        <ul class="mb-0">
                            ${corruptedFiles.map(file => `<li>${escapeHtml(file)}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            if (missingFiles.length > 0) {
                issuesList += `
                    <div class="alert alert-warning mb-3">
                        <h6><i class="fas fa-file-excel me-2"></i>Missing Files:</h6>
                        <ul class="mb-0">
                            ${missingFiles.map(file => `<li>${escapeHtml(file)}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            if (issues.length > 0) {
                issuesList += `
                    <div class="alert alert-info mb-3">
                        <h6><i class="fas fa-info-circle me-2"></i>Other Issues:</h6>
                        <ul class="mb-0">
                            ${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            
            statusHtml = `
                <div class="text-center mb-4">
                    <div class="d-inline-block p-3 bg-danger bg-opacity-10 rounded-circle mb-3">
                        <i class="fas fa-exclamation-triangle text-danger fa-3x"></i>
                    </div>
                    <h5 class="mb-1">Database issues detected</h5>
                    <p class="text-secondary">Please review the issues below</p>
                </div>
                ${issuesList}
                <div class="small text-muted text-center">Last checked: ${lastChecked}</div>
                <div class="alert alert-warning mt-3">
                    <i class="fas fa-info-circle me-2"></i>
                    Use the recovery options to restore from a backup.
                </div>
            `;
        }
        
        healthStatusEl.innerHTML = statusHtml;
    }
    
    // Create a new database backup
    async function createBackup() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/create-backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to create backup');
            }
            
            showToast('Backup created successfully!', 'success');
            loadDatabaseBackups();
            
        } catch (error) {
            showToast(`Error creating backup: ${error.message}`, 'danger');
        }
    }
    
    // Load and display available database backups
    async function loadDatabaseBackups() {
        const tableBody = document.getElementById('backups-table-body');
        const backupCountEl = document.getElementById('backup-count');
        
        if (!tableBody) return;
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    Loading backups...
                </td>
            </tr>
        `;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/backups`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load backups');
            }
            
            renderBackupsTable(data.backups || []);
            
            if (backupCountEl) {
                const count = data.backups ? data.backups.length : 0;
                backupCountEl.textContent = `${count} backup${count !== 1 ? 's' : ''} available`;
            }
            
            const lastBackupTimeEl = document.getElementById('last-backup-time');
            if (lastBackupTimeEl && data.backups && data.backups.length > 0) {
                // Sort by creation date (newest first)
                const sortedBackups = [...data.backups].sort((a, b) => 
                    new Date(b.created) - new Date(a.created)
                );
                
                const newestBackup = sortedBackups[0];
                lastBackupTimeEl.textContent = `Last backup: ${new Date(newestBackup.created).toLocaleString()}`;
            }
            
        } catch (error) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger py-4">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Error loading backups: ${error.message}
                    </td>
                </tr>
            `;
            
            if (backupCountEl) {
                backupCountEl.textContent = `0 backups available`;
            }
        }
    }
    
    // Render the backups table
    function renderBackupsTable(backups) {
        const tableBody = document.getElementById('backups-table-body');
        if (!tableBody) return;
        
        if (!backups || backups.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <i class="fas fa-folder-open text-muted me-2"></i>
                        No backups available
                    </td>
                </tr>
            `;
            return;
        }
        
        // Sort by creation date (newest first)
        const sortedBackups = [...backups].sort((a, b) => 
            new Date(b.created) - new Date(a.created)
        );
        
        let tableRows = '';
        
        for (const backup of sortedBackups) {
            const created = new Date(backup.created).toLocaleString();
            const size = formatFileSize(backup.size);
            const filename = backup.filename;
            const type = backup.type || 'Unknown';
            
            let statusBadge = '';
            if (backup.verified) {
                statusBadge = `<span class="badge bg-success">Verified</span>`;
            } else if (backup.verified === false) {
                statusBadge = `<span class="badge bg-danger">Invalid</span>`;
            } else {
                statusBadge = `<span class="badge bg-secondary">Unverified</span>`;
            }
            
            tableRows += `
                <tr id="backup-row-${escapeHtml(filename)}" data-backup-file="${escapeHtml(filename)}">
                    <td>
                        <div class="d-flex align-items-center">
                            <i class="fas fa-file-archive text-primary me-2"></i>
                            <span>${escapeHtml(filename)}</span>
                        </div>
                    </td>
                    <td>${escapeHtml(type)}</td>
                    <td>${created}</td>
                    <td>${size}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="downloadBackup('${escapeHtml(filename)}')">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn btn-outline-success" onclick="verifyBackup('${escapeHtml(filename)}')">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn btn-outline-warning" onclick="showRestoreConfirmation('${escapeHtml(filename)}')">
                                <i class="fas fa-undo"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }
        
        tableBody.innerHTML = tableRows;
    }
    
    // Filter backups by search term
    function filterBackups(searchTerm) {
        const rows = document.querySelectorAll('#backups-table-body tr');
        const term = searchTerm.trim().toLowerCase();
        
        rows.forEach(row => {
            const filename = row.getAttribute('data-backup-file') || '';
            if (!term || filename.toLowerCase().includes(term)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }
    
    // Verify a specific backup file
    async function verifyBackup(filename) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/verify-backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to verify backup');
            }
            
            // Update the backup status in the table
            const row = document.getElementById(`backup-row-${filename}`);
            if (row) {
                const statusCell = row.querySelector('td:nth-child(5)');
                if (statusCell) {
                    statusCell.innerHTML = data.isValid 
                        ? `<span class="badge bg-success">Verified</span>`
                        : `<span class="badge bg-danger">Invalid</span>`;
                }
            }
            
            showToast(
                data.isValid 
                    ? `Backup "${filename}" verified successfully!` 
                    : `Backup "${filename}" is invalid!`,
                data.isValid ? 'success' : 'danger'
            );
            
        } catch (error) {
            showToast(`Error verifying backup: ${error.message}`, 'danger');
        }
    }
    
    // Download a backup file
    function downloadBackup(filename) {
        window.location.href = `${API_BASE_URL}/api/admin/download-backup/${filename}`;
    }
    
    // Show the upload backup modal
    function showUploadBackupModal() {
        const modal = new bootstrap.Modal(document.getElementById('uploadBackupModal'));
        modal.show();
        
        // Add listener for form submission
        const submitBtn = document.getElementById('btn-submit-upload');
        if (submitBtn) {
            submitBtn.onclick = uploadBackup;
        }
    }
    
    // Upload a backup file
    async function uploadBackup() {
        const fileInput = document.getElementById('backupFile');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            showToast('Please select a file to upload', 'warning');
            return;
        }
        
        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('backup', file);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/upload-backup`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to upload backup');
            }
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('uploadBackupModal'));
            if (modal) modal.hide();
            
            // Reset the file input
            fileInput.value = '';
            
            showToast('Backup uploaded successfully!', 'success');
            loadDatabaseBackups();
            
        } catch (error) {
            showToast(`Error uploading backup: ${error.message}`, 'danger');
        }
    }
    
    // Automatically restore from the most recent healthy backup
    async function autoRecover() {
        try {
            // First, get a list of backups
            const backupsResponse = await fetch(`${API_BASE_URL}/api/admin/backups`);
            if (!backupsResponse.ok) {
                throw new Error(`Failed to fetch backups: ${backupsResponse.status}`);
            }
            
            const backupsData = await backupsResponse.json();
            if (!backupsData.success || !backupsData.backups || backupsData.backups.length === 0) {
                showToast('No backups available for auto-recovery', 'warning');
                return;
            }
            
            // Sort backups by creation date (newest first)
            const sortedBackups = [...backupsData.backups].sort((a, b) => 
                new Date(b.created) - new Date(a.created)
            );
            
            // Use the most recent backup
            const latestBackup = sortedBackups[0];
            
            // Show confirmation
            if (confirm(`Do you want to automatically restore from the latest backup: ${latestBackup.filename}?`)) {
                // Use the restore-backup endpoint
                const restoreResponse = await fetch(`${API_BASE_URL}/api/admin/restore-backup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        filename: latestBackup.filename,
                        force: false 
                    })
                });
                
                const restoreData = await restoreResponse.json();
                
                if (!restoreData.success) {
                    throw new Error(restoreData.error || 'Restoration failed');
                }
                
                showToast(`Auto-recovery successful! Restored from "${latestBackup.filename}"`, 'success');
                
                // Refresh both health status and backups list
                loadDatabaseHealth();
                loadDatabaseBackups();
            }
            
        } catch (error) {
            showToast(`Auto-recovery error: ${error.message}`, 'danger');
        }
    }
    
    // Show the manual recovery interface
    function manualRecover() {
        // Just reload the backups list to ensure it's up to date
        loadDatabaseBackups();
        
        // Scroll to the backups section
        const backupsTable = document.querySelector('.card.shadow-sm.mb-4');
        if (backupsTable) {
            backupsTable.scrollIntoView({ behavior: 'smooth' });
        }
        
        showToast('Select a backup to restore from the list below', 'info');
    }
    
    // Show the restore confirmation modal
    function showRestoreConfirmation(filename) {
        const filenameEl = document.getElementById('restore-filename');
        if (filenameEl) {
            filenameEl.textContent = filename;
        }
        
        // Reset the force restore checkbox
        const forceCheckbox = document.getElementById('force-restore-check');
        if (forceCheckbox) {
            forceCheckbox.checked = false;
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('recoveryConfirmModal'));
        modal.show();
        
        // Store the filename on the confirm button
        const confirmBtn = document.getElementById('btn-confirm-restore');
        if (confirmBtn) {
            confirmBtn.setAttribute('data-backup-file', filename);
        }
    }
    
    // Confirm and execute database restoration
    async function confirmRestore() {
        const confirmBtn = document.getElementById('btn-confirm-restore');
        const filename = confirmBtn.getAttribute('data-backup-file');
        const forceRestore = document.getElementById('force-restore-check').checked;
        
        if (!filename) {
            showToast('No backup file selected', 'danger');
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/restore-backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, force: forceRestore })
            });
            
            const data = await response.json();
            
            // Close the modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('recoveryConfirmModal'));
            if (modal) modal.hide();
            
            if (!data.success) {
                throw new Error(data.error || 'Restoration failed');
            }
            
            showToast('Database restored successfully!', 'success');
            
            // Refresh both health status and backups list
            loadDatabaseHealth();
            loadDatabaseBackups();
            
        } catch (error) {
            showToast(`Restoration error: ${error.message}`, 'danger');
        }
    }
    
    // Clean up old backups
    async function cleanupBackups() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/cleanup-backups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Cleanup failed');
            }
            
            const count = data.removedCount || 0;
            showToast(
                count > 0 
                    ? `Removed ${count} old backup${count !== 1 ? 's' : ''}` 
                    : 'No old backups needed to be removed',
                'success'
            );
            
            // Refresh the backups list
            loadDatabaseBackups();
            
        } catch (error) {
            showToast(`Cleanup error: ${error.message}`, 'danger');
        }
    }
    
    // Verify all backup files
    async function verifyAllBackups() {
        try {
            // Get the list of backups
            const backupsResponse = await fetch(`${API_BASE_URL}/api/admin/backups`);
            if (!backupsResponse.ok) {
                throw new Error(`Failed to fetch backups: ${backupsResponse.status}`);
            }
            
            const backupsData = await backupsResponse.json();
            if (!backupsData.success || !backupsData.backups || backupsData.backups.length === 0) {
                showToast('No backups available to verify', 'warning');
                return;
            }
            
            // Show a loading message
            showToast('Verifying all backups, please wait...', 'info');
            
            // Initialize counters
            let validCount = 0;
            let invalidCount = 0;
            
            // Verify each backup one by one
            for (const backup of backupsData.backups) {
                try {
                    const verifyResponse = await fetch(`${API_BASE_URL}/api/admin/verify-backup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: backup.filename })
                    });
                    
                    const verifyData = await verifyResponse.json();
                    
                    if (verifyData.success && verifyData.isValid) {
                        validCount++;
                    } else {
                        invalidCount++;
                    }
                } catch (error) {
                    console.error(`Error verifying backup ${backup.filename}:`, error);
                    invalidCount++;
                }
            }
            
            // Display results
            showToast(
                `Verified ${validCount + invalidCount} backup${(validCount + invalidCount) !== 1 ? 's' : ''}: ` +
                `${validCount} valid, ${invalidCount} invalid`,
                invalidCount > 0 ? 'warning' : 'success'
            );
            
            // Refresh the backups list to show updated verification status
            loadDatabaseBackups();
            
        } catch (error) {
            showToast(`Verification error: ${error.message}`, 'danger');
        }
    }
    
    // Reinitialize the recovery system
    async function reinitializeRecovery() {
        try {
            // Simulate the reinitialization by performing multiple actions:
            
            // 1. Check database health
            const healthResponse = await fetch(`${API_BASE_URL}/api/admin/database-status?force=true`);
            const healthData = await healthResponse.json();
            
            if (!healthData.success) {
                throw new Error('Failed to check database health');
            }
            
            // 2. Create a new backup
            const backupResponse = await fetch(`${API_BASE_URL}/api/admin/create-backup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const backupData = await backupResponse.json();
            
            if (!backupData.success) {
                throw new Error('Failed to create backup');
            }
            
            // 3. Refresh the backup list
            await loadDatabaseBackups();
            
            // Show success message
            showToast('Recovery system reinitialized successfully!', 'success');
            
            // Refresh health status
            loadDatabaseHealth();
            
        } catch (error) {
            showToast(`Reinitialization error: ${error.message}`, 'danger');
        }
    }
    
    // Format file size in human-readable format
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Escape HTML special characters
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Load admin dashboard
    async function loadAdminDashboard() {
        console.log('Loading admin dashboard');
        
        // Set up button click handlers for merchant/user toggle
        document.getElementById('toggle-merchant').addEventListener('click', () => {
            dashboardState.type = 'merchant';
            document.getElementById('toggle-merchant').classList.add('active');
            document.getElementById('toggle-user').classList.remove('active');
            renderActivities();
        });
        
        document.getElementById('toggle-user').addEventListener('click', () => {
            dashboardState.type = 'user';
            document.getElementById('toggle-user').classList.add('active');
            document.getElementById('toggle-merchant').classList.remove('active');
            renderActivities();
        });
        
        // Set up filter buttons
        document.querySelectorAll('.filter-group button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.filter-group button').forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                dashboardState.status = button.dataset.status;
                renderActivities();
            });
        });
        
        // Set up tab change handlers
        document.getElementById('activities-tab').addEventListener('shown.bs.tab', () => {
            renderActivities();
        });
        
        document.getElementById('hdwallet-tab').addEventListener('shown.bs.tab', () => {
            loadHdWalletInfo();
        });
        
        // Initial data load
        await Promise.all([
            loadMerchantStats(),
            loadUserStats()
        ]);
        
        // Render initial view
        renderActivities();
    }

    // Load merchant statistics
    async function loadMerchantStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/statistics?view=merchant`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            
            const data = await response.json();
            if (data && data.stats) {
                dashboardState.activities.merchant = data.stats;
                
                // Load actual activities
                const txResponse = await fetch(`${API_BASE_URL}/api/merchant-transactions`);
                if (txResponse.ok) {
                    const txData = await txResponse.json();
                    if (txData && txData.transactions) {
                        // Store merchant transactions
                        const merchantActivities = txData.transactions.map(tx => ({
                            ...tx,
                            type: 'merchant',
                            // Ensure all necessary properties exist
                            address: tx.address || tx.from || 'Unknown',
                            status: tx.status === true ? 'confirmed' : (tx.status === false ? 'failed' : tx.status || 'pending'),
                            cryptoType: tx.cryptoType || 'ETH',
                            orderId: tx.txId || tx.orderId || tx.txHash || '-',
                            amount: tx.amount || '0',
                            createdAt: tx.timestamp || tx.createdAt || new Date().toISOString()
                        }));
                        
                        // Store the merchant transactions in dashboardState.raw
                        const existingUserActivities = dashboardState.raw.filter(a => a.type === 'user');
                        dashboardState.raw = [...merchantActivities, ...existingUserActivities];
                        console.log('Added merchant activities:', merchantActivities.length);
                    }
                }
                
                return data.stats;
            }
        } catch (error) {
            console.error('Error loading merchant stats:', error);
            showToast(`Failed to load merchant statistics: ${error.message}`, 'danger');
        }
        return null;
    }

    // Load user statistics
    async function loadUserStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/statistics?view=user`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            
            const data = await response.json();
            if (data && data.stats) {
                dashboardState.activities.user = data.stats;
                
                // Store current addresses to detect new ones
                const existingAddresses = dashboardState.raw
                    .filter(a => a.type === 'user')
                    .map(a => a.address);
                
                // Load actual user addresses - this is key for displaying user activities
                console.log('Fetching wallet addresses from /api/addresses');
                const keysResponse = await fetch(`${API_BASE_URL}/api/addresses`);
                if (keysResponse.ok) {
                    const keysData = await keysResponse.json();
                    if (keysData.success && keysData.addresses) {
                        // Transform addresses to match dashboard state format
                        const userActivities = keysData.addresses.map(item => ({
                            address: item.address,
                            status: item.data.status || (item.isExpired ? 'expired' : (item.isAbandoned ? 'abandoned' : 'pending')),
                            timestamp: item.data.createdAt || item.createdAt,
                            amount: item.data.ethAmount || '0',
                            expectedAmount: item.data.expectedAmount || '0',
                            expiresAt: item.data.expiresAt || item.expiresAt,
                            timeLeft: item.data.expiresAt ? getTimeLeftString(item.data.expiresAt) : null,
                            type: 'user',
                            orderId: item.data.orderId || 'Unknown',
                            // Mark addresses as new if they weren't in the previous list
                            isNew: !existingAddresses.includes(item.address),
                            // Add any wrong payment details if available
                            isWrongPayment: item.data.isWrongPayment || item.data.wrongPayment || false,
                            wrongReason: item.data.wrongReason || '',
                            amountVerified: item.data.amountVerified,
                            cryptoType: item.data.cryptoType || 'ETH',
                            fiatAmount: item.data.fiatAmount,
                            fiatCurrency: item.data.fiatCurrency
                        }));
                        
                        // Remove any existing user activities before adding new ones
                        dashboardState.raw = dashboardState.raw.filter(a => a.type !== 'user');
                        
                        // Add user activities to the raw data
                        dashboardState.raw = [...dashboardState.raw, ...userActivities];
                        console.log('Added user activities:', userActivities.length);
                        
                        // Start timer for pending addresses
                        startAddressTimers();
                        
                        // Highlight new addresses after rendering
                        setTimeout(highlightNewAddresses, 200);
                    }
                } else {
                    console.error('Failed to fetch wallet addresses:', keysResponse.status);
                }
                
                renderActivities();
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
            showToast('Error loading user statistics', 'danger');
        }
    }
    
    // Highlight new addresses in the table
    function highlightNewAddresses() {
        const newAddresses = dashboardState.raw
            .filter(a => a.type === 'user' && a.isNew)
            .map(a => a.address);
            
        if (newAddresses.length === 0) return;
        
        // Find rows with new addresses and highlight them
        const rows = document.querySelectorAll('#activities-table-body tr');
        rows.forEach(row => {
            const rowText = row.textContent;
            for (const addr of newAddresses) {
                if (rowText.includes(addr.substring(0, 10))) {
                    row.classList.add('highlight-new');
                    break;
                }
            }
        });
    }

    // Calculate and format time left until expiration
    function getTimeLeftString(expiryDateStr) {
        const now = new Date();
        const expiryDate = new Date(expiryDateStr);
        const diff = expiryDate - now;
        
        if (diff <= 0) {
            return '<span class="text-danger">Expired</span>';
        }
        
        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Start timers for updating pending addresses' time left
    function startAddressTimers() {
        // Clear any existing timer
        if (window.addressTimerInterval) {
            clearInterval(window.addressTimerInterval);
        }
        
        // Update timers every second
        window.addressTimerInterval = setInterval(() => {
            const pendingAddresses = dashboardState.raw.filter(a => 
                a.type === 'user' && 
                a.status === 'pending' && 
                !a.isExpired && 
                a.expiresAt
            );
            
            if (pendingAddresses.length === 0) {
                // No pending addresses, clear interval
                clearInterval(window.addressTimerInterval);
                window.addressTimerInterval = null;
                return;
            }
            
            // Update time left for each pending address
            pendingAddresses.forEach(addr => {
                addr.timeLeft = getTimeLeftString(addr.expiresAt);
                
                // Check if now expired
                const now = new Date();
                const expiryDate = new Date(addr.expiresAt);
                if (expiryDate <= now) {
                    addr.isExpired = true;
                    addr.status = 'expired';
                }
            });
            
            // Re-render activities if we're on the user tab
            if (dashboardState.type === 'user' && 
                document.getElementById('activities-tab').classList.contains('active')) {
                renderActivities();
            }
        }, 1000);
    }

    // Render activities based on current state
    function renderActivities() {
        console.log('Rendering activities', dashboardState);
        
        const type = dashboardState.type;
        const activitiesContainer = document.getElementById('admin-dashboard-content');
        if (!activitiesContainer) return;
        
        // Get activities for the selected type (merchant or user)
        const activities = dashboardState.raw.filter(a => a.type === type);
        console.log(`Filtered ${activities.length} ${type} activities from ${dashboardState.raw.length} total activities`);
        
        if (!activities || activities.length === 0) {
            activitiesContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    No ${type} activities found.
                </div>
            `;
            return;
        }
        
        // Count by status
        const total = activities.length;
        const pending = activities.filter(a => a.status === 'pending').length;
        const confirmed = activities.filter(a => a.status === 'confirmed' || a.status === 'verified' || a.status === true).length;
        const wrong = activities.filter(a => a.isWrongPayment || a.status === 'wrong').length;
        const expired = activities.filter(a => a.isExpired).length;
        const released = activities.filter(a => a.status === 'release' || a.type === 'release').length;
        
        // Create summary cards
        let summaryHTML = `
        <div class="row mb-4">
            <div class="col-md-12">
                <h5 class="mb-3">${type.charAt(0).toUpperCase() + type.slice(1)} Activities Summary</h5>
            </div>
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body p-3">
                        <div class="d-flex align-items-center">
                            <div class="icon-box bg-primary bg-opacity-10 text-primary me-3">
                                <i class="fas fa-list-alt"></i>
                            </div>
                            <div>
                                <div class="small text-muted">Total Activities</div>
                                <div class="fs-4 fw-bold">${total}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body p-3">
                        <div class="d-flex align-items-center">
                            <div class="icon-box bg-warning bg-opacity-10 text-warning me-3">
                                <i class="fas fa-hourglass-half"></i>
                            </div>
                            <div>
                                <div class="small text-muted">Pending</div>
                                <div class="fs-4 fw-bold">${pending}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body p-3">
                        <div class="d-flex align-items-center">
                            <div class="icon-box bg-success bg-opacity-10 text-success me-3">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div>
                                <div class="small text-muted">Confirmed</div>
                                <div class="fs-4 fw-bold">${confirmed}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-body p-3">
                        <div class="d-flex align-items-center">
                            <div class="icon-box bg-danger bg-opacity-10 text-danger me-3">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div>
                                <div class="small text-muted">Wrong Payments</div>
                                <div class="fs-4 fw-bold">${wrong}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        
        // Add search and filter toolbar
        summaryHTML += `
        <div class="row mb-3 align-items-center">
            <div class="col-md-6 mb-2 mb-md-0">
                <div class="input-group">
                    <input type="text" id="activity-search" class="form-control" placeholder="Search activities...">
                    <button class="btn btn-outline-secondary" type="button" id="btn-search-activities">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
            </div>
            <div class="col-md-6 text-md-end">
                <div class="btn-group">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="showAddressesFilter()">
                        <i class="fas fa-filter me-1"></i>Advanced Filter
                    </button>
                    ${type === 'user' ? `
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="cleanupExpiredAddresses()">
                        <i class="fas fa-trash-alt me-1"></i>Clean Up Expired
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning" onclick="cleanupAbandonedAddresses()">
                        <i class="fas fa-broom me-1"></i>Clean Up Abandoned
                    </button>
                    ` : ''}
                </div>
            </div>
        </div>`;
        
        // Create the activities table
        summaryHTML += `
        <div class="table-responsive">
            <table class="table table-hover border">
                <thead class="table-light">
                    <tr>
                        <th scope="col">${type === 'merchant' ? 'Transaction ID' : 'Address'}</th>
                        <th scope="col">Status</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Type</th>
                        <th scope="col">Date</th>
                        <th scope="col">Actions</th>
                    </tr>
                </thead>
                <tbody id="activities-table-body">`;
                
        // Sort activities by date (newest first)
        const sortedActivities = [...activities].sort((a, b) => {
            const dateA = new Date(a.timestamp || a.createdAt || 0);
            const dateB = new Date(b.timestamp || b.createdAt || 0);
            return dateB - dateA;
        });
        
        // Generate table rows
        for (const activity of sortedActivities) {
            // Get status badge
            const statusDisplay = typeof activity.status === 'boolean' 
                ? (activity.status ? 'confirmed' : 'failed') 
                : activity.status;
            const statusBadge = getStatusBadge(statusDisplay);
            
            // Determine display address
            const displayId = activity.type === 'merchant' 
                ? (activity.txId || activity.txHash || (activity.address ? activity.address.substr(0, 10) + '...' : 'Unknown'))
                : (activity.address ? activity.address.substr(0, 10) + '...' : 'Unknown');
                
            // Determine if we have an Etherscan-linkable address
            const etherscanAddress = activity.type === 'merchant' ? activity.from || activity.address : activity.address;
            const etherscanTxHash = activity.txHash;
            
            // Create address cell with Etherscan link if available
            const addressCell = etherscanAddress 
                ? `<td>
                    <div class="d-flex align-items-center">
                        <code class="transaction-id">${displayId}</code>
                        ${etherscanAddress ? `
                            <a href="https://sepolia.etherscan.io/address/${etherscanAddress}" 
                                target="_blank" 
                                class="ms-2 tx-badge" 
                                title="View address on Etherscan"
                                onclick="event.stopPropagation();">
                                <i class="fas fa-external-link-alt"></i>
                            </a>` : ''}
                        ${etherscanTxHash ? `
                            <a href="https://sepolia.etherscan.io/tx/${etherscanTxHash}" 
                                target="_blank" 
                                class="ms-1 tx-badge" 
                                title="View transaction on Etherscan"
                                onclick="event.stopPropagation();">
                                <i class="fas fa-exchange-alt"></i>
                            </a>` : ''}
                    </div>
                </td>`
                : `<td><code class="transaction-id">${displayId}</code></td>`;
                
            // Determine amount display
            const amountText = activity.amount || '0';
            const crypto = activity.cryptoType || 'ETH';
            
            // Add transaction badge to amount if it's a confirmed or wrong payment
            let amountDisplay = `${amountText} ${crypto}`;
            if (activity.txHash && (statusDisplay === 'confirmed' || statusDisplay === 'wrong' || activity.isWrongPayment)) {
                const txHashShort = `${activity.txHash.substring(0, 6)}...${activity.txHash.substring(activity.txHash.length - 4)}`;
                amountDisplay += `
                    <a href="https://sepolia.etherscan.io/tx/${activity.txHash}" 
                       target="_blank" 
                       class="tx-badge ms-1" 
                       title="View transaction on Etherscan"
                       onclick="event.stopPropagation();">
                       <i class="fas fa-exchange-alt me-1"></i>${txHashShort}
                    </a>`;
            }
            
            // Determine activity subtype
            let activityType = activity.type;
            if (activity.type === 'merchant') {
                if (activity.from && activity.to) activityType = 'release';
                else if (activity.status === 'release') activityType = 'release';
                else activityType = 'payment';
            }
            
            // Format date with expiration timer for pending user addresses
            let dateDisplay = formatDate(activity.timestamp || activity.createdAt);
            if (activity.type === 'user' && activity.status === 'pending' && activity.timeLeft) {
                dateDisplay = `
                    <div>Created: ${formatDate(activity.createdAt)}</div>
                    <div class="mt-1 text-${activity.isExpired ? 'danger' : 'warning'}">
                        <strong>Expires: ${activity.timeLeft}</strong>
                    </div>`;
            } else if (activity.type === 'user' && activity.expiresAt) {
                const isExpired = new Date(activity.expiresAt) < new Date();
                dateDisplay = `
                    <div>Created: ${formatDate(activity.createdAt)}</div>
                    <div class="mt-1 text-${isExpired ? 'danger' : 'muted'}">
                        <small>${isExpired ? 'Expired' : 'Expires'}: ${formatDate(activity.expiresAt)}</small>
                    </div>`;
            }
            
            // Action buttons
            const clickKey = activity.address || activity.txHash;
            let actions = `
                <button class="btn btn-sm btn-outline-info me-1" onclick="event.stopPropagation(); showActivityDetails('${clickKey}')">
                    <i class="fas fa-eye"></i>
                </button>`;
                
            if (activity.type === 'user') {
                actions += `
                <button class="btn btn-sm btn-outline-danger me-1" onclick="event.stopPropagation(); if(confirm('Are you sure you want to delete address ${activity.address.substring(0, 8)}...?')) deleteAddress('${activity.address}')">
                    <i class="fas fa-trash"></i>
                </button>`;
            }
            
            if (activity.txHash) {
                actions += `
                <a href="https://sepolia.etherscan.io/tx/${activity.txHash}" target="_blank" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-external-link-alt"></i>
                </a>`;
            }
            
            // Create row HTML with improved click handling
            summaryHTML += `
            <tr class="cursor-pointer" onclick="showActivityDetails('${clickKey}')">
                ${addressCell}
                <td>${statusBadge}</td>
                <td>${amountDisplay}</td>
                <td>${activityType}</td>
                <td>${dateDisplay}</td>
                <td class="text-center">
                    <div class="d-flex justify-content-center">
                        ${actions}
                    </div>
                </td>
            </tr>`;
        }
        
        // Close the table and add it to the page
        summaryHTML += `
                </tbody>
            </table>
        </div>`;
        
        activitiesContainer.innerHTML = summaryHTML;
        
        // Set up search functionality
        const searchInput = document.getElementById('activity-search');
        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    const searchTerm = searchInput.value.toLowerCase();
                    const rows = document.querySelectorAll('#activities-table-body tr');
                    
                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        if (text.includes(searchTerm)) {
                            row.style.display = '';
                        } else {
                            row.style.display = 'none';
                        }
                    });
                }
            });
            
            const searchButton = document.getElementById('btn-search-activities');
            if (searchButton) {
                searchButton.addEventListener('click', () => {
                    const searchTerm = searchInput.value.toLowerCase();
                    const rows = document.querySelectorAll('#activities-table-body tr');
                    
                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        if (text.includes(searchTerm)) {
                            row.style.display = '';
                        } else {
                            row.style.display = 'none';
                        }
                    });
                });
            }
        }
    }

    // Format date for display
    function formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleString();
        } catch (e) {
            return '-';
        }
    }

    // Get status badge HTML
    function getStatusBadge(status) {
        if (!status) return '<span class="badge bg-secondary">Unknown</span>';
        
        switch(status.toLowerCase()) {
            case 'confirmed':
            case 'verified':
                return '<span class="badge bg-success">Confirmed</span>';
            case 'pending':
                return '<span class="badge bg-warning text-dark">Pending</span>';
            case 'wrong':
                return '<span class="badge bg-danger">Wrong Payment</span>';
            case 'expired':
                return '<span class="badge bg-secondary">Expired</span>';
            case 'release':
                return '<span class="badge bg-info">Released</span>';
            case 'failed':
                return '<span class="badge bg-danger">Failed</span>';
            case 'abandoned':
                return '<span class="badge bg-dark">Abandoned</span>';
            default:
                return `<span class="badge bg-secondary">${status}</span>`;
        }
    }

    // Load and display HD wallet information
    async function loadHdWalletInfo() {
        const container = document.getElementById('hdwallet-dashboard-content');
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>`;
        
        try {
            // Load both HD wallet balance AND merchant dashboard balance for comparison
            const [walletRes, merchantRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/hd-wallet-balance`),
                fetch(`${API_BASE_URL}/api/wallet-balance`)
            ]);
            
            const walletData = await walletRes.json();
            const merchantData = await merchantRes.json();
            
            if (!walletData.success) throw new Error(walletData.error || 'Failed to fetch wallet balance');
            
            // Format numbers for display - ensure we show small numbers properly
            const ethBalance = parseFloat(walletData.ethBalance || walletData.totalBalance || 0).toFixed(8);
            const audBalance = walletData.audBalance ? `$${walletData.audBalance}` : 'N/A';
            const verifiedBalance = walletData.verifiedBalance ? parseFloat(walletData.verifiedBalance).toFixed(6) : '0.000000';
            const wrongPaymentsBalance = walletData.wrongPaymentsBalance ? parseFloat(walletData.wrongPaymentsBalance).toFixed(6) : '0.000000';
            
            // Get non-zero balance addresses
            const nonZeroAddresses = walletData.addresses || [];
            
            // Merchant dashboard data
            const merchantTotalBalance = merchantData.success ? parseFloat(merchantData.totalBalance || 0).toFixed(6) : '0.000000';
            const merchantPendingBalance = merchantData.success ? parseFloat(merchantData.pendingBalance || 0).toFixed(6) : '0.000000';
            const merchantConfirmedBalance = merchantData.success ? parseFloat(merchantData.verifiedBalance || 0).toFixed(6) : '0.000000';
            
            // Active payment addresses visible to merchants
            const merchantActiveAddresses = merchantData.success && merchantData.addresses ? merchantData.addresses : [];
            
            // Create wallet info HTML with comparison to merchant dashboard
            let html = `
                <h2 class="text-center mb-4">HD Wallet Status</h2>
                
                <div class="card mb-4">
                    <div class="card-body">
                        <h3 class="card-title">Primary Wallet Address</h3>
                        <div class="d-flex align-items-center mb-3">
                            <div class="text-break flex-grow-1">${walletData.address || 'N/A'}</div>
                            ${walletData.address ? `<button class="btn btn-outline-secondary ms-2" onclick="navigator.clipboard.writeText('${walletData.address}')">
                                <i class="bi bi-clipboard"></i>
                            </button>` : ''}
                        </div>
                        
                        <div class="row mt-4">
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-header">
                                        <h5 class="mb-0">Admin View (All Addresses)</h5>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="my-2">${ethBalance} ETH</h4>
                                        <h6 class="text-muted mb-3">${audBalance} AUD</h6>
                                        
                                        <div class="d-flex justify-content-between my-2">
                                            <span>Verified:</span>
                                            <strong class="text-success">${verifiedBalance} ETH</strong>
                                        </div>
                                        <div class="d-flex justify-content-between my-2">
                                            <span>Wrong Payments:</span>
                                            <strong class="text-danger">${wrongPaymentsBalance} ETH</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card bg-light">
                                    <div class="card-header">
                                        <h5 class="mb-0">Merchant Dashboard View</h5>
                                    </div>
                                    <div class="card-body text-center">
                                        <h4 class="my-2">${merchantTotalBalance} ETH</h4>
                                        
                                        <div class="d-flex justify-content-between my-2">
                                            <span>Confirmed:</span>
                                            <strong class="text-success">${merchantConfirmedBalance} ETH</strong>
                                        </div>
                                        <div class="d-flex justify-content-between my-2">
                                            <span>Pending:</span>
                                            <strong class="text-primary">${merchantPendingBalance} ETH</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <p class="text-muted mt-3">Last updated: ${new Date(walletData.lastUpdated || Date.now()).toLocaleString()}</p>
                        
                        <div class="d-flex justify-content-center mt-4">
                            <button class="btn btn-primary" onclick="loadHdWalletInfo()">
                                <i class="bi bi-arrow-repeat me-1"></i> Refresh Balances
                            </button>
                        </div>
                    </div>
                </div>`;
                
            // Add non-zero balance addresses section if there are any
            if (nonZeroAddresses.length > 0) {
                html += `
                    <div class="card mt-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h3 class="card-title mb-0">All HD Wallet Addresses with Balance</h3>
                            <span class="badge bg-primary">${nonZeroAddresses.length} addresses</span>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Index</th>
                                            <th>Address</th>
                                            <th>Balance</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
                                    
                nonZeroAddresses.forEach(addr => {
                    html += `
                        <tr>
                            <td>${addr.index || 'N/A'}</td>
                            <td class="text-truncate" style="max-width: 150px;">${addr.address}</td>
                            <td>${parseFloat(addr.balance || addr.balanceInEth || 0).toFixed(8)} ETH</td>
                            <td>${addr.status ? `<span class="badge bg-${addr.status === 'verified' || addr.status === 'confirmed' ? 'success' : addr.status === 'pending' ? 'warning' : 'secondary'}">${addr.status}</span>` : '-'}</td>
                        </tr>`;
                });
                                    
                html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>`;
            }
            
            // Add merchant's active payment addresses section
            if (merchantActiveAddresses.length > 0) {
                html += `
                    <div class="card mt-4">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h3 class="card-title mb-0">Merchant Dashboard Active Payment Addresses</h3>
                            <span class="badge bg-success">${merchantActiveAddresses.length} addresses</span>
                        </div>
                        <div class="card-body">
                            <p class="text-muted mb-3">These are the addresses currently visible to merchants on their dashboard.</p>
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Address</th>
                                            <th>Balance</th>
                                            <th>Order ID</th>
                                            <th>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
                                    
                merchantActiveAddresses.forEach(addr => {
                    const createdDate = addr.createdAt ? new Date(addr.createdAt).toLocaleString() : 'Unknown';
                    html += `
                        <tr>
                            <td class="text-truncate" style="max-width: 150px;">${addr.address}</td>
                            <td>${parseFloat(addr.balance || 0).toFixed(8)} ETH</td>
                            <td>${addr.orderId || 'N/A'}</td>
                            <td>${createdDate}</td>
                        </tr>`;
                });
                                    
                html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>`;
            }
            
            // Add note about the balance
            html += `
                <div class="alert alert-info mt-4">
                    <i class="bi bi-info-circle-fill me-2"></i>
                    This shows the total on-chain balance across all HD wallet addresses. Some funds may be from expired or wrong payment addresses.
                </div>`;
                
            container.innerHTML = html;
        } catch (error) {
            console.error('Error loading HD wallet info:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Error Loading Wallet Data</h4>
                    <p>${error.message}</p>
                    <button class="btn btn-outline-danger mt-2" onclick="loadHdWalletInfo()">Try Again</button>
                </div>`;
        }
    }

    // Show activity details in a modal
    function showActivityDetails(address) {
        // Find the activity by address or txHash
        const activity = dashboardState.raw.find(a => 
            a.address === address || 
            a.from === address ||
            a.txHash === address
        );
        
        if (!activity) {
            showToast(`Activity not found for ${address}`, 'danger');
            return;
        }
        
        // Create or get the modal
        let modal = document.getElementById('activity-details-modal');
        
        // If the modal already exists, remove it to avoid duplicates or stale data
        if (modal) {
            // Check if there's a Bootstrap modal instance and dispose it first
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) {
                bsModal.dispose();
            }
            modal.remove();
        }
        
        // Create a fresh modal
        modal = document.createElement('div');
        modal.id = 'activity-details-modal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'activityDetailsModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        
        // Add the modal HTML with delete button for user activities
        modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="activityDetailsModalLabel">Activity Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body" id="activity-details-content"></div>
                <div class="modal-footer d-flex justify-content-between">
                    ${activity.type === 'user' ? 
                    `<button type="button" class="btn btn-danger" id="modal-delete-btn">
                        <i class="fas fa-trash me-1"></i> Delete Address
                    </button>` : 
                    '<div></div>'}
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>`;
        
        document.body.appendChild(modal);
        
        // Ensure the modal is properly cleaned up when hidden
        modal.addEventListener('hidden.bs.modal', function () {
            // Dispose the Bootstrap modal instance to fully clean up
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) {
                bsModal.dispose();
            }
            
            // Remove the modal from the DOM to prevent stale elements
            setTimeout(() => {
                if (document.body.contains(modal)) {
                    modal.remove();
                }
            }, 300);
        });
        
        // Populate the modal content
        const contentEl = document.getElementById('activity-details-content');
        if (contentEl) {
            // Determine what fields to display based on activity type
            const isPayment = activity.type === 'payment' || activity.type === 'user';
            const isRelease = activity.type === 'release' || activity.status === 'release';
            
            // Format details table
            let html = `
            <div class="table-responsive">
                <table class="table table-bordered">
                    <tr>
                        <th style="width: 30%">Type</th>
                        <td>
                            ${activity.type === 'user' ? 'User' : 'Merchant'}
                        </td>
                    </tr>`;
            
            // Add fields based on activity type
            if (activity.txHash) {
                html += `
                    <tr>
                        <th>Transaction Hash</th>
                        <td>
                            <div class="d-flex align-items-center">
                                <code class="text-break">${activity.txHash}</code>
                                <button class="btn btn-sm btn-link p-0 ms-2 copy-btn" data-clipboard-text="${activity.txHash}">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <a href="https://sepolia.etherscan.io/tx/${activity.txHash}" 
                                   target="_blank" 
                                   class="btn btn-sm btn-link p-0 ms-2" 
                                   title="View on Etherscan">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </td>
                    </tr>`;
            }
            
            // Add address field - could be payment address, from, or to
            const displayAddress = activity.address || activity.from || '-';
            if (displayAddress !== '-') {
                html += `
                    <tr>
                        <th>${isRelease ? 'From Address' : 'Address'}</th>
                        <td>
                            <div class="d-flex align-items-center">
                                <code class="text-break">${displayAddress}</code>
                                <button class="btn btn-sm btn-link p-0 ms-2 copy-btn" data-clipboard-text="${displayAddress}">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <a href="https://sepolia.etherscan.io/address/${displayAddress}" 
                                   target="_blank" 
                                   class="btn btn-sm btn-link p-0 ms-2" 
                                   title="View on Etherscan">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </td>
                    </tr>`;
            }
            
            // Add recipient address if it's a release
            if (activity.to) {
                html += `
                    <tr>
                        <th>To Address</th>
                        <td>
                            <div class="d-flex align-items-center">
                                <code class="text-break">${activity.to}</code>
                                <button class="btn btn-sm btn-link p-0 ms-2 copy-btn" data-clipboard-text="${activity.to}">
                                    <i class="fas fa-copy"></i>
                                </button>
                                <a href="https://sepolia.etherscan.io/address/${activity.to}" 
                                   target="_blank" 
                                   class="btn btn-sm btn-link p-0 ms-2" 
                                   title="View on Etherscan">
                                    <i class="fas fa-external-link-alt"></i>
                                </a>
                            </div>
                        </td>
                    </tr>`;
            }
            
            // Add identifier fields
            if (activity.orderId || activity.txId) {
                html += `<tr><th>Order/Transaction ID</th><td>${activity.orderId || activity.txId || '-'}</td></tr>`;
            }
            
            // Add status field
            const statusDisplay = typeof activity.status === 'boolean' 
                ? (activity.status ? 'confirmed' : 'failed') 
                : activity.status;
            html += `<tr><th>Status</th><td>${getStatusBadge(statusDisplay)}</td></tr>`;
            
            // Add amount and crypto info
            html += `<tr><th>Crypto Type</th><td>${activity.cryptoType || 'ETH'}</td></tr>`;
            
            // Enhanced wrong payment display
            if (activity.isWrongPayment || activity.amountVerified === false) {
                html += `
                    <tr>
                        <th>Expected Amount</th>
                        <td><strong class="text-success">${activity.expectedAmount || '-'} ${activity.cryptoType || 'ETH'}</strong></td>
                    </tr>
                    <tr>
                        <th>Actual Amount Sent</th>
                        <td><strong class="text-danger">${activity.amount || '-'} ${activity.cryptoType || 'ETH'}</strong></td>
                    </tr>
                    <tr>
                        <th>Difference</th>
                        <td>
                            <span class="badge bg-danger">
                                ${(parseFloat(activity.expectedAmount) - parseFloat(activity.amount)).toFixed(8)} ${activity.cryptoType || 'ETH'}
                            </span>
                        </td>
                    </tr>`;
            } else {
                html += `<tr><th>Amount</th><td>${activity.amount || '-'} ${activity.cryptoType || 'ETH'}</td></tr>`;
                
                // Only add expected amount for payment activities if not already shown
                if (isPayment && activity.expectedAmount && activity.expectedAmount !== activity.amount) {
                    html += `<tr><th>Expected Amount</th><td>${activity.expectedAmount || '-'} ${activity.cryptoType || 'ETH'}</td></tr>`;
                }
            }
            
            // Add fiat amount if available
            if (activity.fiatAmount) {
                html += `<tr><th>Fiat Amount</th><td>${activity.fiatAmount || '-'} ${activity.fiatCurrency || 'USD'}</td></tr>`;
            }
            
            // Add timing information
            html += `<tr><th>Created/Timestamp</th><td>${formatDate(activity.timestamp || activity.createdAt)}</td></tr>`;
            
            // Add expiry for payment addresses with timer
            if (activity.expiresAt) {
                const isExpired = new Date(activity.expiresAt) < new Date();
                const expiryDisplay = isExpired 
                    ? `<span class="text-danger">Expired at ${formatDate(activity.expiresAt)}</span>` 
                    : formatDate(activity.expiresAt);
                    
                html += `<tr><th>Expires At</th><td>${expiryDisplay}</td></tr>`;
                
                // Add timer for pending addresses
                if (activity.type === 'user' && activity.status === 'pending' && !isExpired) {
                    const timeLeft = activity.timeLeft || getTimeLeftString(activity.expiresAt);
                    html += `
                        <tr>
                            <th>Time Left</th>
                            <td>
                                <div class="d-flex align-items-center">
                                    <span class="badge bg-warning text-dark me-2">
                                        <i class="fas fa-hourglass-half me-1"></i>${timeLeft}
                                    </span>
                                </div>
                            </td>
                        </tr>`;
                }
            }
            
            // Add completed time for transactions
            if (activity.completedAt) {
                html += `<tr><th>Completed At</th><td>${formatDate(activity.completedAt)}</td></tr>`;
            }
            
            // Add gas details for blockchain transactions
            if (activity.gasUsed) {
                html += `<tr><th>Gas Used</th><td>${activity.gasUsed}</td></tr>`;
            }
            
            if (activity.gasPrice) {
                html += `<tr><th>Gas Price</th><td>${activity.gasPrice}</td></tr>`;
            }
            
            // Add source info
            html += `<tr><th>Data Source</th><td>${activity.source || 'Transaction Log'}</td></tr>`;
            
            // Add enhanced wrong payment details
            if (activity.isWrongPayment || activity.amountVerified === false) {
                html += `
                    <tr>
                        <th>Wrong Payment</th>
                        <td>
                            <div class="alert alert-danger mb-0 p-2">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                ${activity.wrongReason || 'Amount sent does not match expected amount'}
                            </div>
                        </td>
                    </tr>`;
            }
            
            if (activity.isExpired) {
                html += `<tr><th>Expired</th><td>Yes</td></tr>`;
            }
            
            // Close the table
            html += `</table></div>`;
            
            // Add blockchain explorer links
            let explorerLinksHtml = '';
            
            // Add Transaction Hash link
            if (activity.txHash) {
                explorerLinksHtml += `
                <a href="https://sepolia.etherscan.io/tx/${activity.txHash}" target="_blank" class="btn btn-outline-primary me-2 etherscan-link">
                    <i class="fas fa-exchange-alt me-1"></i>View Transaction
                </a>`;
            }
            
            // Add Address link (payment address or sender address)
            const addressToLink = activity.address || activity.from;
            if (addressToLink) {
                explorerLinksHtml += `
                <a href="https://sepolia.etherscan.io/address/${addressToLink}" target="_blank" class="btn btn-outline-secondary me-2 etherscan-link">
                    <i class="fas fa-external-link-alt me-1"></i>View Address
                </a>`;
            }
            
            // Add Recipient Address link if it's a release transaction
            if (activity.to) {
                explorerLinksHtml += `
                <a href="https://sepolia.etherscan.io/address/${activity.to}" target="_blank" class="btn btn-outline-info etherscan-link">
                    <i class="fas fa-user me-1"></i>View Recipient
                </a>`;
            }
            
            // Add explorer links section if we have any links
            if (explorerLinksHtml) {
                html += `
                <div class="explorer-links-section mt-3 mb-3">
                    <h6 class="mb-2"><i class="fas fa-link me-1"></i>Blockchain Explorer Links:</h6>
                    <div class="d-flex flex-wrap">
                        ${explorerLinksHtml}
                    </div>
                </div>`;
            }
            
            // Add debug info for advanced users
            html += `
            <details class="mt-3">
                <summary class="text-muted">Raw Data (Debug)</summary>
                <pre class="bg-light p-3 mt-2 rounded" style="max-height: 200px; overflow: auto;"><code>${JSON.stringify(activity, null, 2)}</code></pre>
            </details>`;
            
            contentEl.innerHTML = html;
        }
        
        // Add delete button handler for user activities
        const deleteBtn = document.getElementById('modal-delete-btn');
        if (deleteBtn && activity.address) {
            deleteBtn.addEventListener('click', () => {
                // First hide the modal
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                }
                // Then delete the address after a short delay to ensure modal is gone
                setTimeout(() => {
                    deleteAddress(activity.address);
                }, 300);
            });
        }
        
        // Show the modal
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }

    // Delete a specific address
    async function deleteAddress(address) {
        if (!confirm(`Are you sure you want to delete the address ${address.substring(0, 8)}...${address.substring(address.length - 6)}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/delete-address`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ address })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                showToast(`Successfully deleted address ${address.substring(0, 8)}...`, 'success');
                
                // Remove the address from the dashboard state
                dashboardState.raw = dashboardState.raw.filter(a => a.address !== address);
                
                // Re-render the activities
                renderActivities();
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error deleting address:', error);
            showToast(`Failed to delete address: ${error.message}`, 'danger');
        }
    }

    // Clean up expired addresses
    async function cleanupExpiredAddresses() {
        if (!confirm('Are you sure you want to clean up all expired addresses? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/cleanup-addresses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type: 'expired' })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                showToast(result.message || `Successfully cleaned up ${result.count || 'all'} expired addresses`, 'success');
                
                // Reload data to update the dashboard
                loadAdminDashboard();
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error cleaning up expired addresses:', error);
            showToast(`Failed to clean up expired addresses: ${error.message}`, 'danger');
        }
    }

    // Clean up abandoned addresses
    async function cleanupAbandonedAddresses() {
        if (!confirm('Are you sure you want to clean up all abandoned addresses? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/cleanup-addresses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type: 'abandoned' })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                showToast(result.message || `Successfully cleaned up ${result.count || 'all'} abandoned addresses`, 'success');
                
                // Reload data to update the dashboard
                loadAdminDashboard();
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error cleaning up abandoned addresses:', error);
            showToast(`Failed to clean up abandoned addresses: ${error.message}`, 'danger');
        }
    }

    // Initialize database management tab
    function initDatabaseTab() {
        // Load database health status
        loadDatabaseHealth();
        
        // Load database backups
        loadDatabaseBackups();
        
        console.log('Database management tab initialized');
    }

    // Show addresses filter UI
    function showAddressesFilter() {
        // Placeholder for future implementation
        showToast('Address filtering feature will be implemented in a future update', 'info');
        console.log('Address filtering not yet implemented');
    }

    // --- Document Ready: Initialize Dashboard ---
    document.addEventListener('DOMContentLoaded', function() {
        // Make all database functions globally available
        window.loadDatabaseHealth = loadDatabaseHealth;
        window.createBackup = createBackup;
        window.loadDatabaseBackups = loadDatabaseBackups;
        window.showUploadBackupModal = showUploadBackupModal;
        window.uploadBackup = uploadBackup;
        window.autoRecover = autoRecover;
        window.manualRecover = manualRecover;
        window.confirmRestore = confirmRestore;
        window.cleanupBackups = cleanupBackups;
        window.verifyAllBackups = verifyAllBackups;
        window.reinitializeRecovery = reinitializeRecovery;
        window.verifyBackup = verifyBackup;
        window.downloadBackup = downloadBackup;
        window.showRestoreConfirmation = showRestoreConfirmation;
        window.filterBackups = filterBackups;
        window.formatFileSize = formatFileSize;
        window.escapeHtml = escapeHtml;
        window.initDatabaseTab = initDatabaseTab;
        window.loadHdWalletInfo = loadHdWalletInfo;
        window.showAddressesFilter = showAddressesFilter;
        
        // Make admin dashboard activity functions globally available
        window.cleanupExpiredAddresses = cleanupExpiredAddresses;
        window.cleanupAbandonedAddresses = cleanupAbandonedAddresses;
        window.deleteAddress = deleteAddress;
        window.showActivityDetails = showActivityDetails;
        window.renderActivities = renderActivities;
        window.getTimeLeftString = getTimeLeftString;
        window.startAddressTimers = startAddressTimers;
        
        // Initialize clipboard.js
        if (typeof ClipboardJS !== 'undefined') {
            new ClipboardJS('.copy-btn');
        }
        
        // Add custom CSS for better UI experience
        const customStyle = document.createElement('style');
        customStyle.textContent = `
            .cursor-pointer { cursor: pointer; }
            .cursor-pointer:hover { background-color: rgba(0,0,0,0.03); }
            tr.cursor-pointer td { vertical-align: middle; }
            
            /* Fix for modals stacking */
            .modal-backdrop + .modal-backdrop { z-index: 1060; }
            
            /* Responsive table improvements */
            @media (max-width: 768px) {
                .table-responsive th, .table-responsive td {
                    font-size: 0.9rem;
                }
                .btn-sm {
                    padding: 0.2rem 0.4rem;
                    font-size: 0.75rem;
                }
            }
            
            /* Add animation to new activities */
            @keyframes highlight {
                0% { background-color: rgba(255, 251, 130, 0.8); }
                100% { background-color: transparent; }
            }
            .highlight-new {
                animation: highlight 2s ease-out;
            }
            
            /* Better modal animations */
            .modal.fade .modal-dialog {
                transition: transform 0.2s ease-out;
            }
            
            /* Etherscan link styles */
            .etherscan-link {
                transition: all 0.2s ease;
            }
            .etherscan-link:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            .explorer-links-section {
                background-color: rgba(13, 110, 253, 0.05);
                border-radius: 8px;
                padding: 12px;
                margin: 12px 0;
            }
            .explorer-links-section h6 {
                color: #495057;
            }
            
            /* Transaction badge */
            .tx-badge {
                display: inline-block;
                font-size: 10px;
                background-color: #e9ecef;
                color: #495057;
                padding: 2px 5px;
                border-radius: 4px;
                margin-left: 5px;
                vertical-align: middle;
                text-decoration: none;
            }
            .tx-badge:hover {
                background-color: #dee2e6;
                text-decoration: none;
            }
        `;
        document.head.appendChild(customStyle);
        
        // Set up tab switching
        const databaseTab = document.getElementById('database-tab');
        if (databaseTab) {
            databaseTab.addEventListener('shown.bs.tab', function() {
                initDatabaseTab();
            });
        }
        
        // Load initial dashboard
        loadAdminDashboard();
        
        // If hash is #database, initialize database tab
        if (window.location.hash === '#database') {
            const tabEl = document.getElementById('database-tab');
            if (tabEl) {
                const tab = new bootstrap.Tab(tabEl);
                tab.show();
                initDatabaseTab();
            }
        }
        
        // Initialize database tab if we're on it
        if (document.querySelector('#database-tab.active')) {
            initDatabaseTab();
        }
    });
