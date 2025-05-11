/**
 * Google Cloud Secret Manager integration for secure key storage
 * @module gcpSecretsManager
 */

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const path = require('path');
const fs = require('fs');
const { logToFile } = require('./logger');

// Path to Google service account credentials
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../secure/blockchain-pg-secrets-d1180136801c.json');

// Project ID for GCP Secret Manager
const PROJECT_ID = 'blockchain-pg-secrets';

// Initialize the GCP Secret Manager client
let secretClient;
try {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    secretClient = new SecretManagerServiceClient({
      keyFilename: SERVICE_ACCOUNT_PATH
    });
    console.log('GCP Secret Manager client initialized with service account credentials');
  } else {
    console.warn('Service account file not found at:', SERVICE_ACCOUNT_PATH);
    console.warn('Attempting to use application default credentials');
    secretClient = new SecretManagerServiceClient();
  }
} catch (err) {
  console.error('Error initializing GCP Secret Manager client:', err.message);
  secretClient = null;
}

/**
 * Map local secret names to GCP Secret Manager names
 * @param {string} localName - Local secret name 
 * @returns {string} - GCP secret name
 */
function mapSecretName(localName) {
  const secretNameMap = {
    'blockchain-pg-keys': 'blockchain-pg-keys',
    'privateKey': 'blockchain-pg-private-key',
    'blockchain-pg-private-key': 'blockchain-pg-private-key',
    // Add more mappings as needed
  };
  
  return secretNameMap[localName] || localName;
}

/**
 * Get a fully qualified secret name
 * @param {string} secretName - Secret name
 * @param {string} version - Secret version, defaults to 'latest'
 * @returns {string} - Fully qualified secret name
 */
function getSecretVersionName(secretName, version = 'latest') {
  return `projects/${PROJECT_ID}/secrets/${mapSecretName(secretName)}/versions/${version}`;
}

/**
 * Get a secret from Google Secret Manager
 * @param {string} secretName - Name of the secret
 * @returns {Promise<Object>} - The secret value as an object
 */
async function getSecret(secretName) {
  if (!secretClient) {
    console.error('GCP Secret Manager client not initialized');
    return {};
  }

  try {
    console.log(`[GCP] Fetching secret: ${secretName}`);
    
    // Get the secret from GCP Secret Manager
    const [version] = await secretClient.accessSecretVersion({
      name: getSecretVersionName(secretName)
    });
    
    // The secret payload is in the data field as a Buffer
    const secretData = version.payload.data.toString('utf8');
    
    try {
      // Parse the secret data as JSON
      const secretValue = JSON.parse(secretData);
      console.log(`[GCP] Successfully retrieved ${secretName}`);
      return secretValue;
    } catch (parseError) {
      // If it's not valid JSON, return as a string value
      console.warn(`[GCP] Secret ${secretName} is not valid JSON, returning as raw value`);
      return { value: secretData };
    }
  } catch (error) {
    console.error(`[GCP] Error getting secret ${secretName}:`, error.message);
    
    // Check if the secret doesn't exist
    if (error.code === 5) { // 5 is NOT_FOUND in gRPC status codes
      console.log(`[GCP] Secret ${secretName} not found, it may need to be created`);
    }
    
    return {};
  }
}

/**
 * Update a secret in Google Secret Manager
 * @param {string} secretName - Name of the secret
 * @param {Object} secretValue - Secret value as an object
 * @returns {Promise<boolean>} - Success status
 */
async function updateSecret(secretName, secretValue) {
  if (!secretClient) {
    console.error('GCP Secret Manager client not initialized');
    return false;
  }

  const gcpSecretName = mapSecretName(secretName);
  
  try {
    console.log(`[GCP] Updating secret: ${secretName} (mapped to ${gcpSecretName})`);
    
    // Convert the secret value to a string
    const secretData = JSON.stringify(secretValue);
    
    // Check if the secret already exists
    try {
      await secretClient.getSecret({
        name: `projects/${PROJECT_ID}/secrets/${gcpSecretName}`
      });
      
      console.log(`[GCP] Secret ${gcpSecretName} exists, adding new version`);
    } catch (err) {
      // Secret doesn't exist, create it
      if (err.code === 5) { // 5 is NOT_FOUND in gRPC status codes
        console.log(`[GCP] Secret ${gcpSecretName} doesn't exist, creating it`);
        await secretClient.createSecret({
          parent: `projects/${PROJECT_ID}`,
          secretId: gcpSecretName,
          secret: {
            replication: {
              automatic: {}
            }
          }
        });
      } else {
        // Some other error, re-throw
        throw err;
      }
    }
    
    // Add a new version of the secret
    await secretClient.addSecretVersion({
      parent: `projects/${PROJECT_ID}/secrets/${gcpSecretName}`,
      payload: {
        data: Buffer.from(secretData, 'utf8')
      }
    });
    
    console.log(`[GCP] Successfully updated secret ${gcpSecretName}`);
    return true;
  } catch (error) {
    console.error(`[GCP] Error updating secret ${gcpSecretName}:`, error.message);
    return false;
  }
}

/**
 * Special methods to match the interface of file-based secretsManager
 */

/**
 * Get wallet keys (stored under 'blockchain-pg-keys' secret)
 * @returns {Promise<object>} The combined wallet keys 
 */
async function getStoredKeys() {
  console.log('[GCP] Fetching wallet keys');
  const keys = await getSecret('blockchain-pg-keys');
  
  // Get metadata (we'll treat this separately)
  const metadata = await getWalletMetadata();
  
  // Return combined data
  return {
    ...metadata,
    ...keys
  };
}

/**
 * Update wallet keys by separating sensitive keys and metadata
 * @param {object} keys - The keys to update
 * @returns {Promise<boolean>} Success status
 */
async function updateStoredKeys(keys) {
  console.log('[GCP] Updating wallet keys');
  
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
  let result = true;
  if (Object.keys(sensitiveKeys).length > 0) {
    result = await updateSecret('blockchain-pg-keys', sensitiveKeys);
  }
  
  // Update metadata separately
  if (Object.keys(metadata).length > 0) {
    await updateWalletMetadata(metadata);
  }
  
  return result;
}

/**
 * Get private key (stored under 'blockchain-pg-private-key' secret)
 * @returns {Promise<object>} The private key
 */
async function getPrivateKey() {
  return getSecret('blockchain-pg-private-key');
}

/**
 * Update private key
 * @param {object} privateKey - The private key to update
 * @returns {Promise<boolean>} Success status
 */
async function updatePrivateKey(privateKey) {
  return updateSecret('blockchain-pg-private-key', privateKey);
}

/**
 * Get sensitive keys
 * @returns {Promise<object>} The sensitive keys
 */
async function getSensitiveKeys() {
  return getSecret('blockchain-pg-keys');
}

/**
 * Update sensitive keys
 * @param {object} keys - The sensitive keys to update
 * @returns {Promise<boolean>} Success status
 */
async function updateSensitiveKeys(keys) {
  return updateSecret('blockchain-pg-keys', keys);
}

/**
 * Get wallet metadata (non-sensitive data)
 * Note: For demonstration, we'll still use file-based storage for metadata
 * @returns {Promise<object>} The wallet metadata
 */
async function getWalletMetadata() {
  const METADATA_FILE = path.join(__dirname, '../../Json/keys.json');
  
  try {
    if (!fs.existsSync(METADATA_FILE)) {
      console.log('[GCP] Metadata file does not exist, creating empty metadata');
      return {};
    }
    
    const data = fs.readFileSync(METADATA_FILE, 'utf8');
    const metadata = JSON.parse(data);
    console.log('[GCP] Successfully retrieved wallet metadata with properties:', Object.keys(metadata).join(', '));
    return metadata;
  } catch (error) {
    console.error('[GCP] Error reading wallet metadata:', error.message);
    return {};
  }
}

/**
 * Update wallet metadata (non-sensitive data)
 * Note: For demonstration, we'll still use file-based storage for metadata
 * @param {object} metadata - The metadata to update
 * @returns {Promise<boolean>} Success status
 */
async function updateWalletMetadata(metadata) {
  const METADATA_FILE = path.join(__dirname, '../../Json/keys.json');
  
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(METADATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf8');
    console.log('[GCP] Successfully updated wallet metadata');
    return true;
  } catch (error) {
    console.error('[GCP] Error updating wallet metadata:', error.message);
    return false;
  }
}

/**
 * Legacy key migration is not needed for GCP backend
 * This is a no-op for API compatibility
 * @returns {Promise<boolean>} Success status
 */
async function migrateLegacyKeysIfNeeded() {
  console.log('[GCP] Legacy key migration not needed in GCP mode');
  return true;
}

// Export functions with the same interface as file-based secretsManager
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