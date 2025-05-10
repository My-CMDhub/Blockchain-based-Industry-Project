/**
 * Secure Keys Routes
 * Routes for secure key management with multiple security layers
 */

const express = require('express');
const { validateApiKey } = require('../utils/apiKeyValidator');
const { verifyAdminToken } = require('../utils/authMiddleware');
const secureKeysController = require('../controllers/secureKeysController');

const router = express.Router();

// API key for secure endpoints
const getApiKey = () => {
    return process.env.API_KEY || createApiKeyFromEncryptionKey();
};

// Create API key from encryption key if not set in environment
function createApiKeyFromEncryptionKey() {
    const crypto = require('crypto');
    const key = process.env.ENCRYPTION_KEY || 'default-key';
    const hash = crypto.createHash('sha256');
    hash.update(key);
    return hash.digest('hex');
}

// Special middleware that logs requests to debug API key issues
router.use((req, res, next) => {
    console.log(`[secureKeysRoutes] Received request for: ${req.method} ${req.path}`);
    console.log(`[secureKeysRoutes] Headers: ${JSON.stringify(req.headers)}`);
    next();
});

// Apply API key validation to protected routes
// router.use(validateApiKey);  // Disabled for now as we're handling validation per route

// Initial authentication - no API key needed for these
router.post('/verify-password', secureKeysController.verifyPassword);
router.post('/verify-session', secureKeysController.verifySession);

// API key endpoint - only accessible with valid JWT token
router.get('/config/api-key', verifyAdminToken, (req, res) => {
    try {
        // Return API key to authenticated client
        res.json({
            success: true,
            apiKey: getApiKey()
        });
    } catch (error) {
        console.error('Error providing API key:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Protected routes (require valid JWT token)
// Bypassing API key validation for recovery phrase verification
router.post('/verify-recovery-phrase', verifyAdminToken, secureKeysController.verifyRecoveryPhrase);

// These routes require both token and API key
router.post('/reveal-key', [verifyAdminToken, validateApiKey], secureKeysController.revealKey);
router.post('/update-key', [verifyAdminToken, validateApiKey], secureKeysController.updateKey);

module.exports = router; 