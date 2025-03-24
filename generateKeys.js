require('dotenv').config();
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);
const { encrypt, saveEncryptedData } = require('./encryptionUtils');
const crypto = require('crypto');
const fs = require('fs');

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

console.log('Encryption key:', keyBuffer.toString('hex'));

// Generate mnemonic
const mnemonic = bip39.generateMnemonic();
if (!mnemonic) {
    throw new Error('Failed to generate mnemonic');
}
console.log('Generated Mnemonic:', mnemonic);

// Derive master key from mnemonic
const seed = bip39.mnemonicToSeedSync(mnemonic);
if (!seed) {
    throw new Error('Failed to generate seed from mnemonic');
}
const masterKey = bip32.fromSeed(seed);
if (!masterKey) {
    throw new Error('Failed to derive master key from seed');
}
console.log('Derived Master Key:', masterKey.toBase58());

// Encrypt mnemonic and master key
const encryptedMnemonic = encrypt(mnemonic);
if (!encryptedMnemonic) {
    throw new Error('Failed to encrypt mnemonic');
}
const encryptedMasterKey = encrypt(masterKey.toBase58());
if (!encryptedMasterKey) {
    throw new Error('Failed to encrypt master key');
}

const keysFilePath = "./Json/keys.json";
// Save encrypted data to keys.json
const data = {
    mnemonic: encryptedMnemonic,
    masterKey: encryptedMasterKey
};
saveEncryptedData(keysFilePath, data); 
console.log('Encrypted keys saved to keys.json');

// Generate private key and save it to secure file
const path = "m/44'/60'/0'/0/0";
const child = masterKey.derivePath(path);
const privateKey = '0x' + child.privateKey.toString('hex'); // Ensure the private key starts with '0x'
const privateKeyFilePath = './secure/privateKey.json';
const encryptedPrivateKey = encrypt(privateKey);
saveEncryptedData(privateKeyFilePath, {                                                                                                      
    iv: encryptedPrivateKey.iv,                                                                                                              
    encryptedData: encryptedPrivateKey.encryptedData                                                                                         
});          
console.log('Private key saved to secure file:', privateKeyFilePath);
