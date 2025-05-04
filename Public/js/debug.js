// Database Management Debug Script

document.addEventListener('DOMContentLoaded', function() {
    console.log('Debug script loaded');
    
    // Automatically apply the API URL fix
    fixApiCalls();
    
    // Add debug button
    addDebugButton();
    
    // Add function check button
    addFunctionCheckButton();
    
    // Add event listener for the Fix API URLs button
    const fixApiUrlsBtn = document.getElementById('fix-api-urls-btn');
    if (fixApiUrlsBtn) {
        fixApiUrlsBtn.addEventListener('click', function() {
            fixApiCalls();
            showToast('API URLs fixed! All calls will use port 3000.', 'success');
        });
    }
    
    // Test direct API calls to see what's happening
    testDatabaseAPI();
    
    // Fix any missing functions
    fixMissingFunctions();
});

// Add a quick fix button to override all fetch calls with the correct port
function addQuickFixButton() {
    const fixBtn = document.createElement('button');
    fixBtn.textContent = 'Fix API URLs';
    fixBtn.style.position = 'fixed';
    fixBtn.style.top = '10px';
    fixBtn.style.right = '10px';
    fixBtn.style.zIndex = '9999';
    fixBtn.style.padding = '5px 10px';
    fixBtn.style.backgroundColor = '#4CAF50';
    fixBtn.style.color = 'white';
    fixBtn.style.border = 'none';
    fixBtn.style.borderRadius = '4px';
    fixBtn.style.cursor = 'pointer';
    
    fixBtn.addEventListener('click', function() {
        fixApiCalls();
    });
    
    document.body.appendChild(fixBtn);
}

// Apply a runtime fix to all fetch calls to use the correct port
function fixApiCalls() {
    const originalFetch = window.fetch;
    
    // Monkey patch the fetch function to insert the correct port into API URLs
    window.fetch = function(url, options) {
        let modifiedUrl = url;
        
        // If this is an API call and doesn't have a protocol, add the base URL
        if (typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('http')) {
            modifiedUrl = `http://localhost:3000${url}`;
            console.log(`Fixed API URL: ${url} → ${modifiedUrl}`);
        }
        
        return originalFetch.call(this, modifiedUrl, options);
    };
    
    // Fix download URLs in buttons
    document.querySelectorAll('[onclick*="downloadBackup"]').forEach(el => {
        const originalOnclick = el.getAttribute('onclick');
        if (originalOnclick && originalOnclick.includes('/api/admin/download-backup')) {
            const newOnclick = originalOnclick.replace(
                /downloadBackup\('([^']*)'\)/,
                "window.location.href='http://localhost:3000/api/admin/download-backup/$1'"
            );
            el.setAttribute('onclick', newOnclick);
        }
    });
    
    showFixAppliedMessage();
}

function showFixAppliedMessage() {
    const msg = document.createElement('div');
    msg.style.position = 'fixed';
    msg.style.top = '50px';
    msg.style.left = '50%';
    msg.style.transform = 'translateX(-50%)';
    msg.style.padding = '15px 20px';
    msg.style.backgroundColor = '#4CAF50';
    msg.style.color = 'white';
    msg.style.borderRadius = '4px';
    msg.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    msg.style.zIndex = '9999';
    msg.innerHTML = 'API URL fix applied! <button id="reload-page" style="background:white; color:#4CAF50; border:none; padding:3px 8px; border-radius:3px; margin-left:10px; cursor:pointer;">Reload Page</button>';
    
    document.body.appendChild(msg);
    
    // Add reload button handler
    document.getElementById('reload-page').addEventListener('click', function() {
        window.location.reload();
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(msg)) {
            document.body.removeChild(msg);
        }
    }, 5000);
}

async function testDatabaseAPI() {
    console.log('Testing database API endpoints...');
    
    // Only test endpoints on port 3000 since that's what the server is using
    const endpoints = [
        { url: '/api/admin/database-status?force=true', name: 'Database Status (Relative URL)' },
        { url: '/api/health/database', name: 'Health Database (Relative URL)' },
        { url: 'http://localhost:3000/api/admin/database-status?force=true', name: 'Database Status' },
        { url: 'http://localhost:3000/api/health/database', name: 'Health Database' },
        { url: 'http://localhost:3000/api/admin/backups', name: 'Backups List' },
        { url: 'http://localhost:3000/api/admin/create-backup', name: 'Create Backup', method: 'POST' }
    ];
    
    const results = {};
    
    for (const endpoint of endpoints) {
        try {
            console.log(`Testing ${endpoint.name}: ${endpoint.url}`);
            const startTime = Date.now();
            
            const options = {
                method: endpoint.method || 'GET',
                headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : {}
            };
            
            const response = await fetch(endpoint.url, options);
            const endTime = Date.now();
            
            if (response.ok) {
                const data = await response.json();
                results[endpoint.name] = {
                    success: true,
                    status: response.status,
                    time: endTime - startTime,
                    data: data
                };
                console.log(`✅ Success: ${endpoint.name}`, data);
            } else {
                results[endpoint.name] = {
                    success: false,
                    status: response.status,
                    time: endTime - startTime,
                    error: `HTTP Error: ${response.status}`
                };
                console.log(`❌ Failed: ${endpoint.name} - HTTP ${response.status}`);
            }
        } catch (error) {
            results[endpoint.name] = {
                success: false,
                error: error.message
            };
            console.log(`❌ Error: ${endpoint.name} - ${error.message}`);
        }
    }
    
    // Add a visual indicator to the page to show results
    const debugDiv = document.createElement('div');
    debugDiv.style.position = 'fixed';
    debugDiv.style.bottom = '10px';
    debugDiv.style.right = '10px';
    debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.zIndex = '9999';
    debugDiv.style.maxHeight = '300px';
    debugDiv.style.overflowY = 'auto';
    debugDiv.style.width = '400px';
    
    let html = '<h4>API Test Results</h4>';
    
    for (const [name, result] of Object.entries(results)) {
        html += `<div style="margin-bottom:10px;">
            <div><strong>${name}</strong>: ${result.success ? '✅ Success' : '❌ Failed'}</div>
            ${result.status ? `<div>Status: ${result.status}</div>` : ''}
            ${result.time ? `<div>Time: ${result.time}ms</div>` : ''}
            ${result.error ? `<div>Error: ${result.error}</div>` : ''}
        </div>`;
    }
    
    html += '<button id="debug-close" style="margin-top:10px;padding:5px 10px;">Close</button>';
    debugDiv.innerHTML = html;
    
    document.body.appendChild(debugDiv);
    
    document.getElementById('debug-close').addEventListener('click', function() {
        debugDiv.remove();
    });
    
    return results;
}

// Add a visual debugging button to the page
function addDebugButton() {
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Debug API';
    debugButton.style.position = 'fixed';
    debugButton.style.bottom = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '9999';
    debugButton.style.padding = '5px 10px';
    debugButton.style.backgroundColor = '#ff5722';
    debugButton.style.color = 'white';
    debugButton.style.border = 'none';
    debugButton.style.borderRadius = '4px';
    debugButton.style.cursor = 'pointer';
    
    debugButton.addEventListener('click', function() {
        testDatabaseAPI();
    });
    
    document.body.appendChild(debugButton);
}

// Add a button to check if database functions are globally accessible
function addFunctionCheckButton() {
    const checkBtn = document.createElement('button');
    checkBtn.textContent = 'Check Functions';
    checkBtn.style.position = 'fixed';
    checkBtn.style.top = '10px';
    checkBtn.style.left = '10px';
    checkBtn.style.zIndex = '9999';
    checkBtn.style.padding = '5px 10px';
    checkBtn.style.backgroundColor = '#2196F3';
    checkBtn.style.color = 'white';
    checkBtn.style.border = 'none';
    checkBtn.style.borderRadius = '4px';
    checkBtn.style.cursor = 'pointer';
    
    checkBtn.addEventListener('click', function() {
        checkGlobalFunctions();
    });
    
    document.body.appendChild(checkBtn);
}

// Check if database functions are correctly exposed globally
function checkGlobalFunctions() {
    const functions = [
        'loadDatabaseHealth',
        'createBackup',
        'loadDatabaseBackups',
        'showUploadBackupModal',
        'uploadBackup',
        'autoRecover',
        'manualRecover',
        'confirmRestore',
        'cleanupBackups',
        'verifyAllBackups',
        'reinitializeRecovery',
        'verifyBackup',
        'downloadBackup',
        'showRestoreConfirmation',
        'filterBackups',
        'formatFileSize',
        'escapeHtml'
    ];
    
    const results = {};
    let missingCount = 0;
    
    functions.forEach(funcName => {
        if (typeof window[funcName] === 'function') {
            results[funcName] = true;
        } else {
            results[funcName] = false;
            missingCount++;
        }
    });
    
    // Create a status display
    const statusDiv = document.createElement('div');
    statusDiv.style.position = 'fixed';
    statusDiv.style.top = '50px';
    statusDiv.style.left = '50%';
    statusDiv.style.transform = 'translateX(-50%)';
    statusDiv.style.backgroundColor = missingCount > 0 ? '#f44336' : '#4CAF50';
    statusDiv.style.color = 'white';
    statusDiv.style.padding = '15px';
    statusDiv.style.borderRadius = '5px';
    statusDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    statusDiv.style.zIndex = '9999';
    statusDiv.style.maxHeight = '80vh';
    statusDiv.style.overflowY = 'auto';
    statusDiv.style.maxWidth = '600px';
    
    let html = `<h4>Global Function Check</h4>
                <p>${missingCount > 0 ? 'Missing functions detected!' : 'All functions available!'}</p>
                <table style="width:100%;border-collapse:collapse;">
                    <tr>
                        <th style="text-align:left;padding:5px;border-bottom:1px solid rgba(255,255,255,0.3);">Function</th>
                        <th style="text-align:left;padding:5px;border-bottom:1px solid rgba(255,255,255,0.3);">Status</th>
                    </tr>`;
    
    for (const [funcName, isAvailable] of Object.entries(results)) {
        html += `
            <tr>
                <td style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.2);">${funcName}</td>
                <td style="padding:5px;border-bottom:1px solid rgba(255,255,255,0.2);">${isAvailable ? '✅ Available' : '❌ Missing'}</td>
            </tr>
        `;
    }
    
    html += `</table>`;
    
    if (missingCount > 0) {
        html += `<button id="fix-functions-btn" style="margin-top:15px;padding:5px 10px;background:white;color:#f44336;border:none;border-radius:3px;cursor:pointer;">Fix Missing Functions</button>`;
    }
    
    html += `<button id="close-functions-check" style="margin-top:15px;padding:5px 10px;background:rgba(255,255,255,0.2);color:white;border:none;border-radius:3px;cursor:pointer;float:right;">Close</button>`;
    
    statusDiv.innerHTML = html;
    document.body.appendChild(statusDiv);
    
    // Add event listener for the close button
    document.getElementById('close-functions-check').addEventListener('click', function() {
        statusDiv.remove();
    });
    
    // Add event listener for the fix button
    if (missingCount > 0) {
        document.getElementById('fix-functions-btn').addEventListener('click', function() {
            fixMissingFunctions();
            statusDiv.remove();
        });
    }
    
    return results;
}

// Provide fallback implementations for missing functions
function fixMissingFunctions() {
    console.log('Fixing missing functions...');
    
    // API Base URL
    const API_BASE_URL = 'http://localhost:3000';
    
    // Define fallback implementations
    const fallbacks = {
        loadDatabaseHealth: async function() {
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
                const response = await fetch(`${API_BASE_URL}/api/admin/database-status?force=true`);
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to check database health');
                }
                
                // Render health status UI
                const status = data.status;
                const isHealthy = status.isHealthy;
                const lastChecked = status.lastChecked ? new Date(status.lastChecked).toLocaleString() : 'Never';
                
                if (isHealthy) {
                    healthStatusEl.innerHTML = `
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
                    healthStatusEl.innerHTML = `
                        <div class="text-center mb-4">
                            <div class="d-inline-block p-3 bg-danger bg-opacity-10 rounded-circle mb-3">
                                <i class="fas fa-exclamation-triangle text-danger fa-3x"></i>
                            </div>
                            <h5 class="mb-1">Database issues detected</h5>
                            <p class="text-secondary">Please use recovery options</p>
                        </div>
                        <div class="alert alert-warning mt-3">
                            <i class="fas fa-info-circle me-2"></i>
                            Use the recovery options to restore from a backup.
                        </div>
                    `;
                }
                
            } catch (error) {
                healthStatusEl.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        <i class="fas fa-exclamation-circle me-2"></i>
                        Error checking database health: ${error.message}
                    </div>
                `;
            }
        },
        
        createBackup: async function() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/admin/create-backup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to create backup');
                }
                
                alert('Backup created successfully!');
                
                // Reload backups if the function exists
                if (typeof window.loadDatabaseBackups === 'function') {
                    window.loadDatabaseBackups();
                }
                
            } catch (error) {
                alert(`Error creating backup: ${error.message}`);
            }
        },
        
        loadDatabaseBackups: async function() {
            const tableBody = document.getElementById('backups-table-body');
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
                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    throw new Error(data.error || 'Failed to load backups');
                }
                
                const backups = data.backups || [];
                
                if (backups.length === 0) {
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
                    const size = typeof window.formatFileSize === 'function' 
                        ? window.formatFileSize(backup.size)
                        : `${Math.round(backup.size / 1024)} KB`;
                    
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
                        <tr id="backup-row-${filename}" data-backup-file="${filename}">
                            <td>
                                <div class="d-flex align-items-center">
                                    <i class="fas fa-file-archive text-primary me-2"></i>
                                    <span>${filename}</span>
                                </div>
                            </td>
                            <td>${type}</td>
                            <td>${created}</td>
                            <td>${size}</td>
                            <td>${statusBadge}</td>
                            <td>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-primary" onclick="window.location.href='${API_BASE_URL}/api/admin/download-backup/${filename}'">
                                        <i class="fas fa-download"></i>
                                    </button>
                                    <button class="btn btn-outline-success" onclick="alert('Verify backup: ${filename}')">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    <button class="btn btn-outline-warning" onclick="alert('Restore from backup: ${filename}')">
                                        <i class="fas fa-undo"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }
                
                tableBody.innerHTML = tableRows;
                
                // Update backup count if the element exists
                const backupCountEl = document.getElementById('backup-count');
                if (backupCountEl) {
                    backupCountEl.textContent = `${backups.length} backup${backups.length !== 1 ? 's' : ''} available`;
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
            }
        },
        
        // Minimal implementations for other functions
        showUploadBackupModal: function() {
            alert('Upload backup functionality not implemented in debugger');
        },
        
        uploadBackup: function() {
            alert('Upload backup functionality not implemented in debugger');
        },
        
        autoRecover: async function() {
            alert('Starting auto-recovery process...');
            try {
                const response = await fetch(`${API_BASE_URL}/api/admin/auto-recover`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    alert(`Auto-recovery ${data.restored ? 'successful!' : 'failed - no healthy backups found'}`);
                } else {
                    alert(`Auto-recovery error: ${data.error}`);
                }
                
            } catch (error) {
                alert(`Auto-recovery error: ${error.message}`);
            }
        },
        
        manualRecover: function() {
            alert('Please select a backup from the list below to restore');
            
            // Scroll to the backups table if it exists
            const backupsTable = document.querySelector('.card.shadow-sm.mb-4');
            if (backupsTable) {
                backupsTable.scrollIntoView({ behavior: 'smooth' });
            }
        },
        
        confirmRestore: function() {
            alert('Restore confirmation functionality not implemented in debugger');
        },
        
        cleanupBackups: function() {
            alert('Cleanup backups functionality not implemented in debugger');
        },
        
        verifyAllBackups: function() {
            alert('Verify all backups functionality not implemented in debugger');
        },
        
        reinitializeRecovery: function() {
            alert('Reinitialize recovery functionality not implemented in debugger');
        },
        
        verifyBackup: function(filename) {
            alert(`Verifying backup: ${filename}`);
        },
        
        downloadBackup: function(filename) {
            window.location.href = `${API_BASE_URL}/api/admin/download-backup/${filename}`;
        },
        
        showRestoreConfirmation: function(filename) {
            if (confirm(`Are you sure you want to restore from backup: ${filename}?`)) {
                alert(`Restoring from ${filename}... (simulation)`);
            }
        },
        
        filterBackups: function(searchTerm) {
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
        },
        
        formatFileSize: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },
        
        escapeHtml: function(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    };
    
    // Check each function and apply fallback if missing
    for (const [funcName, implementation] of Object.entries(fallbacks)) {
        if (typeof window[funcName] !== 'function') {
            console.log(`Fixing missing function: ${funcName}`);
            window[funcName] = implementation;
        }
    }
    
    // Try to initialize database tab
    if (typeof window.initDatabaseTab === 'function') {
        window.initDatabaseTab();
    } else {
        // Create a basic initialization function
        window.initDatabaseTab = function() {
            console.log('Debug: Initializing database tab with fallback');
            window.loadDatabaseHealth();
            window.loadDatabaseBackups();
        };
        
        // Call it
        window.initDatabaseTab();
    }
    
   
}

// Make sure all buttons have inline onclick handlers
function ensureInlineHandlers() {
    // Make sure all buttons with specific IDs have onclick handlers
    const buttonMappings = {
        'btn-refresh-health': 'loadDatabaseHealth()',
        'btn-create-backup': 'createBackup()',
        'btn-refresh-backups': 'loadDatabaseBackups()',
        'btn-auto-recover': 'autoRecover()',
        'btn-manual-recover': 'manualRecover()',
        'btn-cleanup-backups': 'cleanupBackups()',
        'btn-verify-all-backups': 'verifyAllBackups()',
        'btn-reinitialize-recovery': 'reinitializeRecovery()',
        'btn-upload-backup': 'showUploadBackupModal()',
        'btn-confirm-restore': 'confirmRestore()'
    };
    
    for (const [id, handler] of Object.entries(buttonMappings)) {
        const btn = document.getElementById(id);
        if (btn && !btn.hasAttribute('onclick')) {
            console.log(`Adding onclick handler to button #${id}`);
            btn.setAttribute('onclick', handler);
        }
    }
}

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