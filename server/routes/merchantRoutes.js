const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchantController');

// Merchant transaction history
router.get('/merchant-transactions', merchantController.getMerchantTransactions);

// Add /config endpoint for network info
/**
 * @route GET /api/config
 * @desc Returns merchant address, network name, and chain ID for frontend network info
 * @access Public
 */
router.get('/config', (req, res) => {
  res.json({
    merchantAddress: process.env.MERCHANT_ADDRESS || '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b',
    networkName: process.env.NETWORK_NAME || 'Sepolia',
    chainId: process.env.CHAIN_ID || 11155111
  });
});

// Create transaction file
router.post('/create-transaction-file', merchantController.createTransactionFile);

// Get release transaction status
router.get('/release-status/:txHash', merchantController.getReleaseStatus);

// Release funds (specific amount)
router.post('/release-funds', merchantController.releaseFunds);

// Release all funds
router.post('/release-all-funds', merchantController.releaseAllFunds);

// Wrong payments
// router.get('/wrong-payments', merchantController.getWrongPayments);

// Crypto prices
router.get('/crypto-prices', merchantController.getCryptoPrices);

// Admin statistics
router.get('/admin/statistics', merchantController.getAdminStatistics);

// Modularized endpoint from server.js
router.get('/wallet-balance', merchantController.getWalletBalance);

module.exports = router; 