// Utility functions for transaction log management
const fs = require('fs');
const { secureReadFile, secureWriteFile } = require('./fileUtils');

// Helper function to update transaction log entries with robust error handling
function updateTransactionLog(txHash, updates) {
    try {
        console.log(`Updating transaction log for hash: ${txHash}`);
        console.log(`Updates:`, JSON.stringify(updates, null, 2));
        const txFile = 'merchant_transactions.json';
        if (!fs.existsSync(txFile)) {
            console.warn('Transaction file does not exist, cannot update');
            return false;
        }
        let txLogs = [];
        let fileContent;
        try {
            fileContent = secureReadFile(txFile);
        } catch (readError) {
            console.error('Error reading transaction log file:', readError);
            return false;
        }
        try {
            txLogs = JSON.parse(fileContent || '[]');
            if (!Array.isArray(txLogs)) {
                console.warn('Transaction log was corrupted (not an array), creating backup');
                const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                fs.copyFileSync(txFile, backupFile);
                secureWriteFile(txFile, JSON.stringify([]));
                console.warn('Reset transaction log to empty array');
                return false;
            }
        } catch (parseError) {
            console.error('Error parsing transaction log for update:', parseError);
            const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
            fs.copyFileSync(txFile, backupFile);
            secureWriteFile(txFile, JSON.stringify([]));
            return false;
        }
        let updated = false;
        const updatedLogs = txLogs.map(tx => {
            if (tx.txHash === txHash) {
                updated = true;
                return {
                    ...tx,
                    ...updates,
                    lastUpdated: new Date().toISOString()
                };
            }
            return tx;
        });
        if (updated) {
            const tempFile = `${txFile}.tmp`;
            secureWriteFile(tempFile, JSON.stringify(updatedLogs, null, 2));
            fs.renameSync(tempFile, txFile);
            console.log(`Updated transaction log for ${txHash}`);
            return true;
        } else {
            console.log(`Transaction ${txHash} not found in log, cannot update`);
            return false;
        }
    } catch (error) {
        console.error('Error updating transaction log:', error);
        return false;
    }
}

// Helper function to save a new transaction log entry
function saveTxLog(txLogEntry) {
    try {
        console.log(`Saving transaction log entry for ${txLogEntry.txHash || txLogEntry.address || 'unknown'}`);
        const txFile = 'merchant_transactions.json';
        let txLogs = [];
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
                txLogs = JSON.parse(fileContent || '[]');
                if (!Array.isArray(txLogs)) {
                    console.warn('Transaction log was corrupted, resetting to empty array');
                    txLogs = [];
                }
            } catch (parseError) {
                console.error('Error parsing transaction log:', parseError);
                txLogs = [];
            }
        }
        let existingIndex = -1;
        if (txLogEntry.txHash) {
            existingIndex = txLogs.findIndex(tx => tx.txHash === txLogEntry.txHash);
        } else if (txLogEntry.txId && existingIndex === -1) {
            existingIndex = txLogs.findIndex(tx => tx.txId === txLogEntry.txId);
        } else if (txLogEntry.address && txLogEntry.timestamp && existingIndex === -1) {
            existingIndex = txLogs.findIndex(tx => tx.address === txLogEntry.address && tx.timestamp === txLogEntry.timestamp);
        }
        if (existingIndex >= 0) {
            console.log(`Updating existing transaction log entry at index ${existingIndex}`);
            const existingTx = txLogs[existingIndex];
            txLogs[existingIndex] = {
                ...existingTx,
                ...txLogEntry,
                lastUpdated: new Date().toISOString(),
                statusHistory: existingTx.statusHistory ? [
                    ...existingTx.statusHistory,
                    {
                        status: txLogEntry.status,
                        timestamp: new Date().toISOString()
                    }
                ] : [
                    {
                        status: existingTx.status, 
                        timestamp: existingTx.timestamp || new Date().toISOString()
                    },
                    {
                        status: txLogEntry.status,
                        timestamp: new Date().toISOString()
                    }
                ]
            };
        } else {
            console.log(`Adding new transaction log entry`);
            const newTxEntry = {
                ...txLogEntry,
                timestamp: txLogEntry.timestamp || new Date().toISOString(),
                statusHistory: [{
                    status: txLogEntry.status,
                    timestamp: txLogEntry.timestamp || new Date().toISOString()
                }]
            };
            if (!newTxEntry.txId) {
                newTxEntry.txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            }
            txLogs.push(newTxEntry);
        }
        secureWriteFile(txFile, JSON.stringify(txLogs, null, 2));
        console.log(`Transaction log updated successfully`);
        return true;
    } catch (error) {
        console.error('Error saving transaction log:', error);
        return false;
    }
}

module.exports = { saveTxLog, updateTransactionLog }; 