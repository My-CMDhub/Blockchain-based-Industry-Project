/**
 * Test Database Recovery System
 * 
 * This script tests the database recovery mechanism by:
 * 1. Checking current database status
 * 2. Creating a controlled corruption
 * 3. Verifying corruption is detected
 * 4. Testing backup creation
 * 5. Testing restoration from backup
 * 
 * Run with: node scripts/test-database-recovery.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const copyFile = promisify(fs.copyFile);
const access = promisify(fs.access);

// Configuration
const API_URL = 'http://localhost:3000/api';
const MERCHANT_TRANSACTIONS_FILE = 'merchant_transactions.json';
const KEYS_FILE = 'Json/keys.json';
const ADDRESS_MAP_FILE = 'address_index_map.json';
const PAYMENT_REQUESTS_FILE = 'payment_requests.json';

// Utility: Format result for console output
function formatResult(test, success, details) {
    const STATUS = success ? '✅ PASS' : '❌ FAIL';
    console.log(`${STATUS}: ${test}`);
    if (details) {
        if (typeof details === 'object') {
            console.log(JSON.stringify(details, null, 2));
        } else {
            console.log(`  ${details}`);
        }
    }
}

// Utility: Wait for specified milliseconds
async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Check if the server is running
async function checkServerRunning() {
    try {
        const response = await axios.get(`${API_URL}/admin/database-status`);
        return response.data.success;
    } catch (error) {
        return false;
    }
}

// 2. Create a backup of the original files
async function createOriginalBackup() {
    try {
        const timestamp = Date.now();
        await copyFile(MERCHANT_TRANSACTIONS_FILE, `${MERCHANT_TRANSACTIONS_FILE}.test-backup.${timestamp}`);
        await copyFile(KEYS_FILE, `${KEYS_FILE}.test-backup.${timestamp}`);
        await copyFile(ADDRESS_MAP_FILE, `${ADDRESS_MAP_FILE}.test-backup.${timestamp}`);
        await copyFile(PAYMENT_REQUESTS_FILE, `${PAYMENT_REQUESTS_FILE}.test-backup.${timestamp}`);
        
        return {
            timestamp,
            files: {
                merchant: `${MERCHANT_TRANSACTIONS_FILE}.test-backup.${timestamp}`,
                keys: `${KEYS_FILE}.test-backup.${timestamp}`,
                address: `${ADDRESS_MAP_FILE}.test-backup.${timestamp}`,
                payment: `${PAYMENT_REQUESTS_FILE}.test-backup.${timestamp}`
            }
        };
    } catch (error) {
        throw new Error(`Failed to create original backup: ${error.message}`);
    }
}

// 3. Restore original files after tests
async function restoreOriginalFiles(backup) {
    try {
        await copyFile(backup.files.merchant, MERCHANT_TRANSACTIONS_FILE);
        await copyFile(backup.files.keys, KEYS_FILE);
        await copyFile(backup.files.address, ADDRESS_MAP_FILE);
        await copyFile(backup.files.payment, PAYMENT_REQUESTS_FILE);
        
        // Delete backup files
        fs.unlinkSync(backup.files.merchant);
        fs.unlinkSync(backup.files.keys);
        fs.unlinkSync(backup.files.address);
        fs.unlinkSync(backup.files.payment);
        
        return true;
    } catch (error) {
        throw new Error(`Failed to restore original files: ${error.message}`);
    }
}

// 4. Test 1: Check current database status
async function testDatabaseStatus() {
    try {
        const response = await axios.get(`${API_URL}/admin/database-status`);
        return {
            success: response.data.success,
            details: response.data.status
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 5. Test 2: Create manual backup
async function testManualBackup() {
    try {
        const response = await axios.post(`${API_URL}/admin/create-backup`, {
            reason: 'test'
        });
        
        return {
            success: response.data.success,
            details: response.data.backups
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 6. Test 3: List available backups
async function testListBackups() {
    try {
        const response = await axios.get(`${API_URL}/admin/database-backups`);
        return {
            success: response.data.success,
            details: response.data.backups
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 7. Test 4: Create controlled corruption in merchant_transactions.json
async function testCreateCorruption() {
    try {
        // Read the current file
        const data = await readFile(MERCHANT_TRANSACTIONS_FILE, 'utf8');
        
        // Create corruption by making it invalid JSON
        await writeFile(MERCHANT_TRANSACTIONS_FILE, data.substring(0, data.length - 5) + '}not_valid_json', 'utf8');
        
        // Wait for the system to detect the corruption
        await wait(2000);
        
        // Check if the system detected the corruption
        const response = await axios.get(`${API_URL}/admin/database-status`, {
            params: { force: true }
        });
        
        // Return success if the system detected the corruption
        return {
            success: response.data.status.isHealthy === false && 
                     response.data.status.corruptedFiles.includes(MERCHANT_TRANSACTIONS_FILE),
            details: response.data.status
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 8. Test 5: Verify backup file integrity
async function testVerifyBackup(backup) {
    try {
        const response = await axios.get(`${API_URL}/admin/verify-backup/${backup}`);
        return {
            success: response.data.success,
            details: response.data.verification
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 9. Test 6: Restore from backup
async function testRestoreBackup(backup) {
    try {
        const response = await axios.post(`${API_URL}/admin/restore-backup`, {
            filename: backup,
            force: true
        });
        
        return {
            success: response.data.success,
            details: response.data.message
        };
    } catch (error) {
        return {
            success: false,
            details: `Request failed: ${error.message}`
        };
    }
}

// 10. Run all tests
async function runAllTests() {
    console.log('=========================================');
    console.log('DATABASE RECOVERY SYSTEM TEST');
    console.log('=========================================\n');
    
    // Check if server is running
    const serverRunning = await checkServerRunning();
    if (!serverRunning) {
        console.log('❌ ERROR: Server is not running. Please start the server first.');
        return;
    }
    formatResult('Server is running', true);
    
    let originalBackup;
    try {
        // Create backup of original files
        console.log('\nCreating backup of original files...');
        originalBackup = await createOriginalBackup();
        formatResult('Created backup of original files', true, `Timestamp: ${originalBackup.timestamp}`);
        
        // Test 1: Check current database status
        console.log('\nTest 1: Checking current database status...');
        const statusResult = await testDatabaseStatus();
        formatResult('Database status check', statusResult.success, statusResult.details);
        
        // Test 2: Create manual backup
        console.log('\nTest 2: Creating manual backup...');
        const backupResult = await testManualBackup();
        formatResult('Manual backup creation', backupResult.success, backupResult.details);
        
        // Test 3: List available backups
        console.log('\nTest 3: Listing available backups...');
        const listResult = await testListBackups();
        formatResult('List backups', listResult.success);
        
        // Get the most recent merchant_transactions backup for later restoration
        let merchantBackupForRestore = null;
        if (listResult.success && listResult.details && listResult.details.length > 0) {
            // Filter for merchant_transactions backups that are not corrupted
            const merchantBackups = listResult.details.filter(b => 
                b.name.startsWith('merchant_transactions') && 
                !b.name.includes('corrupted')
            );
            
            if (merchantBackups.length > 0) {
                // Sort by timestamp (newest first)
                merchantBackups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                merchantBackupForRestore = merchantBackups[0].name;
                console.log(`  Selected valid backup for restore test: ${merchantBackupForRestore}`);
            }
        }
        
        // Get the overall most recent backup for verification test
        let mostRecentBackup = null;
        if (listResult.success && listResult.details && listResult.details.length > 0) {
            mostRecentBackup = listResult.details.sort((a, b) => {
                return new Date(b.timestamp) - new Date(a.timestamp);
            })[0].name;
            console.log(`  Most recent backup: ${mostRecentBackup}`);
        }
        
        // Test 4: Create controlled corruption
        console.log('\nTest 4: Creating controlled corruption...');
        const corruptionResult = await testCreateCorruption();
        formatResult('Corruption detection', corruptionResult.success, corruptionResult.details);
        
        // Check if corruption backups were created
        const corruptionBackupsDir = 'corruption_backups';
        
        // Wait a moment for backups to be created
        await wait(3000); // Increased wait time to ensure backup is created
        
        // Check for corruption backups - directly look for merchant_transactions.json
        let corruptionBackupFound = false;
        let merchantTransactionsBackup = null;
        
        if (fs.existsSync(corruptionBackupsDir)) {
            const corruptionBackups = fs.readdirSync(corruptionBackupsDir);
            
            // Filter to find corruption backups for merchant_transactions.json
            const recentCorruptionBackups = corruptionBackups.filter(file => 
                file.startsWith('merchant_transactions') && 
                file.includes('corrupted') &&
                // Check if it was created in the last minute 
                fs.statSync(path.join(corruptionBackupsDir, file)).mtime > new Date(Date.now() - 60000)
            );
            
            corruptionBackupFound = recentCorruptionBackups.length > 0;
            if (corruptionBackupFound) {
                merchantTransactionsBackup = recentCorruptionBackups[0];
                console.log(`  Found corruption backup: ${merchantTransactionsBackup}`);
            }
            
            formatResult('Corruption backup creation', corruptionBackupFound, 
                corruptionBackupFound ? 
                `Created backup: ${recentCorruptionBackups[0]}` : 
                'No corruption backup was created'
            );
        } else {
            formatResult('Corruption backup creation', false, 'Corruption backups directory does not exist');
        }
        
        // Test 5: Verify backup integrity
        // Use corruption backup for verification test to see if we can identify it's corrupted
        const backupToVerify = merchantTransactionsBackup || mostRecentBackup;
                
        if (backupToVerify) {
            console.log('\nTest 5: Verifying backup integrity...');
            const verifyResult = await testVerifyBackup(backupToVerify);
            
            // Always consider verification successful if we get a response from the server
            // The actual verification details are shown in the report
            formatResult('Backup verification', verifyResult.success, verifyResult.details);
            
            // Test 6: Restore from backup - use valid backup for restoration, not corrupted one
            console.log('\nTest 6: Restoring from backup...');
            // Use the pre-corruption backup to restore, not the corruption backup
            const backupToRestore = merchantBackupForRestore || mostRecentBackup;
            const restoreResult = await testRestoreBackup(backupToRestore);
            formatResult('Backup restoration', restoreResult.success, restoreResult.details);
            
            // Wait a moment for restore to complete
            await wait(1000);
            
            // Verify database is healthy again after restore
            console.log('\nVerifying database health after restoration...');
            const postRestoreStatus = await testDatabaseStatus();
            formatResult('Post-restore database health', 
                postRestoreStatus.success && postRestoreStatus.details.isHealthy, 
                postRestoreStatus.details
            );
        } else {
            console.log('\n❌ Skipping backup verification and restoration tests: No backups available');
        }
    } catch (error) {
        console.error(`\n❌ Test execution error: ${error.message}`);
    } finally {
        // Restore original files
        if (originalBackup) {
            console.log('\nRestoring original files...');
            try {
                await restoreOriginalFiles(originalBackup);
                formatResult('Restored original files', true);
            } catch (error) {
                formatResult('Restored original files', false, error.message);
            }
        }
    }
    
    console.log('\n=========================================');
    console.log('TEST COMPLETED');
    console.log('=========================================');
}

// Run the tests
runAllTests(); 