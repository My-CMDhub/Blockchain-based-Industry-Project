/**
 * Data Manager for interfacing between application and database
 * Handles both JSON files and SQLite database
 */
const fs = require('fs');
const path = require('path');
const { syncDbToJson } = require('../../db/syncManager');
const TransactionRepository = require('../../db/repositories/transactionRepository');
const MerchantTransactionRepository = require('../../db/repositories/merchantTransactionRepository');
const StripeTransactionRepository = require('../../db/repositories/stripeTransactionRepository');

// File paths for direct access when needed
const KEYS_FILE = path.join(__dirname, '../../Json/keys.json');
const MERCHANT_TRANSACTIONS_FILE = path.join(__dirname, '../../merchant_transactions.json');
const STRIPE_PAYMENTS_FILE = path.join(__dirname, '../../stripe_payments.json');

/**
 * Record a new transaction
 * @param {Object} transaction - Transaction data
 * @returns {Promise<boolean>} Success status
 */
async function recordTransaction(transaction) {
  try {
    console.log(`Recording transaction of type ${transaction.type || 'unknown'}`);
    
    // Step 1: Add to SQLite DB based on transaction type
    if (transaction.type === 'payment' || transaction.type === 'release') {
      await MerchantTransactionRepository.add(transaction);
    } else if (transaction.type === 'stripe') {
      await StripeTransactionRepository.add(transaction);
    } else {
      console.warn(`Unknown transaction type: ${transaction.type}`);
    }
    
    // Step 2: Update JSON files (will update all files for consistency)
    await syncDbToJson();
    
    console.log('Transaction recorded successfully');
    return true;
  } catch (error) {
    console.error('Error recording transaction:', error);
    return false;
  }
}

/**
 * Update an existing transaction
 * @param {string} txId - Transaction ID
 * @param {Object} transaction - Updated transaction data
 * @returns {Promise<boolean>} Success status
 */
async function updateTransaction(txId, transaction) {
  try {
    console.log(`Updating transaction with ID ${txId}`);
    
    // Step 1: Update in SQLite DB based on transaction type
    if (transaction.type === 'payment' || transaction.type === 'release') {
      await MerchantTransactionRepository.update(txId, transaction);
    } else if (transaction.type === 'stripe') {
      await StripeTransactionRepository.update(transaction.id, transaction);
    } else {
      console.warn(`Unknown transaction type: ${transaction.type}`);
    }
    
    // Step 2: Update JSON files
    await syncDbToJson();
    
    console.log('Transaction updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating transaction:', error);
    return false;
  }
}

/**
 * Add or update an active address in wallet
 * @param {string} address - Wallet address
 * @param {Object} data - Address data
 * @returns {Promise<boolean>} Success status
 */
async function updateActiveAddress(address, data) {
  try {
    console.log(`Updating active address: ${address}`);
    
    // Check if address exists
    const existing = await TransactionRepository.getByAddress(address);
    
    if (existing) {
      // Update existing address
      await TransactionRepository.update(address, data);
    } else {
      // Add new address with complete data
      await TransactionRepository.add({ 
        address, 
        ...data
      });
    }
    
    // Update JSON files
    await syncDbToJson();
    
    console.log('Active address updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating active address:', error);
    return false;
  }
}

/**
 * Get all merchant transactions
 * @returns {Promise<Array>} Array of transactions
 */
async function getMerchantTransactions() {
  try {
    console.log('Fetching all merchant transactions');
    return await MerchantTransactionRepository.getAll();
  } catch (error) {
    console.error('Error getting merchant transactions:', error);
    return [];
  }
}

/**
 * Get merchant transactions by address
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} Array of transactions
 */
async function getMerchantTransactionsByAddress(address) {
  try {
    console.log(`Fetching merchant transactions for address: ${address}`);
    return await MerchantTransactionRepository.getByAddress(address);
  } catch (error) {
    console.error(`Error getting merchant transactions for address ${address}:`, error);
    return [];
  }
}

/**
 * Get active addresses from wallet
 * @returns {Promise<Object>} Active addresses
 */
async function getActiveAddresses() {
  try {
    console.log('Fetching active addresses');
    const rows = await TransactionRepository.getAll();
    
    // Convert to object format expected by application
    const activeAddresses = {};
    rows.forEach(row => {
      activeAddresses[row.address] = {
        index: row.index,
        ethAmount: row.ethAmount,
        expectedAmount: row.expectedAmount,
        cryptoType: row.cryptoType,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        status: row.status,
        orderId: row.orderId,
        fiatAmount: row.fiatAmount,
        fiatCurrency: row.fiatCurrency,
        amount: row.amount,
        timestamp: row.timestamp,
        amountVerified: row.amountVerified === 1
      };
    });
    
    return activeAddresses;
  } catch (error) {
    console.error('Error getting active addresses:', error);
    return {};
  }
}

/**
 * Get all Stripe payments
 * @returns {Promise<Array>} Array of Stripe payments
 */
async function getStripePayments() {
  try {
    console.log('Fetching all Stripe payments');
    const rows = await StripeTransactionRepository.getAll();
    
    // Convert SQLite rows to the format expected by the application
    return rows.map(row => ({
      id: row.id,
      orderId: row.orderId,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      timestamp: row.timestamp,
      paymentMethod: row.paymentMethod,
      customerEmail: row.customerEmail,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    }));
  } catch (error) {
    console.error('Error getting Stripe payments:', error);
    return [];
  }
}

/**
 * Delete a transaction by ID
 * @param {string} txId - Transaction ID
 * @param {string} type - Transaction type (payment, release, stripe)
 * @returns {Promise<boolean>} Success status
 */
async function deleteTransaction(txId, type) {
  try {
    console.log(`Deleting transaction with ID ${txId} of type ${type}`);
    
    if (type === 'payment' || type === 'release') {
      await MerchantTransactionRepository.delete(txId);
    } else if (type === 'stripe') {
      await StripeTransactionRepository.delete(txId);
    } else {
      console.warn(`Unknown transaction type: ${type}`);
      return false;
    }
    
    // Update JSON files
    await syncDbToJson();
    
    console.log('Transaction deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting transaction:', error);
    return false;
  }
}

/**
 * Delete an active address
 * @param {string} address - Wallet address
 * @returns {Promise<boolean>} Success status
 */
async function deleteActiveAddress(address) {
  try {
    console.log(`Deleting active address: ${address}`);
    
    await TransactionRepository.delete(address);
    
    // Update JSON files
    await syncDbToJson();
    
    console.log('Active address deleted successfully');
    return true;
  } catch (error) {
    console.error('Error deleting active address:', error);
    return false;
  }
}

module.exports = {
  recordTransaction,
  updateTransaction,
  updateActiveAddress,
  getMerchantTransactions,
  getMerchantTransactionsByAddress,
  getActiveAddresses,
  getStripePayments,
  deleteTransaction,
  deleteActiveAddress
}; 