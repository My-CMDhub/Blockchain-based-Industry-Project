/**
 * Fix Derivation Indexes Script
 * 
 * This script checks all stored addresses and ensures they have the correct derivation path indexes.
 * It scans through indexes 0-20 to find the correct derivation path for each address.
 */

require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const path = require('path');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const { decrypt } = require('./encryptionUtils');

// Function to derive address from mnemonic and index
async function deriveAddress(mnemonic, index) {
    try {
        const bip32 = BIP32Factory(ecc);
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const masterKey = bip32.fromSeed(seed);
        
        const path = `m/44'/60'/0'/0/${index}`;
        const child = masterKey.derivePath(path);
        const privateKey = '0x' + child.privateKey.toString('hex');
        const account = new Web3().eth.accounts.privateKeyToAccount(privateKey);
        
        return {
            address: account.address,
            privateKey,
            path,
            index
        };
    } catch (error) {
        console.error(`Error deriving address for index ${index}:`, error.message);
        return null;
    }
}

// Function to get stored keys
function getStoredKeys() {
    try {
        const keysPath = path.join(__dirname, 'Json', 'keys.json');
        if (!fs.existsSync(keysPath)) {
            throw new Error('Keys file not found');
        }
        
        const keysData = fs.readFileSync(keysPath, 'utf8');
        return JSON.parse(keysData);
    } catch (error) {
        console.error('Error reading keys:', error);
        throw error;
    }
}

// Function to save updated keys
function saveKeys(keys) {
    try {
        const keysPath = path.join(__dirname, 'Json', 'keys.json');
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        console.log('Keys file updated successfully');
        return true;
    } catch (error) {
        console.error('Error saving keys:', error);
        return false;
    }
}

// Main function
async function main() {
    try {
        console.log('=== CHECKING AND FIXING DERIVATION INDEXES ===');
        
        // Get stored keys
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        
        // Decrypt mnemonic
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        
        // Store a map of address to correct index
        const addressMap = {};
        
        // Generate addresses for indexes 0-20
        console.log('\nGenerating addresses for indexes 0-20...');
        for (let i = 0; i <= 20; i++) {
            const derived = await deriveAddress(mnemonic, i);
            if (derived) {
                console.log(`Index ${i}: ${derived.address}`);
                addressMap[derived.address.toLowerCase()] = i;
            }
        }
        
        let updatesNeeded = false;
        
        // Check each active address
        console.log('\nChecking active addresses...');
        if (keys.activeAddresses) {
            const addresses = Object.keys(keys.activeAddresses);
            
            for (const addr of addresses) {
                const addrLower = addr.toLowerCase();
                const storedIndex = keys.activeAddresses[addr].index || 0;
                
                if (addressMap[addrLower] !== undefined) {
                    const correctIndex = addressMap[addrLower];
                    
                    if (storedIndex !== correctIndex) {
                        console.log(`\n⚠️ MISMATCH DETECTED for ${addr}`);
                        console.log(`Stored index: ${storedIndex}`);
                        console.log(`Correct index: ${correctIndex}`);
                        
                        // Update the index
                        keys.activeAddresses[addr].index = correctIndex;
                        console.log(`Updated index to ${correctIndex}`);
                        updatesNeeded = true;
                    } else {
                        console.log(`✅ ${addr} has correct index: ${storedIndex}`);
                    }
                } else {
                    console.log(`❌ ${addr} not found in generated addresses (indexes 0-20)`);
                    console.log('This address might use a different derivation path or is from a different wallet.');
                }
            }
        }
        
        // Save updates if needed
        if (updatesNeeded) {
            console.log('\nSaving updated indexes...');
            if (saveKeys(keys)) {
                console.log('✅ All indexes updated successfully');
            } else {
                console.log('❌ Failed to save updated indexes');
            }
        } else {
            console.log('\n✅ All addresses have correct indexes, no updates needed');
        }
        
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Run the main function
main().catch(console.error); 