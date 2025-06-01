// Authentication utility functions

/**
 * Validate API key from request headers
 * @param {Object} req - Express request object
 * @returns {boolean} - True if API key is valid
 */
function validateApiKey(req) {
    // Get API key from .env or use default
    const API_KEY = process.env.API_KEY || 'ef2d127de37b942baad06145e54b0c619a1f22f95b608e65f3c6b1a7a59dfc47';
    
    try {
        // Get API key from request headers
        const requestApiKey = req.headers['x-api-key'];
        
        // Check if API key is present and valid
        if (!requestApiKey) {
            console.warn('API key missing in request');
            return false;
        }
        
        // Compare API keys
        return requestApiKey === API_KEY;
    } catch (error) {
        console.error('Error validating API key:', error.message);
        return false;
    }
}

module.exports = {
    validateApiKey
}; 