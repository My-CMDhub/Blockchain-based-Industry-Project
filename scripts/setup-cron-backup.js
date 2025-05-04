#!/usr/bin/env node

/**
 * Setup Cron Job for Database Backups
 * 
 * This script sets up a cron job to automatically run database backups.
 * By default, it configures a job to run daily at midnight.
 * 
 * Usage:
 *   node scripts/setup-cron-backup.js [options]
 * 
 * Options:
 *   --schedule="0 0 * * *"    Cron schedule expression (default: daily at midnight)
 *   --backup-script=PATH      Path to backup script (default: scripts/backup-database.js)
 *   --user=USERNAME           User to run the cron job as (default: current user)
 *   --help                    Show this help message
 */

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const os = require('os');

// Default configuration
const DEFAULT_CONFIG = {
    schedule: '0 0 * * *', // Daily at midnight
    backupScript: path.join(__dirname, 'backup-database.js'),
    user: process.env.USER || os.userInfo().username
};

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = { ...DEFAULT_CONFIG };
    
    for (const arg of args) {
        if (arg.startsWith('--schedule=')) {
            config.schedule = arg.substring('--schedule='.length);
        } else if (arg.startsWith('--backup-script=')) {
            config.backupScript = arg.substring('--backup-script='.length);
        } else if (arg.startsWith('--user=')) {
            config.user = arg.substring('--user='.length);
        } else if (arg === '--help') {
            showHelp();
            process.exit(0);
        } else {
            console.error(`Unknown option: ${arg}`);
            showHelp();
            process.exit(1);
        }
    }
    
    return config;
}

// Show help message
function showHelp() {
    console.log(`
Setup Cron Job for Database Backups

This script sets up a cron job to automatically run database backups.
By default, it configures a job to run daily at midnight.

Usage:
  node scripts/setup-cron-backup.js [options]

Options:
  --schedule="0 0 * * *"    Cron schedule expression (default: daily at midnight)
  --backup-script=PATH      Path to backup script (default: scripts/backup-database.js)
  --user=USERNAME           User to run the cron job as (default: current user)
  --help                    Show this help message
    `);
}

// Check if backup script exists
function checkBackupScript(scriptPath) {
    if (!fs.existsSync(scriptPath)) {
        console.error(`Backup script does not exist: ${scriptPath}`);
        console.log('Creating backup script...');
        
        // Create backup script with basic functionality
        const backupScriptContent = `#!/usr/bin/env node

/**
 * Database Backup Script
 * 
 * This script creates a backup of all database files.
 * It's designed to be run from a cron job for automated backups.
 */

const path = require('path');
const { backupAllDatabaseFiles } = require(path.join(__dirname, '../server/utils/databaseMonitor'));

// Create backup with 'scheduled' reason
backupAllDatabaseFiles('scheduled')
    .then(backups => {
        console.log('Database backup completed successfully:');
        console.log(backups);
        process.exit(0);
    })
    .catch(error => {
        console.error('Database backup failed:', error);
        process.exit(1);
    });
`;
        
        fs.writeFileSync(scriptPath, backupScriptContent, { mode: 0o755 });
        console.log(`Created backup script at ${scriptPath}`);
    }
}

// Check if running on a system that supports cron
function checkCronSupport() {
    try {
        const cronCheck = execSync('which crontab').toString().trim();
        if (!cronCheck) {
            throw new Error('crontab not found');
        }
        return true;
    } catch (error) {
        console.error('Error: Cron is not supported on this system.');
        console.error('This script requires crontab to set up automated backups.');
        console.error('On Windows, consider using Task Scheduler instead.');
        return false;
    }
}

// Get absolute path for a file
function getAbsolutePath(filePath) {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.resolve(process.cwd(), filePath);
}

// Set up cron job
async function setupCronJob(config) {
    // Make backup script path absolute
    const scriptPath = getAbsolutePath(config.backupScript);
    
    // Check if backup script exists, create if not
    checkBackupScript(scriptPath);
    
    // Make sure script is executable
    fs.chmodSync(scriptPath, '755');
    
    // Get current crontab
    const currentCrontab = await new Promise((resolve, reject) => {
        exec('crontab -l', (error, stdout, stderr) => {
            if (error && error.code !== 1) {
                // Error code 1 means no crontab found, which is okay
                reject(error);
                return;
            }
            resolve(stdout);
        });
    }).catch(() => '');
    
    // The line we want to add
    const cronLine = `${config.schedule} ${process.execPath} ${scriptPath} >> ${path.join(process.cwd(), 'logs/backup.log')} 2>&1`;
    
    // Check if this cron job already exists
    if (currentCrontab.includes(scriptPath)) {
        // Update existing cron job
        const newCrontab = currentCrontab.replace(
            new RegExp(`.*${scriptPath.replace(/\//g, '\\/')}.*`, 'g'),
            cronLine
        );
        
        await writeCrontab(newCrontab);
        console.log('Updated existing cron job for database backups.');
    } else {
        // Add new cron job
        const newCrontab = currentCrontab + (currentCrontab ? '\n' : '') + cronLine + '\n';
        await writeCrontab(newCrontab);
        console.log('Added new cron job for database backups.');
    }
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    console.log(`Cron job configured to run: ${cronLine}`);
}

// Write new crontab
async function writeCrontab(crontabContent) {
    const tempFile = path.join(os.tmpdir(), `crontab-${Date.now()}.txt`);
    await writeFile(tempFile, crontabContent);
    
    return new Promise((resolve, reject) => {
        exec(`crontab ${tempFile}`, (error, stdout, stderr) => {
            // Clean up temp file
            fs.unlinkSync(tempFile);
            
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

// Main function
async function main() {
    console.log('Setup Cron Job for Database Backups');
    console.log('===================================');
    
    // Parse command line arguments
    const config = parseArgs();
    
    // Check if cron is supported
    if (!checkCronSupport()) {
        process.exit(1);
    }
    
    // Set up cron job
    try {
        await setupCronJob(config);
        console.log('\nSuccess! Automated database backups have been configured.');
        console.log(`Backups will run: ${config.schedule} (cron format)`);
        console.log(`Backup script: ${config.backupScript}`);
        console.log('Backup logs will be written to: logs/backup.log');
    } catch (error) {
        console.error('\nError setting up cron job:', error.message);
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
}); 