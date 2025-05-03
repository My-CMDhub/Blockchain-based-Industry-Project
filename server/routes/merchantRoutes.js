const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchantController');

// Merchant transaction history
router.get('/merchant-transactions', merchantController.getMerchantTransactions);

// Create transaction file
router.post('/create-transaction-file', merchantController.createTransactionFile);

// Get release transaction status
router.get('/release-status/:txHash', merchantController.getReleaseStatus);

module.exports = router; 