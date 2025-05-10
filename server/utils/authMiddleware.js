/**
 * Authentication Middleware
 * Provides JWT token verification for protected routes
 */

const jwt = require('jsonwebtoken');
const { logToFile } = require('./logger');

// Secret for JWT tokens - should be in env vars in production
const JWT_SECRET = process.env.JWT_SECRET || 'securekeys-jwt-secret-changeme-in-production';

/**
 * Middleware to verify admin JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.verifyAdminToken = (req, res, next) => {
    try {
        // Get authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        // Extract token
        const token = authHeader.split(' ')[1];
        
        try {
            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Check if it's an admin session token
            if (decoded.type !== 'admin-session') {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid token type'
                });
            }
            
            // Add decoded token data to request
            req.user = decoded;
            
            // Continue to next middleware
            next();
        } catch (tokenError) {
            // Log invalid token attempt
            logToFile(`SECURITY WARNING: Invalid token used from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
    } catch (error) {
        logToFile(`Error in verifyAdminToken middleware: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during authentication'
        });
    }
}; 