const express = require('express');
const cors = require('cors');
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const { recoverWallet, getStoredKeys } = require('./recover.js');
const { decrypt } = require('./encryptionUtils');
const winston = require('winston');
const ethers = require('ethers');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { BigNumber } = require('ethers');
const { secureReadFile, secureWriteFile } = require('./server/utils/fileUtils');
const { getFreshProvider, getReliableNonce, getReliableGasPrice, waitForTransactionReceipt, checkTransactionReceipt, getBalanceWithRetry, shouldRetryTransaction, isProviderError } = require('./server/utils/web3Utils');
const { logBlockchain, logToFile } = require('./server/utils/logger');
const paymentRoutes = require('./server/routes/paymentRoutes');
const walletRoutes = require('./server/routes/walletRoutes');
const merchantRoutes = require('./server/routes/merchantRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const stripeRoutes = require('./server/routes/stripeRoutes');
const secretsBackendRoutes = require('./server/routes/secretsBackendRoutes');
const transactionRoutes = require('./server/routes/transactionRoutes');
const { initDatabaseRecovery, startScheduledBackups, checkDatabaseStatus } = require('./server/utils/databaseMonitor');
const { validateDatabaseOnStartup } = require('./server/utils/startupValidator');
const secureKeysRoutes = require('./server/routes/secureKeysRoutes');
const { initializeDatabase } = require('./db/index');
const { syncJsonToDb, setupFileWatchers } = require('./db/syncManager');
const dataManager = require('./server/utils/dataManager');

dotenv.config();

// Configure winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

const app = express();
app.use(cors());

// Special handling for Stripe webhooks (needs raw body)
app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use(express.static('Public'));

// Serve the Json directory at /Json
app.use('/Json', express.static('Json'));

// Serve merchant_transactions.json at the root
app.use(express.static('.'));

// /env-check endpoint for onboarding page status
app.get('/env-check', (req, res) => {
    res.json({
        node: true,
        env: fs.existsSync('.env'),
        keys: fs.existsSync('Json/keys.json'),
        infura: !!process.env.INFURA_URL,
        moralis: !!process.env.MORALIS_API_KEY
    });
});

// Simple API key validation for sensitive endpoints only
function validateApiKey(req, res, next) {
    // Only protect fund release endpoints and recording payments
    const protectedEndpoints = [
        '/api/wallet-setup',
        '/api/wallet-status', 
        '/api/release-funds',
        '/api/release-all-funds',
        '/api/create-transaction-file'
    ];
    
    if (!protectedEndpoints.includes(req.path)) {
        return next();
    }
    
    // Get API key from environment or generate from encryption key
    const apiKey = process.env.API_KEY || createApiKeyFromEncryptionKey();
    
    // Check header for API key
    const providedKey = req.headers['x-api-key'];
    
    if (!providedKey || providedKey !== apiKey) {
        logger.warn(`Unauthorized access attempt to ${req.path}`);
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: API key required'
        });
    }
    
    next();
}

// Create API key from encryption key if not set in environment
function createApiKeyFromEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY || 'default-key';
    const hash = crypto.createHash('sha256');
    hash.update(key);
    return hash.digest('hex');
}

// Log all requests FIRST
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${req.method} ${req.url}`;
    console.log(message);
    logToFile(message);
    
    // For POST or PUT requests, log the body with sensitive data redacted
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
        // Create a copy of the body to redact sensitive fields
        const sanitizedBody = { ...req.body };
        
        // Redact potentially sensitive fields
        if (sanitizedBody.privateKey) sanitizedBody.privateKey = '[REDACTED]';
        if (sanitizedBody.mnemonic) sanitizedBody.mnemonic = '[REDACTED]';
        if (sanitizedBody.key) sanitizedBody.key = '[REDACTED]';
        
        const bodyMsg = `[${timestamp}] Request Body: ${JSON.stringify(sanitizedBody, null, 2)}`;
        console.log(bodyMsg);
        logToFile(bodyMsg);
    }
    
    next();
});

// Apply API key validation
app.use(validateApiKey);

// Basic input validation for release funds endpoint
app.use((req, res, next) => {
    // Only validate specific endpoints
    if (req.path === '/api/release-funds' && req.method === 'POST') {
        // Validate amount field
        const { amount } = req.body;
        
        if (!amount) {
            return res.status(400).json({ 
                success: false,
                error: 'Amount is required' 
            });
        }
        
        // Validate amount format and range
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be a positive number'
            });
        }
    }
    
    next();
});


// Helper function to normalize Ethereum addresses
function normalizeAddress(address) {
    // Make sure address is a string
    if (typeof address !== 'string') {
        console.error('Address is not a string:', address);
        return null;
    }
    
    // Trim whitespace and ensure proper format
    address = address.trim();
    
    // Check if address has 0x prefix, add if missing
    if (!address.startsWith('0x')) {
        address = '0x' + address;
    }
    
    // Validate Ethereum address format (0x followed by 40 hex characters)
    const addressRegex = /^0x[0-9a-fA-F]{40}$/;
    if (!addressRegex.test(address)) {
        console.error('Address does not match Ethereum address pattern:', address);
        return null;
    }
    
    return address;
}

// Fix Infura connection by using HTTP provider with API key
const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS || '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
const INFURA_URL = process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9';
// Add Alchemy as a backup RPC provider (much more reliable than public endpoints)
const ALCHEMY_URL = process.env.ALCHEMY_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo'; // Replace with your own key for production
const BACKUP_RPC = 'https://rpc.sepolia.org'; // Public RPC as last resort

// Initialize Web3 with proper error handling
let web3;
try {
    // Ensure we're using HTTPS, not WSS
    const cleanInfuraUrl = INFURA_URL.replace('wss://', 'https://').replace('/ws/', '/');
    
    // Create HTTP provider with proper configuration
    const provider = new Web3.providers.HttpProvider(cleanInfuraUrl, {
        timeout: 10000, // 10 second timeout
        headers: [
            {
                name: 'User-Agent',
                value: 'Mozilla/5.0 BlockchainPaymentGateway'
            }
        ]
    });
    
    web3 = new Web3(provider);
    global.web3 = web3;
    console.log('Web3 HTTP provider initialized and global.web3 set:', !!global.web3, 'URL:', cleanInfuraUrl);
    
    // Test connection immediately
    web3.eth.getBlockNumber()
        .then(blockNumber => {
            console.log(`Successfully connected to Ethereum. Current block: ${blockNumber}`);
            logBlockchain('WEB3_INIT_SUCCESS', { 
                provider: 'HttpProvider',
                network: 'Sepolia',
                blockNumber
            });
            
            // Verify wallet functionality and connection at startup
            verifyWalletSetup()
                .then(result => {
                    if (result.success) {
                        console.log('✅ Wallet setup verified successfully!');
                        console.log(`Found ${result.addressCount} active addresses with a total balance of ${result.totalBalance} ETH`);
                    } else {
                        console.error('❌ Wallet verification failed:', result.error);
                    }
                })
                .catch(err => {
                    console.error('❌ Error during wallet verification:', err);
                });
        })
        .catch(error => {
            console.error('Initial block check failed:', error.message);
            console.log('Switching to backup provider...');
            
            // Create a new provider instance for backup
            const backupProvider = new Web3.providers.HttpProvider(BACKUP_RPC, {
                timeout: 10000
            });
            web3.setProvider(backupProvider);
            console.log('Switched to backup provider:', BACKUP_RPC);
            
            // Test backup provider
            return web3.eth.getBlockNumber();
        })
        .then(blockNumber => {
            if (blockNumber) {
                console.log(`Successfully connected to backup provider. Current block: ${blockNumber}`);
                
                // Still verify wallet even with backup provider
                verifyWalletSetup()
                    .then(result => {
                        if (result.success) {
                            console.log('✅ Wallet setup verified successfully with backup provider!');
                        } else {
                            console.error('❌ Wallet verification failed with backup provider:', result.error);
                        }
                    });
            }
        })
        .catch(error => {
            console.error('Backup provider also failed:', error.message);
            throw error; // Propagate error to outer catch
        });
} catch (error) {
    console.error('Failed to initialize Web3:', error);
    // Fallback provider with explicit HTTP
    try {
        const backupProvider = new Web3.providers.HttpProvider(BACKUP_RPC, {
            timeout: 10000
        });
        web3 = new Web3(backupProvider);
        console.log('Using fallback Web3 provider:', BACKUP_RPC);
    } catch (fallbackError) {
        console.error('Failed to initialize fallback provider:', fallbackError);
        // Last resort: create a minimal provider that will be fixed when used
        web3 = new Web3();
    }
}

// Add a verification function to check wallet setup on startup
async function verifyWalletSetup() {
    try {
        // Check if we can access keys and decrypt mnemonic
        const keys = getStoredKeys();
        if (!keys || !keys.mnemonic) {
            return { 
                success: false, 
                error: 'No wallet keys found or keys.mnemonic is missing'
            };
        }
        
        try {
            // Test if we can decrypt the mnemonic
            const mnemonic = decrypt(keys.mnemonic);
            if (!mnemonic) {
                return { 
                    success: false, 
                    error: 'Failed to decrypt mnemonic - check ENCRYPTION_KEY in .env'
                };
            }
            
            // Check if we can recover the root wallet
            const rootWallet = await recoverWallet(mnemonic, 0);
            if (!rootWallet || !rootWallet.address) {
                return { 
                    success: false, 
                    error: 'Failed to recover root wallet from mnemonic'
                };
            }
            
            // Get a fresh web3 provider to test blockchain access
            const freshWeb3 = await getFreshProvider();
            
            // Check if merchant address is valid
            const merchantAddress = process.env.MERCHANT_ADDRESS || MERCHANT_ADDRESS;
            const normalizedMerchantAddress = normalizeAddress(merchantAddress);
            if (!normalizedMerchantAddress) {
                return { 
                    success: false, 
                    error: 'Invalid merchant address format in configuration'
                };
            }
            
            // Ensure all active addresses have derivation indices (fix any missing ones)
            await ensureAddressIndices();
            
            // Test balance checking functionality
            const activeAddresses = keys.activeAddresses || {};
            const addressCount = Object.keys(activeAddresses).length;
            
            // Get root address balance
            let totalBalance = 0;
            try {
                const rootBalance = await getBalanceWithRetry(freshWeb3, rootWallet.address);
                totalBalance += parseFloat(rootBalance);
                
                // Success with all critical checks passed
                return {
                    success: true,
                    addressCount: addressCount + 1, // +1 for root address
                    totalBalance: totalBalance,
                    rootAddress: rootWallet.address
                };
            } catch (balanceError) {
                return { 
                    success: false, 
                    error: `Failed to get balance: ${balanceError.message}`
                };
            }
        } catch (decryptError) {
            return { 
                success: false, 
                error: `Decryption error: ${decryptError.message}`
            };
        }
    } catch (error) {
        return { 
            success: false, 
            error: `Wallet verification failed: ${error.message}`
        };
    }
}

// Helper function to ensure all active addresses have derivation indices
async function ensureAddressIndices() {
    try {
        console.log('Checking and fixing any missing address indices...');
        
        // Get the current keys data
        const keys = getStoredKeys();
        if (!keys || !keys.mnemonic) {
            console.error('Cannot ensure address indices: keys or mnemonic not found');
            return false;
        }
        
        // Decrypt mnemonic
        const mnemonic = decrypt(keys.mnemonic);
        if (!mnemonic) {
            console.error('Cannot ensure address indices: failed to decrypt mnemonic');
            return false;
        }
        
        const activeAddresses = keys.activeAddresses || {};
        let fixed = 0;
        const addressesWithoutIndex = [];
        
        // Find addresses without indices
        for (const [addr, info] of Object.entries(activeAddresses)) {
            if (info.index === undefined) {
                addressesWithoutIndex.push(addr);
                console.log(`Found address without index: ${addr}`);
            }
        }
        
        if (addressesWithoutIndex.length === 0) {
            console.log('All addresses have valid indices ✅');
            return true;
        }
        
        console.log(`Found ${addressesWithoutIndex.length} addresses without indices. Fixing...`);
        
        // Scan for addresses and build index map
        const addressMap = await scanForAddressIndices(mnemonic, 100); // Scan first 100 indices
        
        // Fix each address without an index
        for (const addr of addressesWithoutIndex) {
            const normalizedAddr = addr.toLowerCase();
            if (addressMap[normalizedAddr] !== undefined) {
                // Found a matching index
                const index = addressMap[normalizedAddr];
                console.log(`Fixing index for ${addr}: assigned index ${index}`);
                
                // Update the address info
                activeAddresses[addr].index = index;
                fixed++;
            } else {
                // Try a deeper scan
                console.log(`Address ${addr} not found in initial scan. Performing deep scan...`);
                const deepScanMap = await scanForAddressIndices(mnemonic, 200); // Try more indices
                
                if (deepScanMap[normalizedAddr] !== undefined) {
                    const index = deepScanMap[normalizedAddr];
                    console.log(`Found index ${index} for ${addr} in deep scan`);
                    
                    // Update the address info
                    activeAddresses[addr].index = index;
                    fixed++;
                } else {
                    // Last resort: full search for the specific address
                    console.log(`Performing targeted search for ${addr}...`);
                    const result = await findWalletForAddress(mnemonic, addr, 300);
                    
                    if (result) {
                        console.log(`Found wallet for ${addr} at index ${result.index}`);
                        activeAddresses[addr].index = result.index;
                        fixed++;
                    } else {
                        console.error(`Could not find derivation index for ${addr} after extensive search`);
                    }
                }
            }
        }
        
        // Save the updated keys
        if (fixed > 0) {
            // Use your key storage system to update the keys
            updateStoredKeys(keys);
            console.log(`Fixed ${fixed} of ${addressesWithoutIndex.length} addresses without indices ✅`);
        }
        
        return true;
    } catch (error) {
        console.error('Error ensuring address indices:', error);
        return false;
    }
}

// Helper function to update the stored keys (assumes you have a function like this or similar)
function updateStoredKeys(keys) {
    try {
        // Write to keys.json file
        secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
        console.log('Updated keys.json with fixed indices');
        return true;
    } catch (error) {
        console.error('Error updating keys file:', error);
        return false;
    }
}

// Helper function to scan for addresses and map them to derivation indices
async function scanForAddressIndices(mnemonic, maxIndex = 50) {
    console.log(`Scanning for HD wallet addresses up to index ${maxIndex}...`);
    const addressMap = {};
    
    try {
        // Scan through indices to find all addresses
        for (let i = 0; i <= maxIndex; i++) {
            try {
                const wallet = await recoverWallet(mnemonic, i);
                if (wallet && wallet.address) {
                    // Store with lowercase address for case-insensitive lookups
                    addressMap[wallet.address.toLowerCase()] = i;
                }
            } catch (error) {
                console.error(`Error deriving address at index ${i}:`, error.message);
            }
        }
        
        console.log(`Scanned ${maxIndex + 1} indices, found ${Object.keys(addressMap).length} addresses`);
        
        // Save this map to a file for future reference
        try {
            saveAddressMap(addressMap);
        } catch (saveError) {
            console.error('Failed to save address map:', saveError.message);
        }
        
        return addressMap;
    } catch (error) {
        console.error('Error scanning for addresses:', error.message);
        return {};
    }
}

// Helper function to save address map to file
function saveAddressMap(addressMap) {
    const mapFile = 'address_index_map.json';
    
    // If file exists, read and merge
    let existingMap = {};
    if (fs.existsSync(mapFile)) {
        try {
            const fileContent = secureReadFile(mapFile);
            existingMap = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error reading existing address map:', error.message);
            // Continue with empty map if file was invalid
        }
    }
    
    // Merge with new addresses
    const mergedMap = { ...existingMap, ...addressMap };
    
    // Write back to file
    secureWriteFile(mapFile, JSON.stringify(mergedMap, null, 2));
    console.log(`Saved ${Object.keys(mergedMap).length} address-to-index mappings`);
}

// Update an address's index in the mapping file
function updateAddressIndex(address, index) {
    const mapFile = 'address_index_map.json';
    
    // If file exists, read existing map
    let existingMap = {};
    if (fs.existsSync(mapFile)) {
        try {
            const fileContent = secureReadFile(mapFile);
            existingMap = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error reading existing address map:', error.message);
            return false;
        }
    }
    
    // Update the specific address
    existingMap[address] = index;
    
    // Write back to file
    secureWriteFile(mapFile, JSON.stringify(existingMap, null, 2));
    console.log(`Updated index mapping for ${address}`);
    
    return true;
}

// Helper function to find wallet for a specific address by scanning indices
async function findWalletForAddress(mnemonic, targetAddress, maxIndex = 200) {
    console.log(`Searching for wallet matching address ${targetAddress} (scanning up to index ${maxIndex})...`);
    const normalizedTarget = targetAddress.toLowerCase();
    
    // First check if we have a cached map
    const mapFile = 'address_index_map.json';
    if (fs.existsSync(mapFile)) {
        try {
            const fileContent = secureReadFile(mapFile);
            const addressMap = JSON.parse(fileContent);
            
            if (addressMap[normalizedTarget] !== undefined) {
                const index = addressMap[normalizedTarget];
                console.log(`Found cached index ${index} for address ${targetAddress}`);
                
                // Verify by deriving the wallet
                const wallet = await recoverWallet(mnemonic, index);
                if (wallet.address.toLowerCase() === normalizedTarget) {
                    return { wallet, index };
                } else {
                    console.error(`Cached index ${index} did not match address ${targetAddress}, continuing scan...`);
                }
            }
        } catch (error) {
            console.error('Error reading address map:', error.message);
        }
    }
    
    // Scan through indices to find matching address
    for (let i = 0; i <= maxIndex; i++) {
        try {
            const wallet = await recoverWallet(mnemonic, i);
            if (wallet && wallet.address && wallet.address.toLowerCase() === normalizedTarget) {
                console.log(`Found matching wallet at index ${i}`);
                
                // Update our map for future use
                try {
                    updateAddressIndex(targetAddress, i);
                } catch (updateError) {
                    console.error('Failed to update address map:', updateError.message);
                }
                
                return { wallet, index: i };
            }
        } catch (error) {
            console.error(`Error checking index ${i}:`, error.message);
        }
    }
    
    // If we get here, we couldn't find the wallet
    console.error(`Could not find wallet for address ${targetAddress} after scanning ${maxIndex + 1} indices`);
    return null;
}

// Configure web3 transactions with higher gas to ensure they go through
const TX_DEFAULTS = {
    gas: 21000,
    gasPrice: '50000000000' // 50 gwei in wei
};

// Use HTTP polling instead of WebSockets
let blockCheckInterval;

function setupBlockMonitoring() {
    // Clear any existing intervals
    if (blockCheckInterval) {
        clearInterval(blockCheckInterval);
    }
    
    console.log('Setting up block monitoring with HTTP polling');
    
    // Use periodic HTTP polling
    blockCheckInterval = setInterval(async () => {
        try {
            const blockNumber = await web3.eth.getBlockNumber();
            console.log(`Current block: ${blockNumber}`);
            logBlockchain('BLOCK_CHECK', {
                number: blockNumber,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error checking block number:', error.message);
            
            // If we have connection errors, try to get a fresh provider
            if (error.message.includes('CONNECTION ERROR') || 
                error.message.includes('Invalid JSON RPC response') ||
                error.message.includes('connect')) {
                try {
                    console.log('Connection error detected, trying to get fresh provider...');
                    const freshWeb3 = await getFreshProvider();
                    if (freshWeb3) {
                        web3 = freshWeb3;
                        console.log('Successfully switched to a fresh provider');
                    }
                } catch (providerError) {
                    console.error('Failed to get fresh provider:', providerError.message);
                }
            }
        }
    }, 60000); // Poll every minute
}

// Start block monitoring
setupBlockMonitoring();

// Main e-commerce page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/Public/Product.html');
});

// Merchant dashboard
app.get('/merchant', (req, res) => {
    res.sendFile(__dirname + '/Public/merchant-dashboard.html');
});



// Update the Alchemy endpoint and add backup providers

const PROVIDERS = {
   
    INFURA: 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
    BACKUP: 'https://rpc.sepolia.org'
};


app.get('/api/wrong-payments', async (req, res) => {
    try {
        // Check rate limit for this endpoint
        const rateLimitKey = `rateLimit:wrong-payments:${req.ip}`;
        if (global[rateLimitKey] && global[rateLimitKey] > 10) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.'
            });
        }
        
        // Increment rate limit counter
        global[rateLimitKey] = (global[rateLimitKey] || 0) + 1;
        setTimeout(() => {
            global[rateLimitKey]--;
        }, 60000); // Decrease counter after 1 minute
        
        // Use cache control headers for better client-side caching
        res.set('Cache-Control', 'private, max-age=10'); // Cache for 10 seconds
        
        // Check if we have a cached result (server-side)
        const cachedWrongPaymentsKey = 'wrong_payments_cache';
        const cachedWrongPaymentsTimestampKey = 'wrong_payments_timestamp';
        
        // Only use cache if it's less than 10 seconds old (server-side cache)
        const cachedTimestamp = global[cachedWrongPaymentsTimestampKey] || 0;
        const forceRefresh = req.query.force === 'true';
        
        if (!forceRefresh && global[cachedWrongPaymentsKey] && (Date.now() - cachedTimestamp) < 10000) {
            console.log('Returning cached wrong payments (< 10 seconds old)');
            return res.json(global[cachedWrongPaymentsKey]);
        }
        
        console.log('Fetching wrong payments');
        
        // Get transactions from file
        const txFile = 'merchant_transactions.json';
        let transactions = [];
        
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
                if (fileContent && fileContent.trim()) {
                    transactions = JSON.parse(fileContent);
                    
                    // Ensure we have an array
                    if (!Array.isArray(transactions)) {
                        console.warn('Transaction log was corrupted, using empty array');
                        transactions = [];
                    }
                }
            } catch (error) {
                console.error('Error parsing transaction file:', error);
                transactions = [];
            }
        }
        
        // Filter for wrong payments
        const wrongPayments = transactions.filter(tx => 
            tx.type === 'payment' && 
            (
                tx.amountVerified === false || 
                tx.status === 'wrong' || 
                tx.isWrongPayment === true ||
                tx.wrongPayment === true ||
                tx.wrongPaymentRecorded === true
            )
        );
        
        // Sort by timestamp (newest first)
        wrongPayments.sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Calculate total wrong payment amount
        let wrongPaymentsAmount = "0";
        
        try {
            if (wrongPayments.length > 0) {
                // Use a safer approach to sum amounts to avoid BigInt conversion errors
                let totalWei = BigInt(0);
                
                for (const tx of wrongPayments) {
                    try {
                        let amountWei;
                        
                        if (tx.amountWei) {
                            // Use amountWei directly if available
                            amountWei = tx.amountWei.toString();
                        } else if (typeof tx.amount === 'string' && tx.amount.includes('.')) {
                            // Amount is in ETH format, convert to wei
                            amountWei = web3.utils.toWei(tx.amount, 'ether');
                        } else {
                            // Amount is already in Wei or a number
                            amountWei = tx.amount.toString();
                        }
                        
                        totalWei = totalWei + BigInt(amountWei);
                    } catch (e) {
                        console.error('Error processing wrong payment amount:', e, tx);
                        // Continue with other transactions
                    }
                }
                
                // Convert total wei to ETH
                wrongPaymentsAmount = web3.utils.fromWei(totalWei.toString(), 'ether');
            }
        } catch (countError) {
            console.error('Error calculating wrong payments total:', countError);
        }
        
        // Prepare response
        const responseData = {
            success: true,
            wrongPayments: wrongPayments,
            total: wrongPayments.length,
            wrongPaymentsAmount: wrongPaymentsAmount,
            timestamp: Date.now()
        };
        
        // Cache the response
        global[cachedWrongPaymentsKey] = responseData;
        global[cachedWrongPaymentsTimestampKey] = Date.now();
        
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching wrong payments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wrong payments: ' + error.message
        });
    }
});


// });

// Initialize crypto price cache
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let cryptoPriceCache = {
    data: null,
    timestamp: 0
};




// Database monitoring middleware for admin dashboard
app.use((req, res, next) => {
    // Check if request is for admin dashboard page
    if (req.path === '/admin' || req.path === '/admin-dashboard') {
        // We don't set headers or check status here - the dashboard will fetch it
        res.locals.checkDatabaseStatus = true;
    } else if (req.path.startsWith('/api/')) {
        // For API endpoints, include database status in responses
        // But don't force a check (use cached status) to minimize performance impact
        const dbStatus = checkDatabaseStatus();
        if (!dbStatus.isHealthy) {
            // Add database status to res.locals for API endpoints
            res.locals.dbStatus = {
                isHealthy: dbStatus.isHealthy,
                issues: dbStatus.issues,
                corruptedFiles: dbStatus.corruptedFiles,
                missingFiles: dbStatus.missingFiles
            };
        }
    }
    next();
});

// API response middleware to include database status
app.use((req, res, next) => {
    // Store original res.json method
    const originalJson = res.json;
    
    // Override res.json method to include database status
    res.json = function(obj) {
        // Add database status if it exists in res.locals and isn't already in the response
        if (res.locals.dbStatus && !obj.dbStatus) {
            obj.dbStatus = res.locals.dbStatus;
        }
        
        // Call original method
        return originalJson.call(this, obj);
    };
    
    next();
});

// Apply routes after middlewares
app.use('/api', paymentRoutes);
app.use('/api', walletRoutes);
app.use('/api', merchantRoutes);
app.use('/api', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/secure-keys', secureKeysRoutes);
app.use('/api/secrets', secretsBackendRoutes);

// Add API key config endpoint
app.get('/api/config/api-key', (req, res) => {
    try {
        // Only provide API key to authenticated requests with valid token
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        // Extract and verify token
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'securekeys-jwt-secret-changeme-in-production';
        
        try {
            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Check if it's an admin session token
            if (decoded.type !== 'admin-session') {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid token type'
                });
            }
            
            // Return API key to authenticated client
            const apiKey = process.env.API_KEY || createApiKeyFromEncryptionKey();
            return res.json({
                success: true,
                apiKey
            });
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }
    } catch (error) {
        console.error('Error providing API key:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

// Admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/Public/admin-dashboard.html');
});

// Add this after the app.get('/admin') endpoint
app.get('/api/health/database', (req, res) => {
    const status = checkDatabaseStatus();
    res.json({
        success: true,
        isHealthy: status.isHealthy,
        status
    });
});

// Handle 404
app.use((req, res) => {
    const message = `404 Not Found: ${req.method} ${req.url}`;
    console.log(message);
    logToFile(message);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION - keeping process alive:', error);
    logToFile(`UNCAUGHT EXCEPTION: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED PROMISE REJECTION - keeping process alive:', reason);
    logToFile(`UNHANDLED REJECTION: ${reason}`);
});

// Start the server
const PORT = process.env.PORT || 3000;

// Initialize database before server starts
async function initializeApp() {
  try {
    // Initialize database schema
    console.log('Initializing SQLite database...');
    await initializeDatabase();
    
    // Perform initial sync from JSON to SQLite
    console.log('Syncing data from JSON to SQLite...');
    await syncJsonToDb();
    
    // Setup file watchers for real-time sync
    console.log('Setting up file watchers...');
    setupFileWatchers();
    
    console.log('Database initialized and synced successfully');
    
    // Start the server
    startServer();
  } catch (error) {
    console.error('Error initializing application:', error);
    logToFile(`ERROR INITIALIZING DATABASE: ${error.message}`);
    // Start the server anyway but log the error
    startServer();
  }
}

function startServer() {
  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`Blockchain Payment Gateway Server v1.0`);
    console.log('='.repeat(50));
    console.log(`Server running on port ${PORT}`);
    console.log(`Access e-commerce store at http://localhost:${PORT}`);
    console.log(`Access merchant dashboard at http://localhost:${PORT}/merchant`);
    console.log(`Access admin dashboard at http://localhost:${PORT}/admin`);
    console.log('='.repeat(50));
    
    logToFile('='.repeat(50));
    logToFile(`Blockchain Payment Gateway Server v1.0`);
    logToFile('='.repeat(50));
    logToFile(`Server running on port ${PORT}`);
    logToFile(`Access e-commerce store at http://localhost:${PORT}`);
    logToFile(`Access merchant dashboard at http://localhost:${PORT}/merchant`);
    logToFile(`Access admin dashboard at http://localhost:${PORT}/admin`);
    logToFile('='.repeat(50));
    
    // Validate database on startup
    const validationResult = validateDatabaseOnStartup();
    
    if (!validationResult.success) {
      console.error('⚠️ DATABASE VALIDATION FAILED:');
      validationResult.criticalErrors.forEach(error => console.error(`- ${error}`));
      console.error('Please check the admin dashboard for details and recovery options.');
    } else if (validationResult.issues.length > 0) {
      console.warn('⚠️ DATABASE VALIDATION ISSUES:');
      console.warn(`Found ${validationResult.issues.length} issues.`);
      console.warn(`Fixed ${validationResult.fixedIssues.length} issues automatically.`);
      console.warn('Check the admin dashboard for details.');
    } else {
      console.log('✅ Database validation completed successfully.');
    }
    
    // Initialize database recovery system AFTER validation
    initDatabaseRecovery();
    startScheduledBackups();
  });
}

// Start initialization process
initializeApp();

