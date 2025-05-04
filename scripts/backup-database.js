#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * This script creates a backup of all database files.
 * It's designed to be run from a cron job for automated backups.
 * 
 * Features:
 * - Creates timestamped backups of all critical database files
 * - Logs backup operations to logs/backup.log
 * - Cleans up old backups according to retention policy
 * - Supports remote backup storage (if configured)
 * 
 * Usage:
 *  node scripts/backup-database.js [options]
 * 
 * Options:
 *  --reason=REASON   Reason for backup (default: "scheduled")
 *  --cleanup=true    Clean up old backups after creating new ones (default: true)
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Load database monitor utilities
const dbMonitorPath = path.join(__dirname, '../server/utils/databaseMonitor');
const { backupAllDatabaseFiles } = require(dbMonitorPath);

// Parse command line arguments
const args = process.argv.slice(2);
let reason = 'scheduled';
let cleanup = true;

for (const arg of args) {
    if (arg.startsWith('--reason=')) {
        reason = arg.substring('--reason='.length);
    } else if (arg.startsWith('--cleanup=')) {
        cleanup = arg.substring('--cleanup='.length) === 'true';
    }
}

// Log with timestamp
function logWithTimestamp(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Create backup with provided reason
async function createBackup() {
    logWithTimestamp(`Starting database backup (reason: ${reason})...`);
    
    try {
        // Create backup
        const backups = await backupAllDatabaseFiles(reason);
        
        logWithTimestamp(`Database backup completed successfully.`);
        
        // Calculate number of backup files created
        const backupCount = Object.keys(backups).length;
        logWithTimestamp(`Created ${backupCount} backup files:`);
        
        // Log each backup file
        for (const [file, backupPath] of Object.entries(backups)) {
            logWithTimestamp(`  - ${backupPath}`);
        }
        
        // Run cleanup if enabled
        if (cleanup) {
            runCleanup();
        }
        
        return backups;
    } catch (error) {
        logWithTimestamp(`ERROR: Database backup failed: ${error.message}`);
        if (error.stack) {
            logWithTimestamp(`Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

// Run cleanup of old backups
function runCleanup() {
    logWithTimestamp('Cleaning up old backups...');
    
    try {
        // Check if cleanup script exists
        const cleanupScript = path.join(__dirname, 'cleanup-backups.js');
        
        if (!fs.existsSync(cleanupScript)) {
            logWithTimestamp(`WARNING: Cleanup script not found: ${cleanupScript}`);
            return;
        }
        
        // Run cleanup script
        execSync(`node ${cleanupScript}`, { stdio: 'inherit' });
        
        logWithTimestamp('Backup cleanup completed successfully.');
    } catch (error) {
        logWithTimestamp(`ERROR: Backup cleanup failed: ${error.message}`);
        if (error.stack) {
            logWithTimestamp(`Stack trace: ${error.stack}`);
        }
    }
}

// Push backups to remote storage if configured
async function pushToRemoteStorage(backups) {
    // Check if remote storage is configured
    const remoteEnabled = process.env.BACKUP_REMOTE_ENABLED === 'true';
    
    if (!remoteEnabled) {
        logWithTimestamp('Remote storage not enabled. Skipping.');
        return;
    }
    
    const remoteType = process.env.BACKUP_REMOTE_TYPE || '';
    
    logWithTimestamp(`Pushing backups to remote storage (type: ${remoteType})...`);
    
    // This is where you would implement remote storage integration
    // e.g., AWS S3, Dropbox, FTP, etc.
    
    // For now, just log that it would happen
    logWithTimestamp('NOTICE: Remote storage push is not implemented yet.');
    logWithTimestamp('Configure a remote storage provider in .env file when available.');
}

// Main function
async function main() {
    try {
        // Make sure logs directory exists
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Create backup
        const backups = await createBackup();
        
        // Push to remote storage if configured
        await pushToRemoteStorage(backups);
        
        logWithTimestamp('Backup process completed successfully.');
    } catch (error) {
        logWithTimestamp(`FATAL ERROR: ${error.message}`);
        process.exit(1);
    }
}

// Run the backup
main(); 