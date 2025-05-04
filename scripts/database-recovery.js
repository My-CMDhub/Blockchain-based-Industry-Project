#!/usr/bin/env node

/**
 * Database Recovery Utility
 * 
 * This script is used to recover a corrupted database by restoring it from a backup.
 * It can be used in emergency situations when the database becomes corrupted.
 * 
 * Features:
 * - Lists available backups
 * - Checks database health
 * - Restores from a specific backup or the most recent healthy backup
 * - Creates a backup of the current state before restoration
 * 
 * Usage:
 *   node scripts/database-recovery.js [command] [options]
 * 
 * Commands:
 *   check    - Check database health
 *   list     - List available backups
 *   restore  - Restore from backup
 * 
 * Options for 'restore':
 *   --file=FILENAME    - Specify backup file to restore from
 *   --auto             - Automatically choose the most recent healthy backup
 *   --force            - Force restoration even if backup validation fails
 *   --no-backup        - Skip creating a backup before restoration
 * 
 * Examples:
 *   node scripts/database-recovery.js check
 *   node scripts/database-recovery.js list
 *   node scripts/database-recovery.js restore --file=merchant_transactions.json.scheduled.2025-05-04.bak
 *   node scripts/database-recovery.js restore --auto
 */

const fs = require('fs');
const path = require('path');
const { secureReadFile } = require('../server/utils/fileUtils');
const {
    checkDatabaseStatus,
    getAvailableBackups,
    backupAllDatabaseFiles,
    restoreDatabaseFromBackup,
    verifyBackupIntegrity,
    CRITICAL_DB_FILES
} = require('../server/utils/databaseMonitor');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'check';
const options = {};

// Parse options
for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
        const parts = arg.substring(2).split('=');
        if (parts.length === 2) {
            options[parts[0]] = parts[1];
        } else {
            options[parts[0]] = true;
        }
    }
}

// Utility: Format date for display
function formatDate(date) {
    return new Date(date).toLocaleString();
}

// Utility: Format file size for display
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Utility: Log with timestamp
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Utility: Display JSON data (pretty-printed)
function displayJson(data) {
    console.log(JSON.stringify(data, null, 2));
}

// Command: Check database health
async function checkHealth() {
    console.log('\n=========================================');
    console.log('DATABASE HEALTH CHECK');
    console.log('=========================================\n');
    
    // Check database status
    const status = checkDatabaseStatus(true);
    
    console.log('DATABASE STATUS:');
    console.log('--------------------------');
    console.log(`Is Healthy: ${status.isHealthy ? '✅ Yes' : '❌ No'}`);
    console.log(`Last Checked: ${formatDate(status.lastChecked)}`);
    
    if (status.corruptedFiles.length > 0) {
        console.log('\nCORRUPTED FILES:');
        console.log('--------------------------');
        status.corruptedFiles.forEach(file => {
            console.log(`❌ ${file}`);
        });
    }
    
    if (status.missingFiles.length > 0) {
        console.log('\nMISSING FILES:');
        console.log('--------------------------');
        status.missingFiles.forEach(file => {
            console.log(`❌ ${file}`);
        });
    }
    
    if (status.issues.length > 0) {
        console.log('\nISSUES:');
        console.log('--------------------------');
        status.issues.forEach(issue => {
            console.log(`- ${issue}`);
        });
    }
    
    // Check current files
    console.log('\nDATABASE FILES:');
    console.log('--------------------------');
    for (const dbFile of CRITICAL_DB_FILES) {
        const filePath = dbFile.path;
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const fileContent = secureReadFile(filePath);
            const preview = fileContent ? (fileContent.substring(0, 50) + '...') : '(empty)';
            
            console.log(`${status.corruptedFiles.includes(filePath) ? '❌' : '✅'} ${filePath}`);
            console.log(`   Size: ${formatFileSize(stats.size)}, Modified: ${formatDate(stats.mtime)}`);
            console.log(`   Preview: ${preview}\n`);
        } else {
            console.log(`❌ ${filePath} (missing)`);
        }
    }
    
    // Check backups
    const backups = getAvailableBackups();
    
    console.log('\nBACKUP STATUS:');
    console.log('--------------------------');
    if (backups.length === 0) {
        console.log('No backups found');
    } else {
        const backupsByType = {};
        
        backups.forEach(backup => {
            if (!backupsByType[backup.type]) {
                backupsByType[backup.type] = [];
            }
            backupsByType[backup.type].push(backup);
        });
        
        for (const type in backupsByType) {
            console.log(`${type} backups: ${backupsByType[type].length}`);
            
            // Show the 5 most recent backups of this type
            backupsByType[type]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 5)
                .forEach(backup => {
                    console.log(`   - ${backup.name} (${formatDate(backup.timestamp)})`);
                });
        }
    }
    
    console.log('\n=========================================');
    
    return status.isHealthy;
}

// Command: List available backups
async function listBackups() {
    console.log('\n=========================================');
    console.log('AVAILABLE BACKUPS');
    console.log('=========================================\n');
    
    const backups = getAvailableBackups();
    
    if (backups.length === 0) {
        console.log('No backups found');
        return;
    }
    
    // Group backups by original file
    const backupsByFile = {};
    
    backups.forEach(backup => {
        const originalFile = backup.name.split('.')[0];
        
        if (!backupsByFile[originalFile]) {
            backupsByFile[originalFile] = [];
        }
        
        backupsByFile[originalFile].push(backup);
    });
    
    // Display backups grouped by file
    for (const file in backupsByFile) {
        console.log(`\n${file} backups:`);
        console.log('--------------------------');
        
        backupsByFile[file]
            .sort((a, b) => b.timestamp - a.timestamp)
            .forEach(backup => {
                const verification = verifyBackupIntegrity(backup);
                console.log(`${verification.valid ? '✅' : '❌'} ${backup.name}`);
                console.log(`   Type: ${backup.type}, Size: ${formatFileSize(backup.size)}`);
                console.log(`   Created: ${formatDate(backup.timestamp)}`);
                console.log(`   Path: ${backup.path}`);
                if (!verification.valid) {
                    console.log(`   Issues: ${verification.error}`);
                }
                console.log('');
            });
    }
    
    console.log('=========================================');
    
    return backups;
}

// Command: Restore from backup
async function restoreBackup() {
    console.log('\n=========================================');
    console.log('DATABASE RESTORATION');
    console.log('=========================================\n');
    
    // Create a backup of the current state before restoration (unless --no-backup is specified)
    if (!options['no-backup']) {
        log('Creating pre-restoration backup...');
        const backups = backupAllDatabaseFiles('pre-restore');
        
        log(`Created ${Object.keys(backups).length} backup files`);
    } else {
        log('WARNING: Skipping pre-restoration backup as requested');
    }
    
    const backups = getAvailableBackups();
    
    if (backups.length === 0) {
        log('ERROR: No backups found');
        return false;
    }
    
    // Find the backup to restore
    let backupToRestore = null;
    
    if (options.file) {
        // Restore from specific file
        backupToRestore = backups.find(b => b.name === options.file);
        
        if (!backupToRestore) {
            log(`ERROR: Backup file '${options.file}' not found`);
            
            // Show available backup files
            log('Available backup files:');
            backups
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10)
                .forEach(b => {
                    log(`  - ${b.name}`);
                });
            
            return false;
        }
    } else if (options.auto) {
        // Auto-select most recent healthy backup
        log('Searching for most recent healthy backup...');
        
        // Group backups by original file
        const backupsByFile = {};
        
        backups.forEach(backup => {
            // Extract original filename
            let originalFile;
            if (backup.name.includes('.corrupted.')) {
                originalFile = backup.name.split('.corrupted.')[0];
            } else {
                originalFile = backup.name.split('.')[0];
            }
            
            if (!backupsByFile[originalFile]) {
                backupsByFile[originalFile] = [];
            }
            
            backupsByFile[originalFile].push(backup);
        });
        
        // Check database status to see which files need restoration
        const status = checkDatabaseStatus(true);
        
        if (status.isHealthy) {
            log('Database is already healthy, no restoration needed');
            return true;
        }
        
        // For each corrupted file, find the most recent healthy backup
        for (const corruptedFile of status.corruptedFiles) {
            const fileBasename = path.basename(corruptedFile);
            const backupsForFile = backupsByFile[fileBasename] || [];
            
            log(`Looking for a healthy backup of ${fileBasename}...`);
            
            // Find the most recent healthy backup for this file
            const healthyBackups = backupsForFile
                .filter(b => {
                    const verification = verifyBackupIntegrity(b);
                    return verification.valid;
                })
                .sort((a, b) => b.timestamp - a.timestamp);
            
            if (healthyBackups.length > 0) {
                backupToRestore = healthyBackups[0];
                log(`Found healthy backup: ${backupToRestore.name} (${formatDate(backupToRestore.timestamp)})`);
                break;
            } else {
                log(`WARNING: No healthy backup found for ${fileBasename}`);
            }
        }
        
        if (!backupToRestore) {
            log('ERROR: No suitable healthy backups found for corrupted files');
            return false;
        }
    } else {
        log('ERROR: Please specify either --file=FILENAME or --auto');
        log('Run the script with --help for usage information');
        return false;
    }
    
    // Verify backup integrity
    log(`Verifying backup integrity: ${backupToRestore.name}`);
    
    const verification = verifyBackupIntegrity(backupToRestore);
    
    if (!verification.valid && !options.force) {
        log(`ERROR: Backup file '${backupToRestore.name}' failed integrity check: ${verification.error}`);
        log('Use --force to restore anyway');
        return false;
    }
    
    if (!verification.valid && options.force) {
        log(`WARNING: Forcing restoration of potentially invalid backup: ${verification.error}`);
    }
    
    // Restore from backup
    log(`Restoring from backup: ${backupToRestore.name}`);
    
    const result = restoreDatabaseFromBackup(backupToRestore.path, options.force);
    
    if (result.success) {
        log(`✅ Successfully restored ${result.file} from backup`);
        
        // Verify database health after restoration
        log('Verifying database health after restoration...');
        const postStatus = checkDatabaseStatus(true);
        
        if (postStatus.isHealthy) {
            log('✅ Database is now healthy');
        } else {
            log('⚠️ Database still has issues after restoration:');
            postStatus.issues.forEach(issue => {
                log(`   - ${issue}`);
            });
        }
        
        return true;
    } else {
        log(`❌ Restoration failed: ${result.error}`);
        return false;
    }
}

// Command: Show help
function showHelp() {
    console.log(`
Database Recovery Utility

Usage:
  node scripts/database-recovery.js [command] [options]

Commands:
  check    - Check database health
  list     - List available backups
  restore  - Restore from backup
  help     - Show this help message

Options for 'restore':
  --file=FILENAME    - Specify backup file to restore from
  --auto             - Automatically choose the most recent healthy backup
  --force            - Force restoration even if backup validation fails
  --no-backup        - Skip creating a backup before restoration

Examples:
  node scripts/database-recovery.js check
  node scripts/database-recovery.js list
  node scripts/database-recovery.js restore --file=merchant_transactions.json.scheduled.2025-05-04.bak
  node scripts/database-recovery.js restore --auto
`);
}

// Main function to execute commands
async function main() {
    try {
        switch (command) {
            case 'check':
                await checkHealth();
                break;
            case 'list':
                await listBackups();
                break;
            case 'restore':
                const success = await restoreBackup();
                process.exit(success ? 0 : 1);
                break;
            case 'help':
                showHelp();
                break;
            default:
                console.log(`Unknown command: ${command}`);
                showHelp();
                process.exit(1);
        }
    } catch (error) {
        console.error(`\nERROR: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run the script
main(); 