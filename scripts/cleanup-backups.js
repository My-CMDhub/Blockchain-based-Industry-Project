/**
 * Backup Cleanup Utility
 * 
 * This script cleans up old backup files according to a configurable retention policy:
 * - Keeps all backups from the last 7 days
 * - Keeps weekly backups for the last 4 weeks
 * - Keeps monthly backups for the last 12 months
 * - Keeps yearly backups indefinitely
 * 
 * Run with: node scripts/cleanup-backups.js
 * 
 * Configuration via environment variables:
 * - DAILY_RETENTION_DAYS: Number of days to keep daily backups (default: 7)
 * - WEEKLY_RETENTION_WEEKS: Number of weeks to keep weekly backups (default: 4)
 * - MONTHLY_RETENTION_MONTHS: Number of months to keep monthly backups (default: 12)
 * - BACKUP_DIR: Directory containing backups (default: 'database_backups')
 * - CORRUPTION_BACKUP_DIR: Directory containing corruption backups (default: 'corruption_backups')
 * - DRY_RUN: If set to 'true', show what would be deleted without actually deleting (default: false)
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

// Configuration (from environment or defaults)
const config = {
    dailyRetentionDays: parseInt(process.env.DAILY_RETENTION_DAYS || '7', 10),
    weeklyRetentionWeeks: parseInt(process.env.WEEKLY_RETENTION_WEEKS || '4', 10),
    monthlyRetentionMonths: parseInt(process.env.MONTHLY_RETENTION_MONTHS || '12', 10),
    backupDir: process.env.BACKUP_DIR || 'database_backups',
    corruptionBackupDir: process.env.CORRUPTION_BACKUP_DIR || 'corruption_backups',
    dryRun: process.env.DRY_RUN === 'true'
};

// Get backup timestamp from filename
function getBackupDate(filename) {
    try {
        // Extract ISO timestamp from filename (format: filename.reason.YYYY-MM-DDTHH-MM-SS.MSSZ.bak)
        const timestampMatch = filename.match(/\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)/);
        if (timestampMatch && timestampMatch[1]) {
            // Convert from format with hyphens to valid ISO format
            const isoTimestamp = timestampMatch[1].replace(/-/g, ':');
            return new Date(isoTimestamp);
        }
        return null;
    } catch (error) {
        console.error(`Failed to parse date from filename ${filename}:`, error.message);
        return null;
    }
}

// Determine if a backup should be kept based on retention policy
function shouldKeepBackup(date, now, filename) {
    if (!date) return false;

    const ageInDays = (now - date) / (1000 * 60 * 60 * 24);
    
    // Keep all backups from the last N days
    if (ageInDays < config.dailyRetentionDays) {
        return true;
    }
    
    // For weekly backups, keep the first backup of each week for the last N weeks
    const ageInWeeks = ageInDays / 7;
    if (ageInWeeks < config.weeklyRetentionWeeks) {
        // Check if it's the first backup of the week
        const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
        const hourOfDay = date.getUTCHours();
        // Keep if it's a Monday and early in the day (likely a weekly backup)
        if (dayOfWeek === 1 && hourOfDay < 8) {
            return true;
        }
    }
    
    // For monthly backups, keep the first backup of each month for the last N months
    const ageInMonths = ageInDays / 30.44; // Average days in a month
    if (ageInMonths < config.monthlyRetentionMonths) {
        // Check if it's the first backup of the month
        const dayOfMonth = date.getUTCDate();
        const hourOfDay = date.getUTCHours();
        // Keep if it's the 1st of the month and early in the day
        if (dayOfMonth === 1 && hourOfDay < 8) {
            return true;
        }
    }
    
    // For yearly backups, keep the first backup of each year indefinitely
    const dayOfYear = new Date(date.getUTCFullYear(), 0, 1);
    const nextDay = new Date(dayOfYear);
    nextDay.setDate(dayOfYear.getDate() + 1);
    
    // Check if the backup is the first of the year
    if (date >= dayOfYear && date < nextDay) {
        return true;
    }
    
    // Also keep initial backups indefinitely
    if (filename && filename.includes('.initial.')) {
        return true;
    }
    
    return false;
}

// Process a directory of backups
async function processBackupDirectory(dirPath) {
    console.log(`\nProcessing backup directory: ${dirPath}`);
    
    try {
        // Check if directory exists
        try {
            await stat(dirPath);
        } catch (error) {
            console.log(`Directory ${dirPath} does not exist or is not accessible.`);
            return;
        }
        
        // Read all files in the directory
        const files = await readdir(dirPath);
        const backupFiles = files.filter(file => file.endsWith('.bak'));
        
        if (backupFiles.length === 0) {
            console.log(`No backup files found in ${dirPath}.`);
            return;
        }
        
        console.log(`Found ${backupFiles.length} backup files.`);
        
        // Get current date for age calculations
        const now = new Date();
        
        // Group files by their base name (before the timestamp)
        const fileGroups = {};
        
        backupFiles.forEach(file => {
            // Extract base name (everything before the timestamp)
            const baseName = file.split('.').slice(0, -4).join('.');
            if (!fileGroups[baseName]) {
                fileGroups[baseName] = [];
            }
            
            const date = getBackupDate(file);
            fileGroups[baseName].push({
                filename: file,
                date,
                fullPath: path.join(dirPath, file)
            });
        });
        
        // Process each group of files
        let totalDeleted = 0;
        let totalKept = 0;
        
        for (const [baseName, files] of Object.entries(fileGroups)) {
            console.log(`\nProcessing backup group: ${baseName}`);
            
            // Sort files by date (newest first)
            files.sort((a, b) => {
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date - a.date;
            });
            
            // Determine which files to keep and which to delete
            const filesToDelete = [];
            const filesToKeep = [];
            
            files.forEach(file => {
                if (!file.date) {
                    // If we couldn't parse the date, keep the file to be safe
                    filesToKeep.push(file);
                    return;
                }
                
                // Apply retention policy
                if (shouldKeepBackup(file.date, now, file.filename)) {
                    filesToKeep.push(file);
                } else {
                    filesToDelete.push(file);
                }
            });
            
            // Log and delete files
            if (filesToDelete.length > 0) {
                console.log(`Deleting ${filesToDelete.length} old backups for ${baseName}:`);
                
                for (const file of filesToDelete) {
                    const ageInDays = (now - file.date) / (1000 * 60 * 60 * 24);
                    console.log(`  - ${file.filename} (${ageInDays.toFixed(1)} days old)`);
                    
                    if (!config.dryRun) {
                        try {
                            await unlink(file.fullPath);
                        } catch (error) {
                            console.error(`    Failed to delete ${file.filename}: ${error.message}`);
                        }
                    }
                }
                
                totalDeleted += filesToDelete.length;
            }
            
            console.log(`Keeping ${filesToKeep.length} backups for ${baseName}.`);
            totalKept += filesToKeep.length;
        }
        
        if (config.dryRun) {
            console.log(`\nDRY RUN SUMMARY: Would delete ${totalDeleted} files and keep ${totalKept} files.`);
        } else {
            console.log(`\nCleanup complete: Deleted ${totalDeleted} files and kept ${totalKept} files.`);
        }
    } catch (error) {
        console.error(`Error processing directory ${dirPath}:`, error);
    }
}

// Main function
async function main() {
    console.log('=========================================');
    console.log('BACKUP CLEANUP UTILITY');
    console.log('=========================================');
    
    if (config.dryRun) {
        console.log('\nRunning in DRY RUN mode - no files will be deleted.');
    }
    
    console.log('\nRetention Policy:');
    console.log(`- Keep all backups from the last ${config.dailyRetentionDays} days`);
    console.log(`- Keep weekly backups for the last ${config.weeklyRetentionWeeks} weeks`);
    console.log(`- Keep monthly backups for the last ${config.monthlyRetentionMonths} months`);
    console.log('- Keep yearly backups indefinitely');
    console.log('- Keep initial backups indefinitely');
    
    // Process regular backup directory
    await processBackupDirectory(config.backupDir);
    
    // Process corruption backup directory
    await processBackupDirectory(config.corruptionBackupDir);
    
    console.log('\n=========================================');
    console.log('CLEANUP COMPLETED');
    console.log('=========================================');
}

// Run the cleanup
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
}); 