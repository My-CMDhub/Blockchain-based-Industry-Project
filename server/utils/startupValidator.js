const fs = require('fs');
const path = require('path');
const { secureReadFile, secureWriteFile } = require('./fileUtils');
const { logToFile } = require('./logger');
const { CRITICAL_DB_FILES, initDatabaseRecovery, backupAllDatabaseFiles } = require('./databaseMonitor');

/**
 * Validates database files during server startup
 * @returns {Object} Validation results
 */
function validateDatabaseOnStartup() {
    logToFile('Starting database validation on server startup');
    
    const result = {
        success: true,
        issues: [],
        fixedIssues: [],
        criticalErrors: []
    };
    
    try {
        // 1. Check that backup directories exist
        const backupDirs = ['database_backups', 'corruption_backups'];
        for (const dir of backupDirs) {
            if (!fs.existsSync(dir)) {
                logToFile(`Creating missing backup directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
                result.fixedIssues.push(`Created missing backup directory: ${dir}`);
            }
        }
        
        // 2. Create initial backup if needed
        const hasInitialBackup = fs.existsSync('database_backups') && 
            fs.readdirSync('database_backups').some(file => file.includes('initial'));
        
        if (!hasInitialBackup) {
            logToFile('Creating initial database backup');
            backupAllDatabaseFiles('initial');
            result.fixedIssues.push('Created initial database backup');
        }
        
        // 3. Check critical database files
        for (const dbFile of CRITICAL_DB_FILES) {
            const filePath = dbFile.path;
            const exists = fs.existsSync(filePath);
            
            if (!exists) {
                if (dbFile.required) {
                    logToFile(`CRITICAL: Required database file missing: ${filePath}`);
                    result.issues.push(`Missing required database file: ${filePath}`);
                    
                    // Create with default content
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    secureWriteFile(filePath, dbFile.defaultContent);
                    result.fixedIssues.push(`Created missing database file with default content: ${filePath}`);
                } else {
                    logToFile(`WARNING: Non-critical database file missing: ${filePath}`);
                    result.issues.push(`Missing non-critical database file: ${filePath}`);
                }
                continue;
            }
            
            // Check file integrity
            try {
                const fileContent = secureReadFile(filePath);
                if (!fileContent || !fileContent.trim()) {
                    logToFile(`WARNING: Database file is empty: ${filePath}`);
                    result.issues.push(`Empty database file: ${filePath}`);
                    
                    if (dbFile.required) {
                        // Create backup of empty file
                        const backupDir = 'corruption_backups';
                        const timestamp = new Date().toISOString().replace(/:/g, '-');
                        const fileName = path.basename(filePath);
                        const backupFileName = `${fileName}.empty.${timestamp}.bak`;
                        const backupFilePath = path.join(backupDir, backupFileName);
                        
                        // Ensure backup directory exists
                        if (!fs.existsSync(backupDir)) {
                            fs.mkdirSync(backupDir, { recursive: true });
                        }
                        
                        // Backup empty file
                        fs.copyFileSync(filePath, backupFilePath);
                        
                        // Create with default content
                        secureWriteFile(filePath, dbFile.defaultContent);
                        result.fixedIssues.push(`Fixed empty database file with default content: ${filePath}`);
                    }
                    continue;
                }
                
                // Validate the file structure
                const validationResult = dbFile.validator(fileContent);
                if (!validationResult.valid) {
                    logToFile(`CRITICAL: Database file corrupted: ${filePath} - ${validationResult.error}`);
                    result.issues.push(`Corrupted database file: ${filePath} - ${validationResult.error}`);
                    
                    if (dbFile.required) {
                        // Create backup of corrupted file
                        const backupDir = 'corruption_backups';
                        const timestamp = new Date().toISOString().replace(/:/g, '-');
                        const fileName = path.basename(filePath);
                        const backupFileName = `${fileName}.corrupted.${timestamp}.bak`;
                        const backupFilePath = path.join(backupDir, backupFileName);
                        
                        // Ensure backup directory exists
                        if (!fs.existsSync(backupDir)) {
                            fs.mkdirSync(backupDir, { recursive: true });
                        }
                        
                        // Backup corrupted file
                        fs.copyFileSync(filePath, backupFilePath);
                        
                        // If we can parse it, try to fix it
                        try {
                            const data = JSON.parse(fileContent);
                            if (Array.isArray(data) && dbFile.validator === require('./databaseMonitor').validateTransactionFile) {
                                // It's a valid array but might have corrupted entries
                                logToFile(`Attempting to fix ${filePath} by filtering invalid entries`);
                                secureWriteFile(filePath, JSON.stringify(data.filter(item => !!item), null, 2));
                                result.fixedIssues.push(`Fixed corrupted database file by filtering invalid entries: ${filePath}`);
                            } else if (typeof data === 'object' && !Array.isArray(data)) {
                                // It's a valid object but missing required fields
                                logToFile(`Attempting to fix ${filePath} by merging with default content`);
                                // Parse default content and merge with existing data
                                const defaultData = JSON.parse(dbFile.defaultContent);
                                const mergedData = { ...defaultData, ...data };
                                secureWriteFile(filePath, JSON.stringify(mergedData, null, 2));
                                result.fixedIssues.push(`Fixed corrupted database file by merging with default content: ${filePath}`);
                            } else {
                                // Create with default content
                                secureWriteFile(filePath, dbFile.defaultContent);
                                result.fixedIssues.push(`Fixed corrupted database file with default content: ${filePath}`);
                            }
                        } catch (fixError) {
                            // Cannot fix, create with default content
                            logToFile(`Failed to fix corrupted file ${filePath}: ${fixError.message}`);
                            secureWriteFile(filePath, dbFile.defaultContent);
                            result.fixedIssues.push(`Reset corrupted database file with default content: ${filePath}`);
                        }
                    }
                }
            } catch (error) {
                logToFile(`ERROR: Failed to check database file '${filePath}': ${error.message}`);
                result.issues.push(`Error checking database file '${filePath}': ${error.message}`);
                
                if (dbFile.required) {
                    result.criticalErrors.push(`Failed to validate required database file: ${filePath}`);
                    result.success = false;
                }
            }
        }
        
        // 4. Initialize database recovery system
        initDatabaseRecovery();
        
        // Log validation results
        if (result.issues.length > 0) {
            logToFile(`Database validation found ${result.issues.length} issues`);
        }
        if (result.fixedIssues.length > 0) {
            logToFile(`Database validation fixed ${result.fixedIssues.length} issues`);
        }
        if (result.criticalErrors.length > 0) {
            logToFile(`Database validation encountered ${result.criticalErrors.length} critical errors`);
        }
        
        return result;
    } catch (error) {
        logToFile(`ERROR during database validation: ${error.message}`);
        return {
            success: false,
            issues: [`Global validation error: ${error.message}`],
            fixedIssues: [],
            criticalErrors: [`Failed to complete database validation: ${error.message}`]
        };
    }
}

module.exports = {
    validateDatabaseOnStartup
}; 