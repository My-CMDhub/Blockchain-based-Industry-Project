const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');

// Get all addresses
router.get('/addresses', walletController.getAddresses);

// Cleanup addresses (expired/abandoned)
router.post('/cleanup-addresses', walletController.cleanupAddresses);

// Delete a specific address
router.post('/delete-address', walletController.deleteAddress);

// Discard a payment address
router.post('/discard-payment-address', walletController.discardPaymentAddress);

// Verify if a payment address is still active
router.post('/verify-payment-address', walletController.verifyPaymentAddress);

// Add update keys endpoint
router.post('/update-keys', walletController.updateKeys);

// HD wallet balance
router.get('/hd-wallet-balance', walletController.getHDWalletBalance);

// Add wallet balance endpoint
router.get('/wallet-balance', walletController.getWalletBalance);

module.exports = router; 