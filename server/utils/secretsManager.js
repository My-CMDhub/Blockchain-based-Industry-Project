/**
 * JSON File-based Secret Manager utilities for secure key storage
 * @module secretsManager
 */

const fs = require('fs');
const path = require('path');
const { logToFile } = require('./logger');

// Path for local secrets
const SECURE_DIR = path.join(__dirname, '../../secure');
const SENSITIVE_KEYS_FILE = path.join(SECURE_DIR, 'keys.json');
const METADATA_FILE = path.join(__dirname, '../../Json/keys.json');
const PRIVATE_KEY_FILE = path.join(SECURE_DIR, 'privateKey.json');
const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';

// Initialize with message indicating JSON-only mode
console.log('JSON file-based secrets management enabled. Using local file storage only.');

// Ensure secure directory exists
try {
  if (!fs.existsSync(SECURE_DIR)) {
    fs.mkdirSync(SECURE_DIR, { recursive: true });
    console.log(`Created secure directory: ${SECURE_DIR}`);
  }
} catch (err) {
  console.error(`Error creating secure directory: ${err.message}`);
}

/**
 * Get a secret from local file storage
 * @param {string} secretName - Name of the secret
 * @returns {Promise<Object>} - The secret value as an object
 */
async function getSecret(secretName) {
    // Only use mock data in test mode if explicitly configured to do so
    if (TEST_MODE && process.env.USE_MOCK_SECRETS === 'true') {
        console.log('Test mode with mock secrets enabled, using mock data');
        return getMockSecret(secretName);
    }
    
    // Special case for blockchain-pg-keys: use sensitive keys file
    if (secretName === 'blockchain-pg-keys') {
        try {
            return await getSensitiveKeys();
        } catch (error) {
            console.error('Error getting sensitive keys:', error.message);
            return {};
        }
    }
    
    // Special case for privateKey: use dedicated private key file
    if (secretName === 'privateKey' || secretName === 'blockchain-pg-private-key') {
        try {
            return await getPrivateKey();
        } catch (error) {
            console.error('Error getting private key:', error.message);
            return {};
        }
    }
    
    // For other secrets, try to read from secure directory
    try {
        console.log(`Attempting to read ${secretName} from secure directory`);
        const secretPath = path.join(SECURE_DIR, `${secretName}.json`);
        
        if (!fs.existsSync(secretPath)) {
            throw new Error(`Secret file ${secretName}.json not found`);
        }
        
        const data = fs.readFileSync(secretPath, 'utf8');
        const secretValue = JSON.parse(data);
        console.log(`Successfully retrieved ${secretName} from secure directory`);
        return secretValue;
    } catch (error) {
        console.error(`Error reading secret from secure directory: ${error.message}`);
        return {};
    }
}

/**
 * Update a secret in local file storage
 * @param {string} secretName - Name of the secret
 * @param {Object} secretValue - Secret value as an object
 * @returns {Promise<boolean>} - Success status
 */
async function updateSecret(secretName, secretValue) {
    // In test mode with mock secrets, just log and return success
    if (TEST_MODE && process.env.USE_MOCK_SECRETS === 'true') {
        console.log(`Test mode: Updated mock secret ${secretName}`);
        return true;
    }
    
    // Special case for blockchain-pg-keys: use sensitive keys file
    if (secretName === 'blockchain-pg-keys') {
        try {
            return await updateSensitiveKeys(secretValue);
        } catch (error) {
            console.error('Error updating sensitive keys:', error.message);
            return false;
        }
    }
    
    // Special case for privateKey: use dedicated private key file
    if (secretName === 'privateKey' || secretName === 'blockchain-pg-private-key') {
        try {
            return await updatePrivateKey(secretValue);
        } catch (error) {
            console.error('Error updating private key:', error.message);
            return false;
        }
    }
    
    // For other secrets, write to secure directory
    try {
        // Create secrets directory if it doesn't exist
        if (!fs.existsSync(SECURE_DIR)) {
            fs.mkdirSync(SECURE_DIR, { recursive: true });
        }
        
        const secretPath = path.join(SECURE_DIR, `${secretName}.json`);
        
        // Write the file
        fs.writeFileSync(
            secretPath,
            JSON.stringify(secretValue, null, 2),
            'utf8'
        );
        
        console.log(`Secret ${secretName} updated in secure directory`);
        return true;
    } catch (error) {
        console.error(`Error updating secret in secure directory: ${error.message}`);
        return false;
    }
}

/**
 * Get mock data for testing
 * @param {string} secretName - Name of the secret
 * @returns {Object} - Mock secret data
 */
function getMockSecret(secretName) {
    // Mock secrets for testing
    const mockSecrets = {
        'blockchain-pg-keys': {
            hdKey: 'test-hdwallet-key-12345abcde',
            mnemonic: 'test wallet recovery phrase please do not use in production environment',
            masterKey: 'test-master-key-67890fghij',
            privateKey: 'test-private-key-54321zyxwv'
        }
    };
    
    return mockSecrets[secretName] || {};
}

/**
 * Get wallet metadata (non-sensitive data) from storage
 * @returns {Promise<object>} The wallet metadata
 */
async function getWalletMetadata() {
    try {
        if (!fs.existsSync(METADATA_FILE)) {
            console.log('Metadata file does not exist, creating empty metadata');
            return {};
        }
        
        const data = fs.readFileSync(METADATA_FILE, 'utf8');
        const metadata = JSON.parse(data);
        console.log('Successfully retrieved wallet metadata with properties:', Object.keys(metadata).join(', '));
        return metadata;
    } catch (error) {
        console.error('Error reading wallet metadata:', error.message);
        return {};
    }
}

/**
 * Update wallet metadata (non-sensitive data) in storage
 * @param {object} metadata - The metadata to update
 * @returns {Promise<boolean>} Success status
 */
async function updateWalletMetadata(metadata) {
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(METADATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
        console.log('Successfully updated wallet metadata');
        return true;
    } catch (error) {
        console.error('Error updating wallet metadata:', error.message);
        return false;
    }
}

/**
 * Get sensitive keys from storage
 * @returns {Promise<object>} The sensitive keys
 */
async function getSensitiveKeys() {
    try {
        if (!fs.existsSync(SENSITIVE_KEYS_FILE)) {
            console.log('Sensitive keys file does not exist, checking legacy location...');
            
            // Try to migrate from legacy location
            try {
                await migrateLegacyKeysIfNeeded();
            } catch (migrationError) {
                console.warn('Error during key migration:', migrationError.message);
            }
            
            // Check if file exists after migration
            if (!fs.existsSync(SENSITIVE_KEYS_FILE)) {
                return {};
            }
        }
        
        const data = fs.readFileSync(SENSITIVE_KEYS_FILE, 'utf8');
        const keys = JSON.parse(data);
        console.log('Successfully retrieved sensitive keys with properties:', Object.keys(keys).join(', '));
        return keys;
    } catch (error) {
        console.error('Error reading sensitive keys:', error.message);
        return {};
    }
}

/**
 * Update sensitive keys in storage
 * @param {object} keys - The sensitive keys to update
 * @returns {Promise<boolean>} Success status
 */
async function updateSensitiveKeys(keys) {
    try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(SECURE_DIR)) {
            fs.mkdirSync(SECURE_DIR, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(SENSITIVE_KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
        console.log('Successfully updated sensitive keys');
        return true;
    } catch (error) {
        console.error('Error updating sensitive keys:', error.message);
        return false;
    }
}

/**
 * Get private key from storage
 * @returns {Promise<object>} The private key
 */
async function getPrivateKey() {
    try {
        if (!fs.existsSync(PRIVATE_KEY_FILE)) {
            console.log('Private key file does not exist, checking sensitive keys...');
            
            // Try to get from sensitive keys
            const sensitiveKeys = await getSensitiveKeys();
            if (sensitiveKeys && sensitiveKeys.privateKey) {
                return sensitiveKeys.privateKey;
            }
            
            console.warn('Private key not found in any location');
            return {};
        }
        
        const data = fs.readFileSync(PRIVATE_KEY_FILE, 'utf8');
        const privateKey = JSON.parse(data);
        console.log('Successfully retrieved private key');
        return privateKey;
    } catch (error) {
        console.error('Error reading private key:', error.message);
        return {};
    }
}

/**
 * Update private key in storage
 * @param {object} privateKey - The private key to update
 * @returns {Promise<boolean>} Success status
 */
async function updatePrivateKey(privateKey) {
    try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(SECURE_DIR)) {
            fs.mkdirSync(SECURE_DIR, { recursive: true });
        }
        
        // Write the file
        fs.writeFileSync(PRIVATE_KEY_FILE, JSON.stringify(privateKey, null, 2), 'utf8');
        console.log('Successfully updated private key');
        
        // Also update in sensitive keys
        const sensitiveKeys = await getSensitiveKeys();
        sensitiveKeys.privateKey = privateKey;
        await updateSensitiveKeys(sensitiveKeys);
        
        return true;
    } catch (error) {
        console.error('Error updating private key:', error.message);
        return false;
    }
}

/**
 * Migrate legacy keys if needed
 * @returns {Promise<boolean>} Success status
 */
async function migrateLegacyKeysIfNeeded() {
    console.log('Attempting to migrate keys from legacy locations...');
    
    // Check each potential legacy location
    const legacyFiles = [
        path.join(SECURE_DIR, 'blockchain-pg-keys.json'),
        path.join(__dirname, '../../Json/keys.json')
    ];
    
    let sensitiveKeys = {};
    let metadataFound = false;
    
    // Read keys from legacy locations
    for (const file of legacyFiles) {
        if (fs.existsSync(file)) {
            try {
                const data = fs.readFileSync(file, 'utf8');
                const fileData = JSON.parse(data);
                console.log(`Found legacy keys in ${file} with properties:`, Object.keys(fileData).join(', '));
                
                // Extract sensitive keys
                if (fileData.hdKey || fileData.mnemonic || fileData.masterKey || fileData.privateKey) {
                    sensitiveKeys.hdKey = fileData.hdKey || sensitiveKeys.hdKey;
                    sensitiveKeys.mnemonic = fileData.mnemonic || sensitiveKeys.mnemonic;
                    sensitiveKeys.masterKey = fileData.masterKey || sensitiveKeys.masterKey;
                    sensitiveKeys.privateKey = fileData.privateKey || sensitiveKeys.privateKey;
                }
                
                // Check for metadata
                if (fileData.activeAddresses) {
                    await updateWalletMetadata({
                        activeAddresses: fileData.activeAddresses,
                        // Preserve any other metadata properties
                        ...Object.fromEntries(
                            Object.entries(fileData).filter(([key]) => 
                                !['hdKey', 'mnemonic', 'masterKey', 'privateKey'].includes(key)
                            )
                        )
                    });
                    metadataFound = true;
                }
            } catch (error) {
                console.error(`Error reading legacy file ${file}:`, error.message);
            }
        }
    }
    
    // Save sensitive keys if found
    if (Object.keys(sensitiveKeys).length > 0) {
        await updateSensitiveKeys(sensitiveKeys);
        console.log('Successfully migrated sensitive keys');
    }
    
    // Save empty metadata if none found
    if (!metadataFound) {
        await updateWalletMetadata({});
    }
    
    return true;
}

/**
 * Get wallet keys by combining sensitive keys and metadata
 * @returns {Promise<object>} The combined wallet keys and metadata
 */
async function getStoredKeys() {
    console.log('=== Fetching wallet keys ===');
    
    // Get sensitive keys
    const sensitiveKeys = await getSensitiveKeys();
    
    // Get wallet metadata
    const metadata = await getWalletMetadata();
    
    // Log what we found
    console.log('Found sensitive keys:', Object.keys(sensitiveKeys).join(', '));
    console.log('Found metadata:', Object.keys(metadata).join(', '));
    
    // Return combined data with sensitive keys taking precedence
    const combined = {
        ...metadata,
        ...sensitiveKeys
    };
    
    console.log('=== Combined keys have properties ===', Object.keys(combined).join(', '));
    return combined;
}

/**
 * Update wallet keys by separating sensitive keys and metadata
 * @param {object} keys - The keys to update
 * @returns {Promise<boolean>} Success status
 */
async function updateStoredKeys(keys) {
    console.log('=== Updating wallet keys ===');
    console.log('Keys to update have properties:', Object.keys(keys).join(', '));
    
    // Separate sensitive keys and metadata
    const sensitiveKeys = {};
    const metadata = { ...keys };
    
    // Extract sensitive keys
    ['hdKey', 'mnemonic', 'masterKey', 'privateKey'].forEach(key => {
        if (keys[key] !== undefined) {
            sensitiveKeys[key] = keys[key];
            delete metadata[key];
        }
    });
    
    // Update sensitive keys
    if (Object.keys(sensitiveKeys).length > 0) {
        console.log('Updating sensitive keys with properties:', Object.keys(sensitiveKeys).join(', '));
        await updateSensitiveKeys(sensitiveKeys);
    }
    
    // Update private key separately if provided
    if (keys.privateKey !== undefined) {
        console.log('Updating private key separately');
        await updatePrivateKey(keys.privateKey);
    }
    
    // Update metadata if anything remains
    if (Object.keys(metadata).length > 0) {
        console.log('Updating metadata with properties:', Object.keys(metadata).join(', '));
        await updateWalletMetadata(metadata);
    }
    
    return true;
}

// Export functions
module.exports = {
    getSecret,
    updateSecret,
    getStoredKeys,
    updateStoredKeys,
    getPrivateKey,
    updatePrivateKey,
    getSensitiveKeys,
    updateSensitiveKeys,
    getWalletMetadata,
    updateWalletMetadata,
    migrateLegacyKeysIfNeeded
}; 