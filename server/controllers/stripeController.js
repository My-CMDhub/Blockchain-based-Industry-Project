const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');
const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
const { v4: uuidv4 } = require('uuid');
const { logToFile } = require('../utils/logger');

// Path to store Stripe payments
const STRIPE_PAYMENTS_FILE = path.join(process.cwd(), 'stripe_payments.json');

// Initialize stripe payments file if it doesn't exist
async function initStripePaymentsFile() {
    try {
        // Check if file exists, if not create it
        if (!fs.existsSync(STRIPE_PAYMENTS_FILE)) {
            await secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments: [] }));
            logToFile(`Created new stripe payments file at ${STRIPE_PAYMENTS_FILE}`);
        }
    } catch (error) {
        console.error('Error initializing stripe payments file:', error);
        logToFile(`Error initializing stripe payments file: ${error.message}`);
    }
}

// Get all payments from the JSON file
async function getStripePayments() {
    try {
        // Initialize the file if it doesn't exist
        await initStripePaymentsFile();
        
        // Read the file
        const data = await secureReadFile(STRIPE_PAYMENTS_FILE);
        if (!data) return { payments: [] };
        
        try {
            return JSON.parse(data);
        } catch (parseError) {
            console.error('Error parsing stripe payments data:', parseError);
            logToFile(`Error parsing stripe payments: ${parseError.message}`);
            // If parsing fails, backup the corrupted file and return empty array
            const backupPath = `${STRIPE_PAYMENTS_FILE}.corrupted.${Date.now()}.bak`;
            await secureWriteFile(backupPath, data);
            logToFile(`Created backup of corrupted stripe payments at ${backupPath}`);
            return { payments: [] };
        }
    } catch (error) {
        console.error('Error reading stripe payments:', error);
        logToFile(`Error reading stripe payments: ${error.message}`);
        return { payments: [] };
    }
}

// Save payment to the JSON file
async function saveStripePayment(payment) {
    try {
        // Get existing payments
        const { payments } = await getStripePayments();
        
        // Add the new payment with timestamp
        const updatedPayment = {
            ...payment,
            timestamp: payment.timestamp || new Date().toISOString()
        };
        
        // Check if payment with same ID already exists
        const existingIndex = payments.findIndex(p => p.id === updatedPayment.id);
        if (existingIndex >= 0) {
            // Update existing payment
            payments[existingIndex] = {
                ...payments[existingIndex],
                ...updatedPayment
            };
        } else {
            // Add new payment
            payments.push(updatedPayment);
        }
        
        // Save updated payments array
        await secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments }, null, 2));
        logToFile(`Saved stripe payment: ${JSON.stringify(updatedPayment)}`);
        return true;
    } catch (error) {
        console.error('Error saving stripe payment:', error);
        logToFile(`Error saving stripe payment: ${error.message}`);
        return false;
    }
}

// Create a checkout session
exports.createCheckoutSession = async (req, res) => {
    try {
        const { items, amount, orderId, currency = 'aud' } = req.body;
        
        if (!items || !items.length || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: items, amount'
            });
        }
        
        // Create unique order ID if not provided
        const sessionOrderId = orderId || `order_${uuidv4()}`;
        
        // Create line items for Stripe
        const lineItems = items.map(item => ({
            price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                    name: item.name,
                    description: item.description || '',
                    images: item.image ? [item.image] : [],
                },
                unit_amount: Math.round(item.price * 100), // Convert to cents
            },
            quantity: item.quantity || 1,
        }));
        
        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${req.headers.origin}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/Cart.html`,
            metadata: {
                orderId: sessionOrderId
            }
        });
        
        // Save initial payment record
        const paymentRecord = {
            id: session.id,
            orderId: sessionOrderId,
            amount: amount,
            currency: currency,
            status: 'pending',
            createdAt: new Date().toISOString(),
            items: items,
            metadata: session.metadata
        };
        
        await saveStripePayment(paymentRecord);
        
        // Return session details to client
        res.json({
            success: true,
            sessionId: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        logToFile(`Error creating checkout session: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to create checkout session'
        });
    }
};

// Handle Stripe webhook events
exports.handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
        return res.status(400).json({
            success: false,
            error: 'Missing Stripe signature'
        });
    }
    
    try {
        // Verify the event came from Stripe
        let event;
        
        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({
                success: false,
                error: `Webhook signature verification failed: ${err.message}`
            });
        }
        
        // Handle different event types
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                
                // Update payment record
                const { payments } = await getStripePayments();
                const paymentIndex = payments.findIndex(p => p.id === session.id);
                
                if (paymentIndex >= 0) {
                    payments[paymentIndex] = {
                        ...payments[paymentIndex],
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                        paymentIntent: session.payment_intent,
                        customer: session.customer,
                        paymentStatus: session.payment_status
                    };
                    
                    await secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments }, null, 2));
                    logToFile(`Updated payment status to completed for session ${session.id}`);
                } else {
                    // If payment record doesn't exist, create it
                    const paymentRecord = {
                        id: session.id,
                        orderId: session.metadata?.orderId || `order_${uuidv4()}`,
                        amount: session.amount_total / 100, // Convert from cents
                        currency: session.currency,
                        status: 'completed',
                        createdAt: new Date(session.created * 1000).toISOString(),
                        completedAt: new Date().toISOString(),
                        paymentIntent: session.payment_intent,
                        customer: session.customer,
                        paymentStatus: session.payment_status,
                        metadata: session.metadata
                    };
                    
                    await saveStripePayment(paymentRecord);
                }
                
                break;
            }
            
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                
                // Update payment record if exists
                const { payments } = await getStripePayments();
                const payment = payments.find(p => p.paymentIntent === paymentIntent.id);
                
                if (payment) {
                    payment.status = 'completed';
                    payment.completedAt = new Date().toISOString();
                    payment.chargeId = paymentIntent.latest_charge;
                    
                    await secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments }, null, 2));
                    logToFile(`Updated payment status for intent ${paymentIntent.id}`);
                }
                
                break;
            }
            
            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                const error = paymentIntent.last_payment_error;
                
                // Update payment record if exists
                const { payments } = await getStripePayments();
                const payment = payments.find(p => p.paymentIntent === paymentIntent.id);
                
                if (payment) {
                    payment.status = 'failed';
                    payment.failedAt = new Date().toISOString();
                    payment.error = error ? {
                        message: error.message,
                        code: error.code,
                        type: error.type
                    } : { message: 'Unknown error' };
                    
                    await secureWriteFile(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments }, null, 2));
                    logToFile(`Updated payment status to failed for intent ${paymentIntent.id}`);
                }
                
                break;
            }
        }
        
        // Return success response
        res.json({ received: true });
    } catch (error) {
        console.error('Error handling webhook:', error);
        logToFile(`Error handling webhook: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to process webhook'
        });
    }
};

// Get Stripe configuration
exports.getConfig = (req, res) => {
    // Return publishable key and other config
    res.json({
        success: true,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        currency: 'aud' // Default currency
    });
};

// Get all Stripe payments
exports.getPayments = async (req, res) => {
    try {
        const { payments } = await getStripePayments();
        
        // Calculate totals
        const totalPayments = payments.length;
        const completedPayments = payments.filter(p => p.status === 'completed').length;
        const pendingPayments = payments.filter(p => p.status === 'pending').length;
        const failedPayments = payments.filter(p => p.status === 'failed').length;
        
        // Calculate revenue (only from completed payments)
        let totalRevenue = 0;
        payments.forEach(payment => {
            if (payment.status === 'completed' && payment.amount) {
                totalRevenue += parseFloat(payment.amount);
            }
        });
        
        res.json({
            success: true,
            payments,
            stats: {
                total: totalPayments,
                completed: completedPayments,
                pending: pendingPayments,
                failed: failedPayments,
                revenue: totalRevenue.toFixed(2)
            }
        });
    } catch (error) {
        console.error('Error getting payments:', error);
        logToFile(`Error getting payments: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to get payments'
        });
    }
};

// Get payment details by session ID
exports.getPaymentBySession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }
        
        // Get payment from local storage
        const { payments } = await getStripePayments();
        const payment = payments.find(p => p.id === sessionId);
        
        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'Payment not found'
            });
        }
        
        // If payment is pending, check status from Stripe
        if (payment.status === 'pending') {
            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                
                // Update payment status based on Stripe's response
                if (session.payment_status === 'paid') {
                    payment.status = 'completed';
                    payment.completedAt = new Date().toISOString();
                    payment.paymentIntent = session.payment_intent;
                    payment.customer = session.customer;
                    payment.paymentStatus = session.payment_status;
                    
                    // Save updated payment
                    await saveStripePayment(payment);
                } else if (session.status === 'expired' || session.status === 'canceled') {
                    payment.status = 'failed';
                    payment.failedAt = new Date().toISOString();
                    payment.error = { message: `Session ${session.status}` };
                    
                    // Save updated payment
                    await saveStripePayment(payment);
                }
            } catch (stripeError) {
                console.error('Error retrieving session from Stripe:', stripeError);
                // Continue with local data if Stripe API fails
            }
        }
        
        res.json({
            success: true,
            payment
        });
    } catch (error) {
        console.error('Error getting payment details:', error);
        logToFile(`Error getting payment details: ${error.message}`);
        
        res.status(500).json({
            success: false,
            error: 'Failed to get payment details'
        });
    }
};

// Initialize stripe payments file on module load
initStripePaymentsFile(); 