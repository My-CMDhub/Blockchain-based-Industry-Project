/**
 * Transaction Log Utilities
 * Provides functions for managing transaction logs with SQLite database sync
 */

const { logToFile } = require('./logger');
const dataManager = require('./dataManager');

/**
 * Update an existing transaction in the log
 * @param {string} txHash - Transaction hash
 * @param {Object} updates - Updates to apply to the transaction
 * @returns {Promise<boolean>} Success status
 */
async function updateTransactionLog(txHash, updates) {
    try {
        console.log(`Updating transaction log for hash: ${txHash}`);
        console.log(`Updates:`, JSON.stringify(updates, null, 2));
        
        // Get all merchant transactions
        const transactions = await dataManager.getMerchantTransactions();
        
        // Find the transaction by hash
        const transaction = transactions.find(tx => tx.txHash === txHash);
        
        if (!transaction) {
            console.log(`Transaction ${txHash} not found in log, cannot update`);
            return false;
        }
        
        // Merge updates with existing transaction
        const updatedTransaction = {
            ...transaction,
            ...updates,
            lastUpdated: new Date().toISOString()
        };
        
        // Add to status history if status is changing
        if (updates.status && updates.status !== transaction.status) {
            updatedTransaction.statusHistory = transaction.statusHistory || [];
            updatedTransaction.statusHistory.push({
                status: updates.status,
                timestamp: new Date().toISOString()
            });
        }
        
        // Update in database
        await dataManager.updateTransaction(transaction.txId, updatedTransaction);
        
        console.log(`Updated transaction log for ${txHash}`);
        return true;
    } catch (error) {
        console.error('Error updating transaction log:', error);
        logToFile(`Error updating transaction log: ${error.message}`);
        return false;
    }
}

/**
 * Save a new transaction to the log
 * @param {Object} txLogEntry - Transaction log entry
 * @returns {Promise<boolean>} Success status
 */
async function saveTxLog(txLogEntry) {
    try {
        console.log(`Saving transaction log entry for ${txLogEntry.txHash || txLogEntry.address || 'unknown'}`);
        
        // Get all transactions to check for existing
        const transactions = await dataManager.getMerchantTransactions();
        
        // Find existing transaction if any
        let existingTransaction = null;
        
        // Try to match by txHash first if available
        if (txLogEntry.txHash) {
            existingTransaction = transactions.find(tx => tx.txHash === txLogEntry.txHash);
        }
        // If no txHash or not found by txHash, try to match by txId
        if (!existingTransaction && txLogEntry.txId) {
            existingTransaction = transactions.find(tx => tx.txId === txLogEntry.txId);
        }
        // If payment address is available, try to match by that and timestamp
        if (!existingTransaction && txLogEntry.address && txLogEntry.timestamp) {
            existingTransaction = transactions.find(tx => 
                tx.address === txLogEntry.address && 
                tx.timestamp === txLogEntry.timestamp
            );
        }
        
        // Ensure we have a txId
        if (!txLogEntry.txId) {
            txLogEntry.txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        
        // Initialize history for new transactions
        const newEntry = {
            ...txLogEntry,
            timestamp: txLogEntry.timestamp || new Date().toISOString(),
            // Set transaction type if not provided
            type: txLogEntry.type || 'payment'
        };
        
        // Add status history if not present
        if (!newEntry.statusHistory) {
            newEntry.statusHistory = [{
                status: newEntry.status,
                timestamp: newEntry.timestamp
            }];
        }
        
        if (existingTransaction) {
            console.log(`Updating existing transaction log entry: ${existingTransaction.txId}`);
            
            // Merge with existing transaction
            const updatedTransaction = {
                ...existingTransaction,
                ...newEntry,
                lastUpdated: new Date().toISOString()
            };
            
            // Update status history if status has changed
            if (newEntry.status && newEntry.status !== existingTransaction.status) {
                updatedTransaction.statusHistory = existingTransaction.statusHistory || [];
                updatedTransaction.statusHistory.push({
                    status: newEntry.status,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Update the transaction
            await dataManager.updateTransaction(existingTransaction.txId, updatedTransaction);
        } else {
            console.log(`Adding new transaction log entry with ID: ${newEntry.txId}`);
            
            // Add the transaction
            await dataManager.recordTransaction(newEntry);
        }
        
        console.log(`Transaction log updated successfully`);
        return true;
    } catch (error) {
        console.error('Error saving transaction log:', error);
        logToFile(`Error saving transaction log: ${error.message}`);
        return false;
    }
}

module.exports = { updateTransactionLog, saveTxLog }; 