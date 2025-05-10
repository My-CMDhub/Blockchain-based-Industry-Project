/**
 * API Key Validator Middleware
 * Validates API keys for protected endpoints
 */

const crypto = require('crypto');
const { logToFile } = require('./logger');

/**
 * Create API key from encryption key if not set in environment
 * @returns {string} API key
 */
function createApiKeyFromEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY || 'default-key';
    const hash = crypto.createHash('sha256');
    hash.update(key);
    return hash.digest('hex');
}

/**
 * Middleware to validate API key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.validateApiKey = (req, res, next) => {
    try {
        // Get API key from environment or generate from encryption key
        const apiKey = process.env.API_KEY || createApiKeyFromEncryptionKey();
        
        // Log full path for debugging
        console.log(`Validating API key for path: ${req.path} (method: ${req.method})`);
        
        // Skip validation for non-sensitive endpoints and all secure keys authentication endpoints
        if (req.path.startsWith('/verify-password') || 
            req.path.startsWith('/verify-session') || 
            req.path.startsWith('/config/api-key') ||
            req.path.startsWith('/verify-recovery-phrase')) {
            console.log(`Bypassing API key validation for ${req.path}`);
            return next();
        }
        
        // Check header for API key
        const providedKey = req.headers['x-api-key'];
        
        if (!providedKey) {
            console.log(`No API key provided for ${req.path}`);
            logToFile(`SECURITY WARNING: No API key provided for ${req.path} from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: API key required'
            });
        }
        
        if (providedKey !== apiKey) {
            console.log(`Invalid API key provided for ${req.path}`);
            logToFile(`SECURITY WARNING: Invalid API key used for ${req.path} from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid API key'
            });
        }
        
        // API key is valid, proceed
        console.log(`Valid API key for ${req.path}`);
        next();
    } catch (error) {
        console.error(`Error in API key validation: ${error.message}`);
        logToFile(`Error in API key validation: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during API key validation'
        });
    }
}; 