/**
 * Secure Keys Controller
 * Handles secure access to wallet keys with multiple security layers
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { logToFile } = require('../utils/logger');
const { getSecret, updateSecret, getStoredKeys, updateStoredKeys } = require('../utils/secretsManager');
const { decrypt } = require('../../encryptionUtils');

// Secret for JWT tokens - should be in env vars in production
const JWT_SECRET = process.env.JWT_SECRET || 'securekeys-jwt-secret-changeme-in-production';
// Admin password from env
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Recovery phrase from env
const RECOVERY_PHRASE = process.env.RECOVERY_PHRASE;
// Secret key password from env
const SECRET_KEY_PASSWORD = process.env.SECRET_KEY_PASSWORD;

// Check if we're in test mode
const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';
// Explicitly enable mock usage if set (default is false)
const USE_MOCK_SECRETS = process.env.USE_MOCK_SECRETS === 'true';

// Mock data for testing only - never used in production
const MOCK_KEYS = {
  hdKey: 'test-hdwallet-key-12345abcde',
  mnemonic: 'test wallet recovery phrase please do not use in production environment',
  masterKey: 'test-master-key-67890fghij',
  privateKey: 'test-private-key-54321zyxwv'
};

// Test credentials - only used in test mode + USE_MOCK_SECRETS mode
const TEST_ADMIN_PASSWORD = 'Admin';
const TEST_SECRET_PASSWORD = 'Admin123';
const TEST_RECOVERY_PHRASE = 'test wallet recovery phrase please do not use in production environment';

// Check required environment variables
function checkEnvironmentSetup() {
    const missing = [];
    
    if (!TEST_MODE || !USE_MOCK_SECRETS) {
        if (!ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
        if (!RECOVERY_PHRASE) missing.push('RECOVERY_PHRASE');
        if (!SECRET_KEY_PASSWORD) missing.push('SECRET_KEY_PASSWORD');
    }
    
    return {
        isConfigured: missing.length === 0,
        missing
    };
}

// Special check for the test recovery phrase which may not follow the 12-14 word rule
function isValidRecoveryPhrase(phrase, storedPhrase) {
    // Normalize both phrases
    const normalizedPhrase = phrase.trim().toLowerCase();
    const normalizedStoredPhrase = storedPhrase.trim().toLowerCase();
    
    // Direct comparison
    return normalizedPhrase === normalizedStoredPhrase;
}

// Helper function to ensure key values are strings and decrypt if needed
function getStringValue(value, shouldDecrypt = false) {
  if (value === undefined || value === null) {
    return '';
  }
  
  // If it's an object with encryption properties, ALWAYS return the encrypted format
  if (typeof value === 'object' && value.iv && value.encryptedData) {
    console.log('Processing encrypted object with iv and encryptedData');
    // Never decrypt, always return the encrypted object as a string
    return JSON.stringify({
      iv: value.iv,
      encryptedData: value.encryptedData
    });
  }
  
  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }
  
  // If it's an object, it might be a complex key structure or JSON object
  if (typeof value === 'object') {
    // Check if it has an 'encryptedData' property
    if (value.encryptedData) {
      console.log('Object has encryptedData property');
      return JSON.stringify(value);
    }
    
    // For other objects, stringify them
    console.log('Generic object, stringifying');
    return JSON.stringify(value);
  }
  
  // For other types, convert to string
  return String(value);
}

// Get wallet keys (prioritizing actual keys from storage)
async function getWalletKeys() {
  try {
    // Only use mock data if explicitly in test mode AND mock secrets are enabled
    if (TEST_MODE && USE_MOCK_SECRETS) {
      console.log('Using mock keys for testing (explicitly enabled)');
      return MOCK_KEYS;
    }
    
    // Store original keys.json structure to preserve all properties
    let originalKeysJsonStructure = {};
    try {
      const fs = require('fs');
      const path = require('path');
      const keysJsonPath = path.join(__dirname, '../../Json/keys.json');
      
      if (fs.existsSync(keysJsonPath)) {
        const keysJsonContent = fs.readFileSync(keysJsonPath, 'utf8');
        originalKeysJsonStructure = JSON.parse(keysJsonContent);
        console.log('Original keys.json structure preserved with properties:', 
                   Object.keys(originalKeysJsonStructure).join(', '));
      }
    } catch (readError) {
      console.error('Error reading original keys.json:', readError.message);
    }
    
    // Try to get actual keys from storage (local files)
    console.log('Attempting to get actual wallet keys');
    const actualKeys = await getStoredKeys();
    
    console.log('Raw keys from storage:', Object.keys(actualKeys));
    
    // If we got valid keys, format them properly
    if (actualKeys && Object.keys(actualKeys).length > 0) {
      console.log('Successfully retrieved actual wallet keys');
      
      // Try to get privateKey from its own file
      let privateKey = '';
      try {
        // Get private key from its dedicated file
        console.log('Attempting to load private key from secure/privateKey.json');
        
        // Try directly reading the file (most reliable method)
        try {
          const fs = require('fs');
          const path = require('path');
          const privateKeyPath = path.join(__dirname, '../../secure/privateKey.json');
          
          if (fs.existsSync(privateKeyPath)) {
            const privateKeyData = fs.readFileSync(privateKeyPath, 'utf8');
            privateKey = JSON.parse(privateKeyData);
            console.log('Successfully loaded private key from secure/privateKey.json');
          } else {
            console.warn('Private key file does not exist at: secure/privateKey.json');
          }
        } catch (fsError) {
          console.error('Error reading private key file directly:', fsError.message);
        }
        
        // Fallback to getSecret if direct reading failed
        if (!privateKey) {
          console.log('Attempting fallback methods to load private key...');
          
          // Try both naming formats for private key
          let privateKeySecret;
          try {
            privateKeySecret = await getSecret('blockchain-pg-private-key');
          } catch (e) {
            // Try with alternate file name
            privateKeySecret = await getSecret('privateKey');
          }
          
          if (privateKeySecret) {
            console.log('Private key secret structure:', typeof privateKeySecret === 'object' ? Object.keys(privateKeySecret) : 'string');
            privateKey = privateKeySecret;
          } else {
            console.warn('Private key not found in any location');
          }
        }
      } catch (error) {
        console.error('Error getting private key:', error);
      }
      
      console.log('Private key loaded:', privateKey ? 'YES' : 'NO', 
                 privateKey ? `(${typeof privateKey === 'object' ? 'object with keys: ' + Object.keys(privateKey).join(', ') : 'string'})` : '');
      
      // Standardize keys format - map from storage format to expected format
      // while preserving the original structure and special properties
      const formattedKeys = {
        hdKey: actualKeys.hdKey || actualKeys.mnemonic || '',
        mnemonic: actualKeys.mnemonic || '',
        masterKey: actualKeys.masterKey || '',
        privateKey: privateKey || actualKeys.privateKey || ''
      };
      
      // Attach the original structure so it can be preserved during updates
      formattedKeys._originalStructure = originalKeysJsonStructure;
      
      // Log keys structure without exposing values
      console.log('Keys structure:', Object.keys(formattedKeys));
      return formattedKeys;
    }
    
    // If we're here, no keys found and we're in test mode - use mock as fallback
    if (TEST_MODE) {
      console.log('No actual keys found and in test mode. Using mock keys as fallback.');
      return MOCK_KEYS;
    }
    
    // No keys available
    console.error('ERROR: No wallet keys found in any storage location');
    return {};
  } catch (error) {
    console.error('Error getting wallet keys:', error);
    
    // In test mode, fallback to mock data even on error
    if (TEST_MODE) {
      console.log('Error retrieving keys and in test mode. Using mock keys as fallback.');
      return MOCK_KEYS;
    }
    
    throw error;
  }
}

// Update wallet keys
async function updateWalletKeys(updatedKeys) {
  try {
    // In test mode with mock secrets enabled, just update our mock object
    if (TEST_MODE && USE_MOCK_SECRETS) {
      console.log('Test mode with mock secrets: Updating mock keys only');
      Object.assign(MOCK_KEYS, updatedKeys);
      return true;
    }
    
    const fs = require('fs');
    const path = require('path');
    const keysFilePath = path.join(__dirname, '../../Json/keys.json');
    
    // Start with the original structure if available
    let keysToSave = {};
    
    // If the keys.json file exists, read it first to preserve its structure
    if (fs.existsSync(keysFilePath)) {
      try {
        const keysFileContent = fs.readFileSync(keysFilePath, 'utf8');
        keysToSave = JSON.parse(keysFileContent);
        console.log('Preserved existing keys.json structure with properties:', Object.keys(keysToSave).join(', '));
      } catch (readError) {
        console.error('Error reading keys.json for preservation:', readError.message);
      }
    }
    
    // Check if we have the original structure stored in updatedKeys
    if (updatedKeys._originalStructure && Object.keys(updatedKeys._originalStructure).length > 0) {
      console.log('Using preserved original structure from _originalStructure');
      // Start with original structure but don't overwrite existing keysToSave
      keysToSave = { ...updatedKeys._originalStructure, ...keysToSave };
      // Remove the _originalStructure property as it shouldn't be saved
      delete updatedKeys._originalStructure;
    }
    
    // Apply only the specific updates, preserving everything else
    if (updatedKeys.hdKey !== undefined) keysToSave.hdKey = updatedKeys.hdKey;
    if (updatedKeys.mnemonic !== undefined) keysToSave.mnemonic = updatedKeys.mnemonic;
    if (updatedKeys.masterKey !== undefined) keysToSave.masterKey = updatedKeys.masterKey;
    
    // Don't update privateKey in keys.json if it's already in a separate file
    const privateKeyPath = path.join(__dirname, '../../secure/privateKey.json');
    const privateKeyInSeparateFile = fs.existsSync(privateKeyPath);
    
    // Only update privateKey in keys.json if it doesn't exist in a separate file
    // or if we're specifically updating it
    if (!privateKeyInSeparateFile && updatedKeys.privateKey !== undefined) {
      keysToSave.privateKey = updatedKeys.privateKey;
    }
    
    // Make sure we preserve any other properties present in the original file
    // like activeAddresses, derivationPath, etc.
    console.log(`Final keys.json structure will have properties: ${Object.keys(keysToSave).join(', ')}`);
    
    // Save to keys.json
    try {
      const dir = path.dirname(keysFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(keysFilePath, JSON.stringify(keysToSave, null, 2), 'utf8');
      console.log('Successfully updated keys.json while preserving original structure');
    } catch (writeError) {
      console.error('Error writing to keys.json:', writeError.message);
      return false;
    }
    
    // If privateKey is being updated and the separate file exists, update it too
    if (updatedKeys.privateKey !== undefined && privateKeyInSeparateFile) {
      try {
        fs.writeFileSync(privateKeyPath, JSON.stringify(updatedKeys.privateKey, null, 2), 'utf8');
        console.log('Successfully updated separate privateKey.json file');
      } catch (pkError) {
        console.error('Error updating privateKey.json:', pkError.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error updating wallet keys:', error);
    throw error;
  }
}

// Token expiration time
const TOKEN_EXPIRY = '1h'; // 1 hour

/**
 * Verify admin password and generate session token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.verifyPassword = async (req, res) => {
    try {
        const { password } = req.body;
        
        // Check if password is provided
        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Password is required'
            });
        }
        
        // Check if environment is configured
        const envCheck = checkEnvironmentSetup();
        if (!envCheck.isConfigured) {
            logToFile(`WARNING: Missing environment variables: ${envCheck.missing.join(', ')}`);
            
            // If in test mode with mocks enabled, we can proceed with default test values
            if (!(TEST_MODE && USE_MOCK_SECRETS)) {
                return res.status(500).json({
                    success: false,
                    error: `Server environment not properly configured. Missing: ${envCheck.missing.join(', ')}`
                });
            }
        }
        
        // Verify the password
        const correctPassword = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_ADMIN_PASSWORD : ADMIN_PASSWORD;
        
        if (password !== correctPassword) {
            // Log failed attempt
            logToFile(`SECURITY WARNING: Failed login attempt with incorrect admin password from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Incorrect admin password'
            });
        }
        
        // Password correct, generate JWT token
        const token = jwt.sign(
            { 
                type: 'admin-session',
                timestamp: Date.now()
            }, 
            JWT_SECRET, 
            { expiresIn: TOKEN_EXPIRY }
        );
        
        // Log successful authentication
        logToFile(`Admin successfully authenticated from IP: ${req.ip}`);
        
        return res.json({
            success: true,
            token,
            testMode: TEST_MODE && USE_MOCK_SECRETS
        });
    } catch (error) {
        logToFile(`Error in verifyPassword: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during password verification'
        });
    }
};

/**
 * Verify session token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.verifySession = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No authentication token provided'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        try {
            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            return res.json({
                success: true,
                message: 'Session valid',
                testMode: TEST_MODE && USE_MOCK_SECRETS
            });
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session token'
            });
        }
    } catch (error) {
        logToFile(`Error in verifySession: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during session verification'
        });
    }
};

/**
 * Verify recovery phrase and secret password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.verifyRecoveryPhrase = async (req, res) => {
    try {
        const { phrase, password } = req.body;
        
        // Check if phrase and password are provided
        if (!phrase || !password) {
            return res.status(400).json({
                success: false,
                error: 'Recovery phrase and secret password are required'
            });
        }
        
        // Check if environment is configured
        const envCheck = checkEnvironmentSetup();
        if (!envCheck.isConfigured && !(TEST_MODE && USE_MOCK_SECRETS)) {
            logToFile(`WARNING: Missing environment variables: ${envCheck.missing.join(', ')}`);
            return res.status(500).json({
                success: false,
                error: `Server environment not properly configured. Missing: ${envCheck.missing.join(', ')}`
            });
        }
        
        // Get the correct credentials
        const correctPhrase = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_RECOVERY_PHRASE : RECOVERY_PHRASE;
        const correctPassword = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_SECRET_PASSWORD : SECRET_KEY_PASSWORD;
        
        // Verify recovery phrase using our special function
        const isValidPhrase = isValidRecoveryPhrase(phrase, correctPhrase);
        
        // Verify the password
        if (!isValidPhrase || password !== correctPassword) {
            // Log failed attempt
            logToFile(`SECURITY WARNING: Failed recovery verification attempt from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Incorrect recovery phrase or secret password'
            });
        }
        
        // Get keys but mask them for initial display
        let keys = {};
        
        try {
            // Get wallet keys from JSON files
            const walletKeys = await getWalletKeys();
            
            // Extract relevant data
            keys = {
                hdWalletKey: getStringValue(walletKeys.hdKey || walletKeys.mnemonic || '', false),
                mnemonicPhrase: getStringValue(walletKeys.mnemonic || '', false),
                masterKey: getStringValue(walletKeys.masterKey || '', false),
                privateKey: getStringValue(walletKeys.privateKey || '', false)
            };
            
            // Log successful verification
            logToFile(`Admin successfully verified with recovery phrase from IP: ${req.ip}`);
            
            return res.json({
                success: true,
                keys,
                testMode: TEST_MODE && USE_MOCK_SECRETS
            });
        } catch (keysError) {
            logToFile(`Error retrieving keys: ${keysError.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error retrieving wallet keys'
            });
        }
    } catch (error) {
        logToFile(`Error in verifyRecoveryPhrase: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during recovery phrase verification'
        });
    }
};

/**
 * Reveal full key of specified type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.revealKey = async (req, res) => {
    try {
        const { keyType, password, recoveryPhrase } = req.body;
        
        // Check if all required fields are provided
        if (!keyType || !password || !recoveryPhrase) {
            return res.status(400).json({
                success: false,
                error: 'Key type, password, and recovery phrase are required'
            });
        }
        
        // Get the correct credentials
        const correctPhrase = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_RECOVERY_PHRASE : RECOVERY_PHRASE;
        const correctPassword = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_SECRET_PASSWORD : SECRET_KEY_PASSWORD;
        
        // Verify recovery phrase using our special function
        const isValidPhrase = isValidRecoveryPhrase(recoveryPhrase, correctPhrase);
        
        // Verify the password
        if (!isValidPhrase || password !== correctPassword) {
            // Log failed attempt
            logToFile(`SECURITY WARNING: Failed key reveal attempt from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Incorrect recovery phrase or secret password'
            });
        }
        
        // Get the actual key
        try {
            // Get wallet keys from JSON files
            const walletKeys = await getWalletKeys();
            
            console.log('Retrieved wallet keys for reveal:', Object.keys(walletKeys));
            
            // Special handling for privateKey
            if (keyType === 'privateKey') {
                console.log('Handling privateKey reveal request');
                
                // Check if privateKey exists in walletKeys
                if (!walletKeys.privateKey) {
                    console.error('Private key not found in wallet keys');
                    return res.status(404).json({
                        success: false,
                        error: 'Private key not found'
                    });
                }
                
                // Format the private key properly
                const privateKey = walletKeys.privateKey;
                console.log('Private key type:', typeof privateKey);
                
                // IMPORTANT: Always return encrypted format - never decrypt
                const keyString = getStringValue(privateKey, false);
                
                // Check if this is a reveal request or just a format check
                const shouldRevealFull = req.body.revealFull === true;
                
                // Apply masking if not requesting full reveal - extract just the encryptedData for display
                let displayValue;
                try {
                    // Parse the key string to see if it's in the encrypted format
                    const parsedKey = JSON.parse(keyString);
                    if (parsedKey && parsedKey.encryptedData) {
                        // Just use the encryptedData for display, with or without masking
                        displayValue = shouldRevealFull ? 
                            parsedKey.encryptedData : 
                            maskString(parsedKey.encryptedData);
                    } else {
                        // Not in encrypted format, use the regular masking
                        displayValue = shouldRevealFull ? keyString : maskEncryptedKey(keyString);
                    }
                } catch (e) {
                    // Not JSON, use regular string masking
                    displayValue = shouldRevealFull ? keyString : maskString(keyString);
                }
                
                // Log key reveal
                logToFile(`Admin revealed private key from IP: ${req.ip} (format: encrypted${shouldRevealFull ? ', full' : ', masked'})`);
                
                return res.json({
                    success: true,
                    key: displayValue,
                    isEncrypted: typeof privateKey === 'object' && privateKey.iv && privateKey.encryptedData,
                    // Include the full structure for API compatibility, but it won't be displayed in UI
                    encryptedFormat: typeof privateKey === 'object' && privateKey.iv && privateKey.encryptedData ? 
                        { iv: privateKey.iv, encryptedData: maskString(privateKey.encryptedData) } : null,
                    testMode: TEST_MODE && USE_MOCK_SECRETS
                });
            }
            
            // Map key type to the actual key in wallet keys
            const keyMap = {
                'hdWalletKey': walletKeys.hdKey || walletKeys.mnemonic,
                'mnemonicPhrase': walletKeys.mnemonic,
                'masterKey': walletKeys.masterKey
            };
            
            // Get the requested key
            const key = keyMap[keyType];
            
            if (!key) {
                console.error(`Key of type "${keyType}" not found in:`, Object.keys(walletKeys));
                return res.status(404).json({
                    success: false,
                    error: `Key of type "${keyType}" not found`
                });
            }
            
            // IMPORTANT: Always return encrypted format - never decrypt
            const keyString = getStringValue(key, false);
            
            // Check if this is a reveal request or just a format check
            const shouldRevealFull = req.body.revealFull === true;
            
            // Apply masking if not requesting full reveal
            // Modified to extract just the encryptedData for display
            let displayValue;
            try {
                // Parse the key string to see if it's in the encrypted format
                const parsedKey = JSON.parse(keyString);
                if (parsedKey && parsedKey.encryptedData) {
                    // Just use the encryptedData for display, with or without masking
                    displayValue = shouldRevealFull ? 
                        parsedKey.encryptedData : 
                        maskString(parsedKey.encryptedData);
                } else {
                    // Not in encrypted format, use the regular masking
                    displayValue = shouldRevealFull ? keyString : maskEncryptedKey(keyString);
                }
            } catch (e) {
                // Not JSON, use regular string masking
                displayValue = shouldRevealFull ? keyString : maskString(keyString);
            }
            
            // Log key reveal
            logToFile(`Admin revealed key of type "${keyType}" from IP: ${req.ip} (format: encrypted${shouldRevealFull ? ', full' : ', masked'})`);
            
            return res.json({
                success: true,
                key: displayValue,
                isEncrypted: typeof key === 'object' && key.iv && key.encryptedData,
                // Include the full structure for API compatibility, but it won't be displayed in UI
                encryptedFormat: typeof key === 'object' && key.iv && key.encryptedData ? 
                    { iv: key.iv, encryptedData: maskString(key.encryptedData) } : null,
                testMode: TEST_MODE && USE_MOCK_SECRETS
            });
        } catch (keysError) {
            logToFile(`Error retrieving keys: ${keysError.message}`);
            return res.status(500).json({
                success: false,
                error: 'Error retrieving wallet keys'
            });
        }
    } catch (error) {
        logToFile(`Error in revealKey: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during key reveal'
        });
    }
};

// Add a function to mask encrypted keys specifically
function maskEncryptedKey(encryptedKeyJson) {
    try {
        console.log('Masking encrypted key:', typeof encryptedKeyJson === 'string' ? 'string format' : 'object format');
        
        // Parse the JSON if it's a string
        const encryptedKey = typeof encryptedKeyJson === 'string' ? 
            JSON.parse(encryptedKeyJson) : encryptedKeyJson;
        
        // Ensure it has the expected structure
        if (!encryptedKey || (typeof encryptedKey === 'object' && (!encryptedKey.iv || !encryptedKey.encryptedData))) {
            console.warn('Invalid encrypted key format for masking');
            return maskString(typeof encryptedKeyJson === 'string' ? encryptedKeyJson : JSON.stringify(encryptedKeyJson));
        }
        
        // Create a copy with masked encryptedData
        const maskedKey = {
            iv: encryptedKey.iv,
            encryptedData: maskString(encryptedKey.encryptedData)
        };
        
        console.log('Successfully masked encrypted key');
        return JSON.stringify(maskedKey);
    } catch (error) {
        console.error('Error masking encrypted key:', error);
        
        // Fallback to simple string masking
        return maskString(String(encryptedKeyJson));
    }
}

// Update the maskString function to handle longer strings
function maskString(str) {
    if (!str) return '';
    
    if (typeof str !== 'string') {
        str = String(str);
    }
    
    // For short strings, mask most characters
    if (str.length <= 10) {
        return str.substring(0, 2) + '•••••' + str.substring(str.length - 2);
    }
    
    // For medium strings
    if (str.length <= 60) {
        return str.substring(0, 8) + ' • • • • • • • • ' + str.substring(str.length - 8);
    }
    
    // For longer strings, show more context at the start and end with clear separator
    return str.substring(0, 10) + ' ••••••••••••••••••••••••• ' + str.substring(str.length - 10);
}

/**
 * Update key of specified type
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateKey = async (req, res) => {
    try {
        const { keyType, newValue, password, recoveryPhrase } = req.body;
        
        // Check if all required fields are provided
        if (!keyType || !newValue || !password || !recoveryPhrase) {
            return res.status(400).json({
                success: false,
                error: 'Key type, new value, password, and recovery phrase are required'
            });
        }
        
        // Get the correct credentials
        const correctPhrase = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_RECOVERY_PHRASE : RECOVERY_PHRASE;
        const correctPassword = (TEST_MODE && USE_MOCK_SECRETS) ? TEST_SECRET_PASSWORD : SECRET_KEY_PASSWORD;
        
        // Verify recovery phrase using our special function
        const isValidPhrase = isValidRecoveryPhrase(recoveryPhrase, correctPhrase);
        
        // Verify the password
        if (!isValidPhrase || password !== correctPassword) {
            // Log failed attempt
            logToFile(`SECURITY WARNING: Failed key update attempt from IP: ${req.ip}`);
            
            return res.status(401).json({
                success: false,
                error: 'Incorrect recovery phrase or secret password'
            });
        }
        
        // Update the key
        try {
            // Map key type to the actual key in wallet keys
            const keyMap = {
                'hdWalletKey': 'hdKey',
                'mnemonicPhrase': 'mnemonic',
                'masterKey': 'masterKey',
                'privateKey': 'privateKey'
            };
            
            // Get the key to update
            const keyToUpdate = keyMap[keyType];
            if (!keyToUpdate) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid key type: ${keyType}`
                });
            }
            
            // Special case for mnemonic phrase - enforce encryption
            if (keyToUpdate === 'mnemonic') {
                // For mnemonic, only accept already encrypted format to prevent
                // admins from using raw mnemonic phrases
                try {
                    // Check if the new value is in proper encryption format
                    let parsedValue = newValue;
                    if (typeof newValue === 'string') {
                        if (newValue.trim().startsWith('{')) {
                            try {
                                parsedValue = JSON.parse(newValue);
                            } catch (e) {
                                return res.status(400).json({
                                    success: false,
                                    error: 'Invalid JSON format for encrypted key'
                                });
                            }
                        } else {
                            return res.status(400).json({
                                success: false,
                                error: 'For security reasons, mnemonic phrases must be updated using encrypted format only'
                            });
                        }
                    }
                    
                    // Verify it has the proper structure
                    if (!parsedValue.iv || !parsedValue.encryptedData) {
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid encrypted key format. Must include both "iv" and "encryptedData" fields'
                        });
                    }
                } catch (e) {
                    return res.status(400).json({
                        success: false,
                        error: 'For security reasons, mnemonic phrases must be updated using encrypted format only'
                    });
                }
            }
            
            // First, read both key files directly to ensure we're working with the latest data
            logToFile(`Updating ${keyToUpdate} in keys.json`);

            // Read the main keys.json file directly to ensure we preserve all original properties
            const fs = require('fs');
            const path = require('path');
            const keysFilePath = path.join(__dirname, '../../Json/keys.json');

            let mainKeysData = {};
            if (fs.existsSync(keysFilePath)) {
                try {
                    const keysFileContent = fs.readFileSync(keysFilePath, 'utf8');
                    mainKeysData = JSON.parse(keysFileContent);
                    logToFile(`Successfully read keys.json file with properties: ${Object.keys(mainKeysData).join(', ')}`);
                } catch (readError) {
                    logToFile(`Error reading keys.json: ${readError.message}`);
                    // Don't return an error yet, try using the API method as fallback
                    console.log('Falling back to API method for key update');
                    
                    // Before we fall back, we need to process the new value properly
                    // This is the same logic that's used below
                    let fallbackProcessedValue;
                    
                    // We don't have currentKey info, so handle the new value based on its format
                    try {
                        if (typeof newValue === 'string' && newValue.trim().startsWith('{')) {
                            // Try to parse as JSON
                            const parsedValue = JSON.parse(newValue);
                            if (parsedValue.iv && parsedValue.encryptedData) {
                                // It's already in correct encrypted format
                                fallbackProcessedValue = parsedValue;
                            } else {
                                // Invalid format
                                fallbackProcessedValue = newValue;
                            }
                        } else {
                            // Plain string
                            fallbackProcessedValue = newValue;
                        }
                    } catch (e) {
                        // If parsing fails, use as is
                        fallbackProcessedValue = newValue;
                    }
                    
                    // Get current wallet keys through the API
                    const walletKeys = await getWalletKeys();
                    
                    // Apply our update with the processed value
                    walletKeys[keyToUpdate] = fallbackProcessedValue;
                    
                    // Save through the API which will handle preservation
                    await updateWalletKeys(walletKeys);
                    
                    // Log key update
                    logToFile(`Admin successfully updated key of type "${keyType}" from IP: ${req.ip}`);
                    
                    return res.json({
                        success: true,
                        message: `Key ${keyType} updated successfully`,
                        testMode: TEST_MODE && USE_MOCK_SECRETS
                    });
                }
            }
            
            // Process the new value to match existing format for the target key
            let processedValue;
            const currentKey = mainKeysData[keyToUpdate];
            
            if (typeof currentKey === 'object' && currentKey && currentKey.iv && currentKey.encryptedData) {
                // Current key is in encrypted format, maintain that structure
                try {
                    // Try to parse if the new value is a JSON string
                    const parsedValue = typeof newValue === 'string' && newValue.trim().startsWith('{') ?
                        JSON.parse(newValue) : newValue;
                        
                    if (typeof parsedValue === 'object' && parsedValue.iv && parsedValue.encryptedData) {
                        // Full replacement with new iv + encryptedData
                        processedValue = parsedValue;
                    } else if (typeof parsedValue === 'string') {
                        // Just update encryptedData, keep the same iv
                        processedValue = {
                            iv: currentKey.iv,
                            encryptedData: parsedValue
                        };
                    } else {
                        // Invalid format
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid format for encrypted key update'
                        });
                    }
                } catch (e) {
                    // If parsing fails but it's a string, assume it's the encryptedData portion
                    if (typeof newValue === 'string') {
                        processedValue = {
                            iv: currentKey.iv,
                            encryptedData: newValue
                        };
                    } else {
                        return res.status(400).json({
                            success: false,
                            error: 'Invalid format for key update'
                        });
                    }
                }
            } else if (typeof currentKey === 'string') {
                // For string keys, keep as string
                processedValue = String(newValue);
            } else {
                // For new keys or other formats, use as provided
                try {
                    // Try to parse if it's a JSON string
                    if (typeof newValue === 'string' && newValue.trim().startsWith('{')) {
                        processedValue = JSON.parse(newValue);
                    } else {
                        processedValue = newValue;
                    }
                } catch (e) {
                    processedValue = newValue;
                }
            }
            
            // Update the key in the main keys.json data
            mainKeysData[keyToUpdate] = processedValue;
            
            // Write the updated keys.json file
            try {
                // Make sure the directory exists
                const keysDir = path.dirname(keysFilePath);
                if (!fs.existsSync(keysDir)) {
                    fs.mkdirSync(keysDir, { recursive: true });
                }
                
                // Write the file
                fs.writeFileSync(keysFilePath, JSON.stringify(mainKeysData, null, 2), 'utf8');
                logToFile(`Successfully updated ${keyToUpdate} in keys.json`);
            } catch (writeError) {
                logToFile(`Error writing keys.json: ${writeError.message}`);
                return res.status(500).json({
                    success: false,
                    error: `Failed to update keys.json: ${writeError.message}`
                });
            }
            
            // 2. For privateKey, also update the separate file if it exists
            if (keyToUpdate === 'privateKey') {
                const privateKeyPath = path.join(__dirname, '../../secure/privateKey.json');
                
                if (fs.existsSync(privateKeyPath)) {
                    try {
                        fs.writeFileSync(privateKeyPath, JSON.stringify(processedValue, null, 2), 'utf8');
                        logToFile('Successfully updated privateKey.json file');
                    } catch (pkError) {
                        logToFile(`Error updating privateKey.json: ${pkError.message}`);
                        // Continue anyway since we've already updated keys.json
                    }
                }
            }
            
            // 3. Also use the secretsManager to ensure all caches are updated
            try {
                // Get current wallet keys through the API
                const walletKeys = await getWalletKeys();
                
                // Apply our update
                walletKeys[keyToUpdate] = processedValue;
                
                // Save through the API
                await updateWalletKeys(walletKeys);
                logToFile(`Successfully updated ${keyToUpdate} through secretsManager API`);
            } catch (apiError) {
                logToFile(`Warning: Secondary update through API failed: ${apiError.message}`);
                // Continue anyway since we've already updated the files directly
            }
            
            // Log key update
            logToFile(`Admin successfully updated key of type "${keyType}" from IP: ${req.ip}`);
            
            return res.json({
                success: true,
                message: `Key ${keyType} updated successfully`,
                testMode: TEST_MODE && USE_MOCK_SECRETS
            });
        } catch (updateError) {
            logToFile(`Error updating keys: ${updateError.message}`);
            return res.status(500).json({
                success: false,
                error: `Error updating key: ${updateError.message}`
            });
        }
    } catch (error) {
        logToFile(`Error in updateKey: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Server error during key update'
        });
    }
}; 