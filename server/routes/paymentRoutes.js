const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Use the initialized instance from global
router.post('/process-payment', (req, res) => paymentController.processPayment(req, res, global.web3));

// Other routes
router.post('/generate-payment-address', paymentController.generatePaymentAddress);
router.post('/record-payment', paymentController.recordPayment);
router.post('/verify-transaction', paymentController.verifyTransaction);
router.get('/generate-test-payment', paymentController.generateTestPayment);

module.exports = router;