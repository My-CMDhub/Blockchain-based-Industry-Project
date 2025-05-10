/**
 * Stripe Payment Utilities
 * Functions for managing Stripe payments with SQLite database sync
 */

const { logToFile } = require('./logger');
const dataManager = require('./dataManager');
const fs = require('fs');
const path = require('path');
const { secureReadFile, secureWriteFile } = require('./fileUtils');

// File path for direct access when needed
const STRIPE_PAYMENTS_FILE = path.join(__dirname, '../../stripe_payments.json');

/**
 * Get all Stripe payments
 * @returns {Promise<Array>} Array of Stripe payment objects
 */
async function getStripePayments() {
  try {
    return await dataManager.getStripePayments();
  } catch (error) {
    console.error('Error getting Stripe payments:', error);
    logToFile(`Error getting Stripe payments: ${error.message}`);
    
    // Fallback to direct JSON access in case of database error
    try {
      if (fs.existsSync(STRIPE_PAYMENTS_FILE)) {
        const data = secureReadFile(STRIPE_PAYMENTS_FILE);
        const payments = JSON.parse(data || '{"payments":[]}');
        return payments.payments || [];
      }
      return [];
    } catch (fallbackError) {
      console.error('Fallback error getting Stripe payments:', fallbackError);
      return [];
    }
  }
}

/**
 * Record a new Stripe payment
 * @param {Object} payment - Stripe payment data
 * @returns {Promise<boolean>} Success status
 */
async function recordStripePayment(payment) {
  try {
    console.log(`Recording Stripe payment with ID: ${payment.id}`);
    
    // Ensure payment has required fields
    if (!payment.id) {
      payment.id = `stripe_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    
    // Add timestamp if not present
    if (!payment.timestamp) {
      payment.timestamp = new Date().toISOString();
    }
    
    // Add type marker
    payment.type = 'stripe';
    
    // Record in database
    await dataManager.recordTransaction(payment);
    
    console.log(`Stripe payment ${payment.id} recorded successfully`);
    return true;
  } catch (error) {
    console.error('Error recording Stripe payment:', error);
    logToFile(`Error recording Stripe payment: ${error.message}`);
    
    // Fallback to direct JSON access in case of database error
    try {
      let payments = { payments: [] };
      
      if (fs.existsSync(STRIPE_PAYMENTS_FILE)) {
        const data = secureReadFile(STRIPE_PAYMENTS_FILE);
        try {
          payments = JSON.parse(data || '{"payments":[]}');
        } catch (parseError) {
          console.error('Error parsing Stripe payments file:', parseError);
          payments = { payments: [] };
        }
      }
      
      // Add payment to array
      payments.payments.push(payment);
      
      // Write back to file
      secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify(payments, null, 2));
      
      console.log(`Stripe payment ${payment.id} recorded successfully (fallback mode)`);
      return true;
    } catch (fallbackError) {
      console.error('Fallback error recording Stripe payment:', fallbackError);
      return false;
    }
  }
}

/**
 * Update a Stripe payment
 * @param {string} paymentId - Stripe payment ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<boolean>} Success status
 */
async function updateStripePayment(paymentId, updates) {
  try {
    console.log(`Updating Stripe payment with ID: ${paymentId}`);
    
    // Get all payments
    const payments = await getStripePayments();
    
    // Find the payment
    const payment = payments.find(p => p.id === paymentId);
    
    if (!payment) {
      console.warn(`Stripe payment ${paymentId} not found`);
      return false;
    }
    
    // Update the payment
    const updatedPayment = {
      ...payment,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    // Update in database
    await dataManager.updateTransaction(paymentId, updatedPayment);
    
    console.log(`Stripe payment ${paymentId} updated successfully`);
    return true;
  } catch (error) {
    console.error('Error updating Stripe payment:', error);
    logToFile(`Error updating Stripe payment: ${error.message}`);
    
    // Fallback to direct JSON access in case of database error
    try {
      if (fs.existsSync(STRIPE_PAYMENTS_FILE)) {
        const data = secureReadFile(STRIPE_PAYMENTS_FILE);
        let payments = JSON.parse(data || '{"payments":[]}');
        
        // Find and update the payment
        const index = payments.payments.findIndex(p => p.id === paymentId);
        
        if (index >= 0) {
          payments.payments[index] = {
            ...payments.payments[index],
            ...updates,
            lastUpdated: new Date().toISOString()
          };
          
          // Write back to file
          secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify(payments, null, 2));
          
          console.log(`Stripe payment ${paymentId} updated successfully (fallback mode)`);
          return true;
        } else {
          console.warn(`Stripe payment ${paymentId} not found in file`);
          return false;
        }
      } else {
        console.warn('Stripe payments file not found');
        return false;
      }
    } catch (fallbackError) {
      console.error('Fallback error updating Stripe payment:', fallbackError);
      return false;
    }
  }
}

module.exports = {
  getStripePayments,
  recordStripePayment,
  updateStripePayment
}; 