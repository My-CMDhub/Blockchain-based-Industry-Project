const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
require('dotenv').config();
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
    const INFURA_URL = env.INFURA_URL || process.env.INFURA_URL;
    const MERCHANT_ADDRESS = env.MERCHANT_ADDRESS || process.env.MERCHANT_ADDRESS || '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
    if (!INFURA_URL) throw new Error('INFURA_URL not set');
    if (!MERCHANT_ADDRESS) throw new Error('MERCHANT_ADDRESS not set');

    // Load and decrypt mnemonic
    const keysPath = path.join(__dirname, 'Json', 'keys.json');
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    let mnemonic;
    try {
        mnemonic = decrypt(keys.mnemonic);
        if (!mnemonic) throw new Error('Decryption returned empty mnemonic');
        console.log('[OK] Mnemonic decrypted successfully');
    } catch (e) {
        console.error('[ERROR] Failed to decrypt mnemonic:', e.message);
        process.exit(1);
    }

    const provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
    const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
    let released = 0;
    let skipped = 0;
    let errors = 0;
    for (let i = 0; i < 50; i++) {
        const child = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
        const address = child.address;
        let balance;
        try {
            balance = await provider.getBalance(address);
        } catch (e) {
            console.error(`[${address}] Failed to fetch balance:`, e.message);
            errors++;
            continue;
        }
        if (balance.isZero()) {
            console.log(`[${address}] Balance is zero, skipping.`);
            skipped++;
            continue;
        }
        // Estimate gas
        let gasPrice, gasLimit;
        try {
            gasPrice = await provider.getGasPrice();
            gasLimit = 21000; // Standard ETH transfer
        } catch (e) {
            console.error(`[${address}] Failed to get gas info:`, e.message);
            errors++;
            continue;
        }
        const fee = gasPrice.mul(gasLimit);
        if (balance.lte(fee)) {
            console.log(`[${address}] Balance (${ethers.utils.formatEther(balance)}) too low for gas (${ethers.utils.formatEther(fee)}), skipping.`);
            skipped++;
            continue;
        }
        const sendAmount = balance.sub(fee);
        const wallet = new ethers.Wallet(child.privateKey, provider);
        const tx = {
            to: MERCHANT_ADDRESS,
            value: sendAmount,
            gasLimit,
            gasPrice
        };
        try {
            const sent = await wallet.sendTransaction(tx);
            console.log(`[${address}] Sent ${ethers.utils.formatEther(sendAmount)} ETH to ${MERCHANT_ADDRESS}`);
            console.log(`  Tx hash: ${sent.hash}`);
            released++;
        } catch (e) {
            console.error(`[${address}] Failed to send:`, e.message);
            errors++;
        }
    }
    console.log('-----------------------------');
    console.log(`Release summary: ${released} sent, ${skipped} skipped, ${errors} errors.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
}); 