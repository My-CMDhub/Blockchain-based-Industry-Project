const crypto = require('crypto');
const fs = require('fs');
const path = require('path');  

const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY;

// Convert and validate key length
let keyBuffer;
if (key && key.length === 64) {
    // Assume the key is in hexadecimal format
    keyBuffer = Buffer.from(key, 'hex');
} else {
    throw new Error('Invalid encryption key length. The key must be 32 bytes (64 characters in hexadecimal format).');
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
        if (!text.iv || !text.encryptedData) {
            throw new Error('Decryption data is missing required properties');
        }
        const iv = Buffer.from(text.iv, 'hex');
        const encryptedText = Buffer.from(text.encryptedData, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Error decrypting data:', error);
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
