require('dotenv').config();
const { loadDecryptedData, decrypt } = require('./encryptionUtils');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);

// Path to your encrypted keys file
const filePath = './Json/keys.json';

try {
    // Load and decrypt data from the file
    const decryptedData = loadDecryptedData(filePath);

    // Extract decrypted mnemonic and master key                                                                                             
    const { mnemonic: decryptedMnemonic, masterKey: decryptedMasterKey } = decryptedData;  

    console.log('Decrypted Mnemonic:', decryptedMnemonic);
    console.log('Decrypted Master Key:', decryptedMasterKey);

    // Generate the original master key from the decrypted mnemonic
    const seed = bip39.mnemonicToSeedSync(decryptedMnemonic);
    const originalMasterKeyFromDecryptedMnemonic = bip32.fromSeed(seed).toBase58();

    console.log('Original Master Key from decrypted Mnemonic:', originalMasterKeyFromDecryptedMnemonic);

    if (decryptedMasterKey === originalMasterKeyFromDecryptedMnemonic) {
        console.log('The decrypted master key matches the original.');
    } else {
        console.log('The decrypted master key does not match the original.');
    }

} catch (error) {
    console.error('Error:', error.message);
}
