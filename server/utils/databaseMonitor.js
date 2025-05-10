const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { secureReadFile, secureWriteFile } = require('./fileUtils');
const { logToFile } = require('./logger');

// List of critical database files to monitor
const CRITICAL_DB_FILES = [
    {
        path: 'merchant_transactions.json',
        required: true,
        validator: validateTransactionFile,
        defaultContent: '[]'
    },
    {
        path: 'Json/keys.json',
        required: true,
        validator: validateKeysFile,
        defaultContent: '{"mnemonic":"","activeAddresses":{}}'
    },
    {
        path: 'address_index_map.json',
        required: false,
        validator: validateAddressMapFile,
        defaultContent: '{}'
    },
   
];

// Configuration for backup system
const BACKUP_CONFIG = {
    backupDir: 'database_backups',
    maxBackups: 30, // Keep last 30 days of backups
    backupFrequency: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    corruptionBackupDir: 'corruption_backups'
};

// Database status cache to avoid excessive file reads
let dbStatusCache = null;
let dbStatusCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Checks the integrity of all database files
 * @param {boolean} forceCheck - Force a fresh check instead of using cached status
 * @returns {Object} Object containing database status information
 */
function checkDatabaseStatus(forceCheck = false) {
    // Return cached status if available and not expired
    const now = Date.now();
    if (!forceCheck && dbStatusCache && (now - dbStatusCacheTime < CACHE_TTL)) {
        return dbStatusCache;
    }

    const status = {
        isHealthy: true,
        corruptedFiles: [],
        missingFiles: [],
        issues: [],
        lastChecked: new Date().toISOString()
    };

    // Check each critical file
    for (const dbFile of CRITICAL_DB_FILES) {
        try {
            const filePath = dbFile.path;
            const exists = fs.existsSync(filePath);

            if (!exists) {
                status.missingFiles.push(filePath);
                status.issues.push(`Missing database file: ${filePath}`);
                status.isHealthy = false;
                
                if (dbFile.required) {
                    logToFile(`CRITICAL: Required database file missing: ${filePath}`);
                } else {
                    logToFile(`WARNING: Non-critical database file missing: ${filePath}`);
                }
                continue;
            }

            // Read the file
            const fileContent = secureReadFile(filePath);
            if (!fileContent || !fileContent.trim()) {
                status.corruptedFiles.push(filePath);
                status.issues.push(`Empty database file: ${filePath}`);
                status.isHealthy = false;
                logToFile(`WARNING: Database file is empty: ${filePath}`);
                
                // Create a backup of the empty file
                backupDatabaseFile(filePath, 'corrupted');
                
                continue;
            }

            // Validate the file structure
            const validationResult = dbFile.validator(fileContent);
            if (!validationResult.valid) {
                status.corruptedFiles.push(filePath);
                status.issues.push(`Corrupted database file: ${filePath} - ${validationResult.error}`);
                status.isHealthy = false;
                logToFile(`CRITICAL: Database file corrupted: ${filePath} - ${validationResult.error}`);
                
                // Create a backup of the corrupted file
                backupDatabaseFile(filePath, 'corrupted');
            }
        } catch (error) {
            status.corruptedFiles.push(dbFile.path);
            status.issues.push(`Error checking database file '${dbFile.path}': ${error.message}`);
            status.isHealthy = false;
            logToFile(`ERROR: Failed to check database file '${dbFile.path}': ${error.message}`);
            
            // Try to create a backup even if there was an error
            try {
                if (fs.existsSync(dbFile.path)) {
                    backupDatabaseFile(dbFile.path, 'corrupted');
                }
            } catch (backupError) {
                logToFile(`ERROR: Failed to backup corrupted file '${dbFile.path}': ${backupError.message}`);
            }
        }
    }

    // Cache the status
    dbStatusCache = status;
    dbStatusCacheTime = now;

    return status;
}

/**
 * Validates transaction file structure
 * @param {string} fileContent - File content to validate
 * @returns {Object} Validation result
 */
function validateTransactionFile(fileContent) {
    try {
        const data = JSON.parse(fileContent);
        if (!Array.isArray(data)) {
            return { valid: false, error: 'File must contain a JSON array' };
        }
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
}

/**
 * Validates keys file structure
 * @param {string} fileContent - File content to validate
 * @returns {Object} Validation result
 */
function validateKeysFile(fileContent) {
    try {
        const data = JSON.parse(fileContent);
        if (typeof data !== 'object') {
            return { valid: false, error: 'File must contain a JSON object' };
        }
        // Basic validation of keys.json structure
        if (data.mnemonic === undefined) {
            return { valid: false, error: 'Missing "mnemonic" field' };
        }
        if (!data.activeAddresses || typeof data.activeAddresses !== 'object') {
            return { valid: false, error: 'Missing or invalid "activeAddresses" field' };
        }
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
}

/**
 * Validates address map file structure
 * @param {string} fileContent - File content to validate
 * @returns {Object} Validation result
 */
function validateAddressMapFile(fileContent) {
    try {
        const data = JSON.parse(fileContent);
        if (typeof data !== 'object') {
            return { valid: false, error: 'File must contain a JSON object' };
        }
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
}

/**
 * Validates payment request file structure
 * @param {string} fileContent - File content to validate
 * @returns {Object} Validation result
 */
function validatePaymentRequestFile(fileContent) {
    try {
        const data = JSON.parse(fileContent);
        if (!Array.isArray(data)) {
            return { valid: false, error: 'File must contain a JSON array' };
        }
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Invalid JSON: ${error.message}` };
    }
}

/**
 * Creates a backup of a database file
 * @param {string} filePath - Path to the file to backup
 * @param {string} reason - Reason for the backup (e.g. 'corrupted', 'scheduled')
 * @returns {string|null} Path to the backup file or null if backup failed
 */
function backupDatabaseFile(filePath, reason = 'scheduled') {
    try {
        if (!fs.existsSync(filePath)) {
            logToFile(`Cannot backup non-existent file: ${filePath}`);
            return null;
        }

        // Determine backup directory based on reason
        const backupDir = reason === 'corrupted' 
            ? BACKUP_CONFIG.corruptionBackupDir 
            : BACKUP_CONFIG.backupDir;
        
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            try {
                fs.mkdirSync(backupDir, { recursive: true });
                logToFile(`Created backup directory: ${backupDir}`);
            } catch (dirError) {
                logToFile(`ERROR: Failed to create backup directory '${backupDir}': ${dirError.message}`);
                // Fallback to using the main backup directory
                if (reason === 'corrupted' && !fs.existsSync(BACKUP_CONFIG.backupDir)) {
                    fs.mkdirSync(BACKUP_CONFIG.backupDir, { recursive: true });
                }
                // If corrupted, use the main backup directory instead
                if (reason === 'corrupted') {
                    logToFile(`Falling back to main backup directory: ${BACKUP_CONFIG.backupDir}`);
                    backupDir = BACKUP_CONFIG.backupDir;
                }
            }
        }

        // Generate backup filename with timestamp
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const fileName = path.basename(filePath);
        const backupFileName = `${fileName}.${reason}.${timestamp}.bak`;
        const backupFilePath = path.join(backupDir, backupFileName);

        // Copy the file
        fs.copyFileSync(filePath, backupFilePath);
        
        // Verify the backup was created
        if (fs.existsSync(backupFilePath)) {
            logToFile(`Created ${reason} backup: ${backupFilePath}`);
            return backupFilePath;
        } else {
            logToFile(`ERROR: Backup file was not created: ${backupFilePath}`);
            return null;
        }
    } catch (error) {
        logToFile(`ERROR: Failed to backup database file '${filePath}': ${error.message}`);
        if (error.stack) {
            logToFile(`Stack trace: ${error.stack}`);
        }
        return null;
    }
}

/**
 * Creates a backup of all critical database files
 * @param {string} reason - Reason for the backup
 * @returns {Object} Object containing paths to all backup files
 */
function backupAllDatabaseFiles(reason = 'scheduled') {
    const backups = {};
    
    for (const dbFile of CRITICAL_DB_FILES) {
        if (fs.existsSync(dbFile.path)) {
            const backupPath = backupDatabaseFile(dbFile.path, reason);
            if (backupPath) {
                backups[dbFile.path] = backupPath;
            }
        }
    }
    
    return backups;
}

/**
 * Cleans up old backups to prevent disk space issues
 * @returns {number} Number of backups removed
 */
function cleanupOldBackups() {
    try {
        if (!fs.existsSync(BACKUP_CONFIG.backupDir)) {
            return 0;
        }

        // Get all backup files in backup directory
        const files = fs.readdirSync(BACKUP_CONFIG.backupDir)
            .filter(file => file.endsWith('.bak'))
            .map(file => ({
                name: file,
                path: path.join(BACKUP_CONFIG.backupDir, file),
                time: fs.statSync(path.join(BACKUP_CONFIG.backupDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by modification time, newest first

        // Keep only the maximum number of backups
        const filesToRemove = files.slice(BACKUP_CONFIG.maxBackups);
        
        // Remove excess backups
        let removed = 0;
        for (const file of filesToRemove) {
            try {
                fs.unlinkSync(file.path);
                removed++;
            } catch (error) {
                logToFile(`ERROR: Failed to remove old backup '${file.path}': ${error.message}`);
            }
        }

        return removed;
    } catch (error) {
        logToFile(`ERROR: Failed to clean up old backups: ${error.message}`);
        return 0;
    }
}

/**
 * Returns a list of available backups
 * @returns {Array} Array of backup file information
 */
function getAvailableBackups() {
    const backups = [];

    try {
        // Check scheduled backups directory
        if (fs.existsSync(BACKUP_CONFIG.backupDir)) {
            const scheduledFiles = fs.readdirSync(BACKUP_CONFIG.backupDir)
                .filter(file => file.endsWith('.bak'))
                .map(file => ({
                    name: file,
                    path: path.join(BACKUP_CONFIG.backupDir, file),
                    type: 'scheduled',
                    timestamp: fs.statSync(path.join(BACKUP_CONFIG.backupDir, file)).mtime,
                    size: fs.statSync(path.join(BACKUP_CONFIG.backupDir, file)).size
                }));
            
            backups.push(...scheduledFiles);
        }

        // Check corruption backups directory
        if (fs.existsSync(BACKUP_CONFIG.corruptionBackupDir)) {
            const corruptionFiles = fs.readdirSync(BACKUP_CONFIG.corruptionBackupDir)
                .filter(file => file.endsWith('.bak'))
                .map(file => ({
                    name: file,
                    path: path.join(BACKUP_CONFIG.corruptionBackupDir, file),
                    type: 'corruption',
                    timestamp: fs.statSync(path.join(BACKUP_CONFIG.corruptionBackupDir, file)).mtime,
                    size: fs.statSync(path.join(BACKUP_CONFIG.corruptionBackupDir, file)).size
                }));
            
            backups.push(...corruptionFiles);
        }

        // Sort by timestamp, newest first
        backups.sort((a, b) => b.timestamp - a.timestamp);
        
        return backups;
    } catch (error) {
        logToFile(`ERROR: Failed to get available backups: ${error.message}`);
        return [];
    }
}

/**
 * Validates a backup file
 * @param {string} filePath - Path to the backup file
 * @returns {Object} Validation result
 */
function validateBackupFile(filePath) {
    try {
        // Extract the original database filename from the backup filename
        const backupFileName = path.basename(filePath);
        const match = backupFileName.match(/^([^.]+)/);
        
        if (!match) {
            return { valid: false, error: 'Invalid backup filename format' };
        }
        
        const originalFileName = match[1];
        
        // Find the corresponding database file configuration
        // First try exact path match
        let dbFileConfig = CRITICAL_DB_FILES.find(file => 
            path.basename(file.path) === originalFileName
        );
        
        // If not found, try to match just the filename without the path
        if (!dbFileConfig) {
            dbFileConfig = CRITICAL_DB_FILES.find(file => {
                // For paths like Json/keys.json, check for 'keys.json'
                return path.basename(file.path) === originalFileName || 
                       path.basename(file.path).includes(originalFileName);
            });
        }
        
        if (!dbFileConfig) {
            return { valid: false, error: 'Unknown database file type' };
        }
        
        // Read and validate the backup file content
        const fileContent = secureReadFile(filePath);
        if (!fileContent || !fileContent.trim()) {
            return { valid: false, error: 'Backup file is empty' };
        }
        
        // Mark backups as always valid if they pass basic format check
        try {
            JSON.parse(fileContent);
            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Invalid JSON in backup: ${error.message}` };
        }
    } catch (error) {
        return { valid: false, error: `Failed to validate backup file: ${error.message}` };
    }
}

/**
 * Restores a database file from a backup
 * @param {string} backupFilePath - Path to the backup file
 * @param {boolean} force - Force restore even if validation fails
 * @returns {Object} Restore result
 */
function restoreDatabaseFromBackup(backupFilePath, force = false) {
    try {
        // Skip validation if force is true
        if (!force) {
            // Validate the backup file
            const validationResult = validateBackupFile(backupFilePath);
            if (!validationResult.valid) {
                return { 
                    success: false, 
                    error: `Invalid backup file: ${validationResult.error}` 
                };
            }
        }
        
        // Extract the original database filename from the backup filename
        const backupFileName = path.basename(backupFilePath);
        
        // For corruption backups, handle the special corrupted reason in the filename
        // Format is typically: original_file.corrupted.timestamp.bak
        let originalFileName;
        
        // If this is a corruption backup (contains 'corrupted' in the name)
        if (backupFileName.includes('corrupted')) {
            // Get the part before .corrupted
            originalFileName = backupFileName.split('.corrupted')[0];
            logToFile(`Identified corruption backup for: ${originalFileName}`);
        } else {
            // Standard backup extraction
            const match = backupFileName.match(/^([^.]+)/);
            if (!match) {
                return { success: false, error: 'Invalid backup filename format' };
            }
            originalFileName = match[1];
        }
        
        // Find the corresponding database file configuration
        let dbFileConfig = null;
        
        // Direct exact match first
        for (const file of CRITICAL_DB_FILES) {
            if (path.basename(file.path) === originalFileName) {
                dbFileConfig = file;
                break;
            }
        }
        
        // If not found, check if it's keys.json which has a special path
        if (!dbFileConfig && originalFileName === 'keys') {
            dbFileConfig = CRITICAL_DB_FILES.find(file => file.path === 'Json/keys.json');
        }
        
        // If still not found, look for partial matches or name inclusion
        if (!dbFileConfig) {
            for (const file of CRITICAL_DB_FILES) {
                const basename = path.basename(file.path);
                // Check for substring matches in either direction
                if (basename.includes(originalFileName) || originalFileName.includes(basename)) {
                    dbFileConfig = file;
                    logToFile(`Found partial match: ${basename} for ${originalFileName}`);
                    break;
                }
            }
        }
        
        // Last resort - use best guess with similarity scoring
        if (!dbFileConfig) {
            let bestMatch = null;
            let bestScore = 0;
            
            for (const file of CRITICAL_DB_FILES) {
                const basename = path.basename(file.path);
                // Calculate a simple similarity score
                let score = 0;
                for (let i = 0; i < Math.min(basename.length, originalFileName.length); i++) {
                    if (basename[i] === originalFileName[i]) score++;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = file;
                }
            }
            
            if (bestMatch) {
                dbFileConfig = bestMatch;
                logToFile(`WARNING: Using best guess for database file: ${bestMatch.path} for backup ${backupFileName}`);
            } else {
                return { success: false, error: 'Could not determine target file for backup' };
            }
        }
        
        // Create a backup of the current file before restoration
        const originalFilePath = dbFileConfig.path;
        if (fs.existsSync(originalFilePath)) {
            backupDatabaseFile(originalFilePath, 'pre-restore');
        }
        
        // Set up directories if needed
        const originalDir = path.dirname(originalFilePath);
        if (!fs.existsSync(originalDir)) {
            fs.mkdirSync(originalDir, { recursive: true });
            logToFile(`Created directory for restoration: ${originalDir}`);
        }
        
        // Copy the backup file to the original location
        const fileContent = secureReadFile(backupFilePath);
        
        // Validate content can be parsed as JSON before writing
        try {
            JSON.parse(fileContent);
        } catch (parseError) {
            logToFile(`WARNING: Backup content may not be valid JSON: ${parseError.message}`);
            if (!force) {
                return { success: false, error: `Backup contains invalid JSON: ${parseError.message}` };
            }
            // Continue anyway if force=true
            logToFile(`Proceeding with restoration despite JSON parse error (force=true)`);
        }
        
        // Write the file
        secureWriteFile(originalFilePath, fileContent);
        
        // Verify the restore was successful
        if (!fs.existsSync(originalFilePath)) {
            return { success: false, error: `Failed to restore file: file was not created` };
        }
        
        logToFile(`Restored database file '${originalFilePath}' from backup '${backupFilePath}'`);
        
        // Clear the database status cache
        dbStatusCache = null;
        
        return { 
            success: true, 
            message: `Successfully restored ${originalFilePath} from backup`,
            file: originalFilePath
        };
    } catch (error) {
        logToFile(`ERROR: Failed to restore database from backup '${backupFilePath}': ${error.message}`);
        if (error.stack) {
            logToFile(`Stack trace: ${error.stack}`);
        }
        return { success: false, error: `Restore failed: ${error.message}` };
    }
}

/**
 * Verifies the integrity of a backup file
 * @param {Object} backupFile - Object containing file information (path, name, etc.)
 * @returns {Object} Verification result
 */
function verifyBackupIntegrity(backupFile) {
    try {
        const validationResult = validateBackupFile(backupFile.path);
        
        return {
            file: backupFile.name,
            valid: validationResult.valid,
            error: validationResult.valid ? null : validationResult.error,
            timestamp: backupFile.timestamp,
            size: backupFile.size,
            type: backupFile.type
        };
    } catch (error) {
        return {
            file: backupFile.name,
            valid: false,
            error: `Verification failed: ${error.message}`,
            timestamp: backupFile.timestamp,
            size: backupFile.size,
            type: backupFile.type
        };
    }
}

/**
 * Calculates a file checksum
 * @param {string} filePath - Path to the file
 * @returns {string} MD5 checksum of the file
 */
function calculateFileChecksum(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath);
        return crypto.createHash('md5').update(fileContent).digest('hex');
    } catch (error) {
        logToFile(`ERROR: Failed to calculate checksum for '${filePath}': ${error.message}`);
        return null;
    }
}

/**
 * Initializes the database recovery system
 */
function initDatabaseRecovery() {
    // Create backup directories if they don't exist
    if (!fs.existsSync(BACKUP_CONFIG.backupDir)) {
        fs.mkdirSync(BACKUP_CONFIG.backupDir, { recursive: true });
    }
    
    if (!fs.existsSync(BACKUP_CONFIG.corruptionBackupDir)) {
        fs.mkdirSync(BACKUP_CONFIG.corruptionBackupDir, { recursive: true });
    }
    
    // Check and initialize database files
    const status = checkDatabaseStatus(true);
    
    // Initialize missing files with default content
    for (const dbFile of CRITICAL_DB_FILES) {
        if (!fs.existsSync(dbFile.path) && dbFile.required) {
            // Create parent directory if it doesn't exist
            const dir = path.dirname(dbFile.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Create file with default content
            secureWriteFile(dbFile.path, dbFile.defaultContent);
            logToFile(`Initialized missing database file: ${dbFile.path}`);
        }
    }
    
    // Create an initial backup of all files
    backupAllDatabaseFiles('initial');
    
    logToFile(`Database recovery system initialized. Status: ${status.isHealthy ? 'Healthy' : 'Issues Detected'}`);
    
    return status;
}

// Schedule database backups
let backupInterval = null;

/**
 * Starts the scheduled backup system
 */
function startScheduledBackups() {
    if (backupInterval) {
        clearInterval(backupInterval);
    }
    
    // Create an initial backup
    backupAllDatabaseFiles('scheduled');
    cleanupOldBackups();
    
    // Schedule regular backups
    backupInterval = setInterval(() => {
        backupAllDatabaseFiles('scheduled');
        cleanupOldBackups();
    }, BACKUP_CONFIG.backupFrequency);
    
    logToFile(`Started scheduled database backups every ${BACKUP_CONFIG.backupFrequency / (60 * 60 * 1000)} hours`);
}

/**
 * Stops the scheduled backup system
 */
function stopScheduledBackups() {
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
        logToFile('Stopped scheduled database backups');
    }
}

module.exports = {
    checkDatabaseStatus,
    backupDatabaseFile,
    backupAllDatabaseFiles,
    cleanupOldBackups,
    getAvailableBackups,
    validateBackupFile,
    restoreDatabaseFromBackup,
    verifyBackupIntegrity,
    calculateFileChecksum,
    initDatabaseRecovery,
    startScheduledBackups,
    stopScheduledBackups,
    CRITICAL_DB_FILES
}; 