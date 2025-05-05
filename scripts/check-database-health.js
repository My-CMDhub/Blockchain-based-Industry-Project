#!/usr/bin/env node

/**
 * Database Health Check Utility
 * 
 * This script checks the health of the database and provides a summary 
 * of backups. It's useful for quick verification of system status.
 * 
 * Run with: node scripts/check-database-health.js
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Import database monitoring utilities
const dbMonitorPath = path.join(__dirname, '../server/utils/databaseMonitor');
const { checkDatabaseStatus, getAvailableBackups } = require(dbMonitorPath);

// Configuration
const DATABASE_FILES = [
    'merchant_transactions.json',
    'Json/keys.json',
    'address_index_map.json',
    'payment_requests.json'
];

const BACKUP_DIRS = [
    'database_backups',
    'corruption_backups'
];

// Format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Format date
function formatDate(date) {
    return new Date(date).toLocaleString();
}

// Check database files
async function checkDatabaseFiles() {
    console.log('\nDATABASE FILES:');
    console.log('------------------------');
    
    let totalSize = 0;
    let filesOk = 0;
    let filesMissing = 0;
    
    for (const file of DATABASE_FILES) {
        try {
            const filePath = path.join(__dirname, '..', file);
            const stats = await stat(filePath);
            const size = stats.size;
            totalSize += size;
            
            const lastModified = stats.mtime;
            const ageInDays = (Date.now() - lastModified) / (1000 * 60 * 60 * 24);
            
            // Read first few bytes to validate it's not empty
            let preview = '';
            try {
                const buffer = Buffer.alloc(50);
                const fd = fs.openSync(filePath, 'r');
                fs.readSync(fd, buffer, 0, 50, 0);
                fs.closeSync(fd);
                preview = buffer.toString().trim().replace(/[\n\r]/g, ' ');
            } catch (err) {
                preview = 'Error reading file';
            }
            
            console.log(`✅ ${file}`);
            console.log(`   Size: ${formatSize(size)}, Modified: ${formatDate(lastModified)} (${ageInDays.toFixed(1)} days ago)`);
            console.log(`   Preview: ${preview}${preview.length >= 50 ? '...' : ''}`);
            filesOk++;
        } catch (error) {
            console.log(`❌ ${file}`);
            console.log(`   Error: ${error.message}`);
            filesMissing++;
        }
    }
    
    console.log('\nSummary:');
    console.log(`Total size: ${formatSize(totalSize)}`);
    console.log(`Files OK: ${filesOk}/${DATABASE_FILES.length}`);
    if (filesMissing > 0) {
        console.log(`⚠️ Missing files: ${filesMissing}`);
    }
}

// Check database integrity
async function checkDatabaseIntegrity() {
    console.log('\nDATABASE INTEGRITY:');
    console.log('------------------------');
    
    try {
        const status = checkDatabaseStatus(true); // Force fresh check
        
        if (status.isHealthy) {
            console.log('✅ Database is healthy');
        } else {
            console.log('❌ Database has issues:');
            
            if (status.missingFiles.length > 0) {
                console.log(`   Missing files: ${status.missingFiles.join(', ')}`);
            }
            
            if (status.corruptedFiles.length > 0) {
                console.log(`   Corrupted files: ${status.corruptedFiles.join(', ')}`);
            }
            
            if (status.issues.length > 0) {
                console.log('   Issues:');
                status.issues.forEach(issue => {
                    console.log(`   - ${issue}`);
                });
            }
        }
        
        console.log(`Last checked: ${formatDate(status.lastChecked)}`);
    } catch (error) {
        console.log(`❌ Error checking database integrity: ${error.message}`);
    }
}

// Check backups
async function checkBackups() {
    console.log('\nBACKUP STATUS:');
    console.log('------------------------');
    
    let totalBackups = 0;
    let totalSize = 0;
    let oldestBackup = null;
    let newestBackup = null;
    
    for (const dir of BACKUP_DIRS) {
        try {
            const dirPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(dirPath)) {
                console.log(`Directory not found: ${dir}`);
                continue;
            }
            
            const files = await readdir(dirPath);
            const backupFiles = files.filter(file => file.endsWith('.bak'));
            
            if (backupFiles.length === 0) {
                console.log(`No backups found in ${dir}`);
                continue;
            }
            
            let dirSize = 0;
            for (const file of backupFiles) {
                const filePath = path.join(dirPath, file);
                try {
                    const stats = await stat(filePath);
                    dirSize += stats.size;
                    
                    // Track oldest and newest backups
                    if (!oldestBackup || stats.mtime < oldestBackup.time) {
                        oldestBackup = { file, time: stats.mtime, dir };
                    }
                    if (!newestBackup || stats.mtime > newestBackup.time) {
                        newestBackup = { file, time: stats.mtime, dir };
                    }
                } catch (error) {
                    // Skip file if can't stat
                }
            }
            
            totalBackups += backupFiles.length;
            totalSize += dirSize;
            
            console.log(`${dir}: ${backupFiles.length} backups, ${formatSize(dirSize)}`);
        } catch (error) {
            console.log(`Error checking backups in ${dir}: ${error.message}`);
        }
    }
    
    if (totalBackups > 0) {
        console.log('\nBackup Summary:');
        console.log(`Total backups: ${totalBackups}`);
        console.log(`Total size: ${formatSize(totalSize)}`);
        
        if (oldestBackup) {
            console.log(`Oldest backup: ${oldestBackup.file} (${formatDate(oldestBackup.time)}) in ${oldestBackup.dir}`);
        }
        
        if (newestBackup) {
            console.log(`Newest backup: ${newestBackup.file} (${formatDate(newestBackup.time)}) in ${newestBackup.dir}`);
        }
    } else {
        console.log('⚠️ No backups found');
    }
}

// Main function
async function main() {
    console.log('=========================================');
    console.log('DATABASE HEALTH CHECK');
    console.log('=========================================');
    
    try {
        // Check database files
        await checkDatabaseFiles();
        
        // Check database integrity
        await checkDatabaseIntegrity();
        
        // Check backups
        await checkBackups();
        
        console.log('\n=========================================');
        console.log('HEALTH CHECK COMPLETED');
        console.log('=========================================');
    } catch (error) {
        console.error('\nFATAL ERROR:', error);
    }
}

// Run the health check
main().catch(console.error); 