const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
const crypto = require('crypto');
require('dotenv').config(); // Load .env if present
const { decrypt } = require('./encryptionUtils');

// Helper to parse .env-style files
function parseEnvFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const env = {};
    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim();
    }
    return env;
}

async function main() {
    // Load config
    const env = parseEnvFile(path.join(__dirname, 'Keys', 'Keys.txt'));
    const INFURA_URL = env.INFURA_URL;
    // Load keys.json
    const keysPath = path.join(__dirname, 'Json', 'keys.json');
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    if (!keys.mnemonic) {
        console.error('No mnemonic found in keys.json');
        process.exit(1);
    }
    // Decrypt mnemonic using project decryption logic
    let mnemonic;
    try {
        mnemonic = decrypt(keys.mnemonic);
        if (!mnemonic) throw new Error('Decryption returned empty mnemonic');
        console.log('[OK] Mnemonic decrypted successfully');
    } catch (e) {
        console.error('[ERROR] Failed to decrypt mnemonic:', e.message);
        process.exit(1);
    }
    // Setup provider
    const provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
    // Derive and check balances for first 20 addresses
    let total = ethers.BigNumber.from(0);
    console.log('Scanning first 20 HD wallet addresses:');
    for (let i = 0; i < 20; i++) {
        const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic).derivePath(`m/44'/60'/0'/0/${i}`);
        const address = hdNode.address;
        const balance = await provider.getBalance(address);
        total = total.add(balance);
        console.log(`${address}: ${ethers.utils.formatEther(balance)} ETH`);
    }
    console.log('-----------------------------');
    console.log('Total ETH in first 20 HD wallet addresses:', ethers.utils.formatEther(total), 'ETH');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
}); 