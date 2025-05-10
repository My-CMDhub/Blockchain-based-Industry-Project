/**
 * Address Utilities
 * Functions for managing active addresses with SQLite database sync
 */

const { logToFile } = require('./logger');
const dataManager = require('./dataManager');
const { getStoredKeys, updateStoredKeys } = require('../../server/utils/secretsManager');

/**
 * Get all active addresses
 * @returns {Promise<Object>} Active addresses object
 */
async function getActiveAddresses() {
  try {
    return await dataManager.getActiveAddresses();
  } catch (error) {
    console.error('Error getting active addresses:', error);
    logToFile(`Error getting active addresses: ${error.message}`);
    
    // Fallback to direct JSON access in case of database error
    const keys = await getStoredKeys();
    return keys.activeAddresses || {};
  }
}

/**
 * Update an active address
 * @param {string} address - Wallet address
 * @param {Object} data - Address data to update
 * @returns {Promise<boolean>} Success status
 */
async function updateActiveAddress(address, data) {
  try {
    console.log(`Updating active address: ${address}`);
    
    // Update in SQLite database
    await dataManager.updateActiveAddress(address, data);
    
    // Also update in keys object for compatibility
    const keys = await getStoredKeys();
    if (!keys.activeAddresses) {
      keys.activeAddresses = {};
    }
    
    keys.activeAddresses[address] = {
      ...keys.activeAddresses[address],
      ...data
    };
    
    await updateStoredKeys(keys);
    
    console.log(`Active address ${address} updated successfully`);
    return true;
  } catch (error) {
    console.error(`Error updating active address ${address}:`, error);
    logToFile(`Error updating active address ${address}: ${error.message}`);
    return false;
  }
}

/**
 * Add a new active address
 * @param {string} address - Wallet address
 * @param {Object} data - Address data
 * @returns {Promise<boolean>} Success status
 */
async function addActiveAddress(address, data) {
  try {
    console.log(`Adding new active address: ${address}`);
    
    // Add to SQLite database
    await dataManager.updateActiveAddress(address, data);
    
    // Also update in keys object for compatibility
    const keys = await getStoredKeys();
    if (!keys.activeAddresses) {
      keys.activeAddresses = {};
    }
    
    keys.activeAddresses[address] = data;
    
    await updateStoredKeys(keys);
    
    console.log(`New active address ${address} added successfully`);
    return true;
  } catch (error) {
    console.error(`Error adding active address ${address}:`, error);
    logToFile(`Error adding active address ${address}: ${error.message}`);
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
    
    // Delete from SQLite database
    await dataManager.deleteActiveAddress(address);
    
    // Also update in keys object for compatibility
    const keys = await getStoredKeys();
    if (keys.activeAddresses && keys.activeAddresses[address]) {
      delete keys.activeAddresses[address];
      await updateStoredKeys(keys);
    }
    
    console.log(`Active address ${address} deleted successfully`);
    return true;
  } catch (error) {
    console.error(`Error deleting active address ${address}:`, error);
    logToFile(`Error deleting active address ${address}: ${error.message}`);
    return false;
  }
}

/**
 * Mark address as expired or wrong payment
 * @param {string} address - Wallet address
 * @param {Object} reason - Reason data with status, reason, etc.
 * @returns {Promise<boolean>} Success status
 */
async function markAddressStatus(address, reason) {
  try {
    console.log(`Marking address ${address} with status: ${reason.status}`);
    
    // Get current address data
    const activeAddresses = await getActiveAddresses();
    const addrData = activeAddresses[address];
    
    if (!addrData) {
      console.warn(`Address ${address} not found in active addresses`);
      return false;
    }
    
    // Update with new status
    const updatedData = {
      ...addrData,
      ...reason,
      lastUpdated: new Date().toISOString()
    };
    
    return await updateActiveAddress(address, updatedData);
  } catch (error) {
    console.error(`Error marking address ${address} status:`, error);
    logToFile(`Error marking address ${address} status: ${error.message}`);
    return false;
  }
}

module.exports = {
  getActiveAddresses,
  updateActiveAddress,
  addActiveAddress,
  deleteActiveAddress,
  markAddressStatus
}; 