const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');

// Stripe configuration endpoint
router.get('/config', stripeController.getConfig);

// Create checkout session
router.post('/create-checkout-session', stripeController.createCheckoutSession);

// Webhook endpoint (needs raw body)
router.post('/webhook', express.raw({ type: 'application/json' }), stripeController.handleWebhook);

// Get all payments
router.get('/payments', stripeController.getPayments);

// Get payment by session ID
router.get('/payment/:sessionId', stripeController.getPaymentBySession);

module.exports = router; 