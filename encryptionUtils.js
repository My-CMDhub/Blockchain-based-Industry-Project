const crypto = require('crypto');
const fs = require('fs');
const path = require('path');  

const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY;
const salt = process.env.ENCRYPTION_SALT || 'default-salt';

// Derive key using PBKDF2
let keyBuffer;
if (key) {
    keyBuffer = crypto.pbkdf2Sync(
        key,
        salt,
        100000, // iterations
        32,     // key length (32 bytes = 256 bits)
        'sha512'
    );
} else {
    throw new Error('Encryption key not configured');
}

if (keyBuffer.length !== 32) {
    throw new Error('The encryption key must be 32 bytes (256 bits).');
}

// Function to encrypt data
const encrypt = (text) => {
    try {
        const iv = crypto.randomBytes(16); // Generate a new IV for each encryption
        const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
    } catch (error) {
        console.error('Error encrypting data:', error);
        throw error;
    }
};

// Function to decrypt data
const decrypt = (text) => {
    try {
        // Validate input structure
        if (!text || typeof text !== 'object' || !text.iv || !text.encryptedData) {
            throw new Error('Invalid encrypted data format');
        }

        // Convert from hex
        const iv = Buffer.from(text.iv, 'hex');
        const encryptedText = Buffer.from(text.encryptedData, 'hex');

        // Validate lengths
        if (iv.length !== 16) {
            throw new Error('Invalid IV length');
        }
        if (encryptedText.length === 0) {
            throw new Error('Empty encrypted data');
        }

        // Try decryption with padding
        const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
        decipher.setAutoPadding(true);

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const result = decrypted.toString();
        
        // Basic validation of decrypted data
        if (!result || !bip39.validateMnemonic(result)) {
            throw new Error('Decrypted data is not a valid mnemonic');
        }

        return result;
    } catch (error) {
        console.error('Decryption failed:', {
            error: error.message,
            inputIV: text?.iv?.substring(0, 8) + '...',
            inputData: text?.encryptedData?.substring(0, 8) + '...'
        });

        // Special handling for common errors
        if (error.code === 'ERR_OSSL_BAD_DECRYPT') {
            const keyError = new Error('DECRYPTION_FAILED: Likely due to incorrect encryption key');
            keyError.recovery = 'Please verify your ENCRYPTION_KEY environment variable matches what was used to encrypt this data';
            throw keyError;
        }

        throw error;
    }
};

// Function to save encrypted data to a file
const saveEncryptedData = (filePath, data) => {                                                                                              
    try {                                                                                                                                    
        const fullPath = path.resolve(__dirname, filePath);                                                                                  
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));                                                                           
    } catch (error) {                                                                                                                        
        console.error('Error saving encrypted data:', error);                                                                                
        throw error;                                                                                                                         
    }                                                                                                                                        
};     

// Function to load and decrypt data from a file
const loadDecryptedData = (filePath) => {                                                                                                    
    try {                                                                                                                                    
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));                                                                          
        if (!data.mnemonic || !data.masterKey || !data.mnemonic.iv || !data.mnemonic.encryptedData || !data.masterKey.iv ||                  
            !data.masterKey.encryptedData) {                                                                                                             
                        throw new Error('Loaded data is missing required properties');                                                                   
                    }                                                                                                                                    
                    return {                                                                                                                             
                        mnemonic: decrypt({                                                                                                              
                            iv: data.mnemonic.iv,                                                                                                        
                            encryptedData: data.mnemonic.encryptedData                                                                                   
                        }),                                                                                                                              
                        masterKey: decrypt({                                                                                                             
                            iv: data.masterKey.iv,                                                                                                       
                            encryptedData: data.masterKey.encryptedData                                                                                  
                        })                                                                                                                               
                    };                                                                                                                                                
    } catch (error) {                                                                                                                        
        console.error('Error loading decrypted data:', error);                                                                               
        throw error;                                                                                                                         
    }                                                                                                                                        
};                         

module.exports = {
    encrypt,
    decrypt,
    saveEncryptedData,
    loadDecryptedData
};
