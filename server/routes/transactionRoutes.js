// Transaction Routes
const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// Get transaction details by hash
router.get('/transaction/:txHash', transactionController.getTransactionDetails);

module.exports = router; 