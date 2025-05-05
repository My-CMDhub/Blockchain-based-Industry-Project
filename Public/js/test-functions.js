// Test script to verify all database functions are properly exposed
console.log("Running function verification test...");

const requiredFunctions = [
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
    'escapeHtml',
    'initDatabaseTab'
];

const missingFunctions = [];
const availableFunctions = [];

requiredFunctions.forEach(funcName => {
    if (typeof window[funcName] === 'function') {
        availableFunctions.push(funcName);
    } else {
        missingFunctions.push(funcName);
    }
});

console.log(`✅ Available functions (${availableFunctions.length}/${requiredFunctions.length}):`, availableFunctions);

if (missingFunctions.length > 0) {
    console.error(`❌ Missing functions (${missingFunctions.length}):`, missingFunctions);
} else {
    console.log("✅ All required functions are available!");
}

// Test API base URL
console.log("API_BASE_URL set to:", window.API_BASE_URL || "Not defined!");

// Test API endpoints
async function testApiEndpoints() {
    console.log("Testing API endpoints...");
    
    const endpoints = [
        { name: "Database Status", url: "/api/admin/database-status?force=true", method: "GET" },
        { name: "Health Database", url: "/api/health/database", method: "GET" },
        { name: "Backups List", url: "/api/admin/backups", method: "GET" },
        { name: "Create Backup", url: "/api/admin/create-backup", method: "POST" }
        // Skipping restore-backup as it requires a valid filename
    ];
    
    const baseUrl = window.API_BASE_URL || "http://localhost:3000";
    
    for (const endpoint of endpoints) {
        try {
            const fullUrl = baseUrl + endpoint.url;
            const options = {
                method: endpoint.method,
                headers: endpoint.method === "POST" ? { "Content-Type": "application/json" } : undefined,
                body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
            };
            
            console.log(`Testing ${endpoint.name} (${endpoint.method} ${fullUrl})...`);
            const response = await fetch(fullUrl, options);
            
            console.log(`✅ ${endpoint.name}: Status ${response.status}`);
            const data = await response.json();
            console.log(`Response:`, data);
        } catch (error) {
            console.error(`❌ ${endpoint.name} failed: ${error.message}`);
        }
    }
}

// Attempt to call the loadDatabaseHealth function
if (typeof window.loadDatabaseHealth === 'function') {
    console.log("Calling loadDatabaseHealth() function...");
    try {
        window.loadDatabaseHealth();
        console.log("loadDatabaseHealth() called successfully!");
    } catch (error) {
        console.error("Error calling loadDatabaseHealth():", error);
    }
} else {
    console.error("Cannot test loadDatabaseHealth - function not available");
}

// Test the database tab initialization
if (typeof window.initDatabaseTab === 'function') {
    console.log("Database tab initialization function is available!");
} else {
    console.error("Database tab initialization function is NOT available!");
}

// Run the API endpoints test
testApiEndpoints(); 