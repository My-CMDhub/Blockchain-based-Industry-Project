const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);
const { encrypt, saveEncryptedData } = require('./encryptionUtils');

// Generate mnemonic
const mnemonic = bip39.generateMnemonic();
console.log('Generated Mnemonic:', mnemonic);

// Derive master key from mnemonic
const seed = bip39.mnemonicToSeedSync(mnemonic);
const masterKey = bip32.fromSeed(seed);
console.log('Derived Master Key:', masterKey.toBase58());

// Encrypt mnemonic and master key
const encryptedMnemonic = encrypt(mnemonic);
const encryptedMasterKey = encrypt(masterKey.toBase58());

// Save encrypted data to keys.json
const data = {
    mnemonic: encryptedMnemonic,
    masterKey: encryptedMasterKey
};
saveEncryptedData('./keys.json', JSON.stringify(data));
console.log('Encrypted keys saved to keys.json');
