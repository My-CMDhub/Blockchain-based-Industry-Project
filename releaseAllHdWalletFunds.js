const fs = require('fs');
const path = require('path');
const ethers = require('ethers');
require('dotenv').config();
const { decrypt } = require('./encryptionUtils');

// Helper to parse .env-style files
function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`ENV file not found: ${filePath}, using environment variables only`);
        return {};
    }
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

// Function to get the address_index_map if it exists
function getAddressIndexMap() {
    const mapFile = path.join(__dirname, 'address_index_map.json');
    if (fs.existsSync(mapFile)) {
        try {
            const content = fs.readFileSync(mapFile, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            console.error('Error reading address map:', e.message);
        }
    }
    return {};
}

// Retryable function with exponential backoff
async function withRetry(fn, retries = 3, label = 'operation') {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.error(`[Retry ${i+1}/${retries}] ${label} failed:`, error.message);
            if (i < retries - 1) {
                const delay = Math.pow(2, i) * 1000;
                console.log(`Retrying in ${delay/1000} seconds...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

async function main() {
    // Load config
    const envPath = path.join(__dirname, 'Keys', 'Keys.txt');
    const env = parseEnvFile(envPath);
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

    console.log('Initializing provider...');
    const provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
    await provider.getNetwork(); // Ensure the provider is connected
    console.log('Provider connected successfully');

    // Get the current network info
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    // Load address index map if available
    const addressMap = getAddressIndexMap();
    console.log(`Loaded ${Object.keys(addressMap).length} address mappings from index map`);
    
    const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
    let released = 0;
    let skipped = 0;
    let errors = 0;
    let balanceErrors = 0;
    let totalEthSent = ethers.BigNumber.from(0);
    
    // Larger max index to ensure we catch all addresses
    const MAX_INDEX = 100;
    
    console.log(`Scanning ${MAX_INDEX + 1} HD wallet addresses for funds...`);
    
    for (let i = 0; i <= MAX_INDEX; i++) {
        const child = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
        const address = child.address;
        let balance;
        
        // Try to get balance with retries
        try {
            balance = await withRetry(
                () => provider.getBalance(address),
                3,
                `Fetch balance for ${address}`
            );
            console.log(`[${address}] (Index ${i}) Balance: ${ethers.utils.formatEther(balance)} ETH`);
        } catch (e) {
            console.error(`[${address}] Failed to fetch balance after retries:`, e.message);
            balanceErrors++;
            continue;
        }

        if (balance.isZero()) {
            console.log(`[${address}] Balance is zero, skipping.`);
            skipped++;
            continue;
        }

        // Create wallet instance
        const wallet = new ethers.Wallet(child.privateKey, provider);
        
        // Try different gas prices to ensure we can send all funds
        // Start with network gas price, then try lower values if needed
        let gasPrice, gasLimit;
        try {
            // Try to get gas price with retries
            const networkGasPrice = await withRetry(
                () => provider.getGasPrice(),
                3,
                'Get network gas price'
            );
            
            // Use minimum viable gas price for the network
            // We'll try different values if the first one doesn't work
            const gasPriceOptions = [
                networkGasPrice,
                ethers.utils.parseUnits('1.0', 'gwei'),
                ethers.utils.parseUnits('0.5', 'gwei')
            ];
            
            // Standard ETH transfer gas limit
            gasLimit = 21000;
            
            // Try each gas price option starting with the highest
            let success = false;
            
            for (const candidateGasPrice of gasPriceOptions) {
                gasPrice = candidateGasPrice;
                const fee = gasPrice.mul(gasLimit);
                
                console.log(`[${address}] Trying with gas price ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei (fee: ${ethers.utils.formatEther(fee)} ETH)`);
                
                if (balance.lte(fee)) {
                    console.log(`[${address}] Balance (${ethers.utils.formatEther(balance)} ETH) too low for gas (${ethers.utils.formatEther(fee)} ETH) at this gas price. Trying lower gas price...`);
                    continue;
                }
                
                // For extremely small amounts, try sending the full balance with type 0 tx
                if (balance.lt(ethers.utils.parseEther('0.0001'))) {
                    console.log(`[${address}] Very small balance detected, will use exact balance sending approach`);
                    
                    try {
                        // For tiny amounts, we'll use a more aggressive approach to send all funds
                        // Get the current nonce for the address
                        const nonce = await provider.getTransactionCount(address);
                        
                        // Create a legacy (type 0) transaction
                        const rawTx = {
                            to: MERCHANT_ADDRESS,
                            value: balance,
                            gasLimit,
                            gasPrice: gasPrice,
                            nonce,
                            // No data field to minimize gas usage
                            chainId: network.chainId,
                            // Use legacy format for maximum compatibility
                            type: 0
                        };
                        
                        console.log(`[${address}] Sending entire balance of ${ethers.utils.formatEther(balance)} ETH using legacy transaction`);
                        const sent = await wallet.sendTransaction(rawTx);
                        
                        console.log(`[${address}] Transaction sent! Hash: ${sent.hash}`);
                        console.log(`[${address}] Waiting for transaction confirmation...`);
                        
                        // Wait for transaction to be mined
                        const receipt = await sent.wait(1);
                        console.log(`[${address}] Transaction confirmed in block ${receipt.blockNumber}`);
                        
                        totalEthSent = totalEthSent.add(balance);
                        released++;
                        success = true;
                        break;
                    } catch (e) {
                        console.error(`[${address}] Failed to send with exact balance approach:`, e.message);
                        // Continue to the next gas price option
                    }
                } else {
                    // Normal case - we have enough balance to calculate a sendAmount
                    const sendAmount = balance.sub(fee);
                    
                    try {
                        console.log(`[${address}] Sending ${ethers.utils.formatEther(sendAmount)} ETH (keeping ${ethers.utils.formatEther(fee)} ETH for gas)`);
                        
                        const tx = {
                            to: MERCHANT_ADDRESS,
                            value: sendAmount,
                            gasLimit,
                            gasPrice
                        };
                        
                        const sent = await wallet.sendTransaction(tx);
                        console.log(`[${address}] Transaction sent! Hash: ${sent.hash}`);
                        console.log(`  Waiting for confirmation...`);
                        
                        // Wait for transaction to be mined
                        const receipt = await sent.wait(1);
                        console.log(`[${address}] Transaction confirmed in block ${receipt.blockNumber}`);
                        
                        totalEthSent = totalEthSent.add(sendAmount);
                        released++;
                        success = true;
                        break;
                    } catch (e) {
                        console.error(`[${address}] Failed to send with gas price ${ethers.utils.formatUnits(gasPrice, 'gwei')} gwei:`, e.message);
                        // Continue to the next gas price option
                    }
                }
            }
            
            if (!success) {
                console.log(`[${address}] Could not find a viable gas price to send the funds. Balance too low.`);
                skipped++;
            }
            
        } catch (e) {
            console.error(`[${address}] Failed to process:`, e.message);
            errors++;
        }
    }
    
    console.log('========================================');
    console.log(`RELEASE SUMMARY: ${released} addresses processed`);
    console.log(`Total ETH sent: ${ethers.utils.formatEther(totalEthSent)} ETH`);
    console.log(`Skipped addresses: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Balance fetch errors: ${balanceErrors}`);
    console.log('========================================');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
}); 