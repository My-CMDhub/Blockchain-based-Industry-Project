const express = require('express');
const cors = require('cors');
const Web3 = require('web3');
const fs = require('fs');
const { recoverWallet, getStoredKeys } = require('./recover.js');
const { decrypt } = require('./encryptionUtils');
const winston = require('winston');
const ethers = require('ethers');

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

// Configure logging
function logBlockchain(operation, details) {
    // Skip logging to file
    console.log(`=== BLOCKCHAIN OPERATION [${new Date().toISOString()}] ===`);
    console.log(`>> Operation: ${operation}`);
    console.log(`>> Details: ${JSON.stringify(details, null, 2)}`);
    console.log('=======================================');
}

// Log to file function
function logToFile(message) {
    // Skip logging to file
    console.log(message);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('Public'));

// Log all requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${req.method} ${req.url}`;
    console.log(message);
    logToFile(message);
    
    // For POST or PUT requests, log the body
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
        const bodyMsg = `[${timestamp}] Request Body: ${JSON.stringify(req.body, null, 2)}`;
        console.log(bodyMsg);
        logToFile(bodyMsg);
    }
    
    next();
});

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
    console.log('Web3 HTTP provider initialized with URL:', cleanInfuraUrl);
    
    // Test connection immediately
    web3.eth.getBlockNumber()
        .then(blockNumber => {
            console.log(`Successfully connected to Ethereum. Current block: ${blockNumber}`);
            logBlockchain('WEB3_INIT_SUCCESS', { 
                provider: 'HttpProvider',
                network: 'Sepolia',
                blockNumber
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

// Configure web3 transactions with higher gas to ensure they go through
const TX_DEFAULTS = {
    gas: 21000,
    gasPrice: '50000000000' // 50 gwei in wei
};

// Get a fresh provider when needed - updated with better RPC endpoints and reliability
async function getFreshProvider() {
    console.log('Getting fresh provider with prioritized endpoints...');
    
    // Use multiple RPC endpoints with priority order
    const rpcEndpoints = [
        // Primary options
        'https://ethereum-sepolia.publicnode.com',
        'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
        // Add an Alchemy endpoint
        'https://eth-sepolia.g.alchemy.com/v2/demo',
        // Fallback options
        'https://rpc.sepolia.org',
        'https://sepolia.gateway.tenderly.co',
        'https://rpc2.sepolia.org',
        'https://eth-sepolia.public.blastapi.io'
    ];
    
    // Try each provider until one works
    for (const endpoint of rpcEndpoints) {
        try {
            const providerName = endpoint.split('//')[1].split('.')[0];
            console.log(`Trying provider: ${providerName}`);
            
            const provider = new Web3.providers.HttpProvider(endpoint, {
                timeout: 30000, // 30 second timeout
                // Add retry mechanism
                reconnect: {
                    auto: true,
                    delay: 1000,
                    maxAttempts: 3
                }
            });
            
            const web3 = new Web3(provider);
            const network = await web3.eth.net.getNetworkType();
            const chainId = await web3.eth.getChainId();
            const blockNumber = await web3.eth.getBlockNumber();
            
            // Verify we're on Sepolia (chainId 11155111)
            if (chainId === 11155111) {
                console.log(`Provider ${providerName} connected successfully! Current block: ${blockNumber}`);
                
                // Log to blockchain log
                logBlockchain('WEB3_INIT_SUCCESS', {
                    provider: 'HttpProvider',
                    network: 'Sepolia',
                    blockNumber: blockNumber
                });
                
                return web3;
            } else {
                console.warn(`Provider ${providerName} connected to wrong network: ${network}, chainId: ${chainId}`);
                continue; // Try the next provider
            }
        } catch (error) {
            console.error(`Provider connection failed: ${error.message}`);
            // Continue to the next provider
        }
    }
    
    throw new Error('Failed to connect to any RPC provider. Please check your internet connection and try again later.');
}

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

// Get HD Wallet Balance
app.get('/api/wallet-balance', async (req, res) => {
    try {
        console.log('Retrieving wallet balances...');
        
        // Use cache control headers for better client-side caching
        res.set('Cache-Control', 'private, max-age=10'); // Cache for 10 seconds on client
        
        // Check if we have a cached balance (server-side)
        const cachedBalanceKey = 'wallet_balance_cache';
        const cachedTimestampKey = 'wallet_balance_timestamp';
        
        // Only use cache if it's less than 10 seconds old
        const cachedTimestamp = global[cachedTimestampKey] || 0;
        if (global[cachedBalanceKey] && (Date.now() - cachedTimestamp) < 10000) {
            console.log('Returning cached wallet balance (< 10 seconds old)');
            return res.json(global[cachedBalanceKey]);
        }
        
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        
        // Get root address (index 0)
        const { address: rootAddress } = await recoverWallet(mnemonic, 0);
        
        // Get all active payment addresses
        const activeAddresses = keys.activeAddresses ? Object.keys(keys.activeAddresses) : [];
        
        // Use fresh provider for balance queries
        const freshWeb3 = await getFreshProvider();
        
        // Set a timeout for the entire operation
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Balance check timed out after 20 seconds')), 20000);
        });
        
        // Collect balances from all addresses
        let totalBalance = BigInt(0);
        const balances = {};
        const addressDetails = {};
        
        // Helper function to retry balance checks
        async function getBalanceWithRetry(address, retryCount = 3) {
            while (retryCount > 0) {
                try {
                    return await freshWeb3.eth.getBalance(address);
            } catch (error) {
                    console.error(`Error checking balance for ${address} (${retryCount} retries left):`, error);
                    retryCount--;
                    if (retryCount === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
            throw new Error(`Failed to get balance for ${address} after multiple attempts`);
        }
        
        // Process addresses in batches to improve reliability
        const BATCH_SIZE = 5; // Process 5 addresses at once max
        const addresses = [rootAddress, ...activeAddresses];
        
        try {
            // Race the balance check against the timeout
            await Promise.race([
                (async () => {
                    // Process in batches
                    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
                        const batch = addresses.slice(i, i + BATCH_SIZE);
                        console.log(`Processing batch ${i/BATCH_SIZE + 1} of ${Math.ceil(addresses.length/BATCH_SIZE)} (${batch.length} addresses)`);
                        
                        await Promise.all(batch.map(async (address) => {
                            try {
                                // Check if this is the root address
                                const isRoot = address === rootAddress;
                                
                                // Get balance with retry
                                const balance = await getBalanceWithRetry(address);
                                const formattedBalance = freshWeb3.utils.fromWei(balance, 'ether');
                                
                                // Add to total balance
                                totalBalance += BigInt(balance);
                                
                                // Store formatted balance
                                balances[address] = formattedBalance;
                                
                                // Get additional info for payment addresses
                                if (!isRoot && keys.activeAddresses && keys.activeAddresses[address]) {
                                    const addrInfo = keys.activeAddresses[address];
                                    
                                    // Store detailed information
                                    addressDetails[address] = {
                                        type: 'payment',
                                        balance: formattedBalance,
                                        rawBalance: balance.toString(),
                                        recordedAmount: addrInfo.amount || '0',
                                        cryptoType: addrInfo.cryptoType || 'ETH',
                                        lastUpdated: addrInfo.timestamp || null,
                                        index: addrInfo.index || 0
                                    };
                                    
                                    // Update stored address data with latest balance
                                    keys.activeAddresses[address].currentBalance = formattedBalance;
                                    keys.activeAddresses[address].lastChecked = new Date().toISOString();
                                } else if (isRoot) {
                                    // Store root address details
                                    addressDetails[address] = {
                                        type: 'root',
                                        balance: formattedBalance,
                                        rawBalance: balance.toString()
                                    };
                                }
                            } catch (addrError) {
                                console.error(`Failed to get balance for ${address}:`, addrError);
                                balances[address] = '0';
                                addressDetails[address] = {
                                    type: address === rootAddress ? 'root' : 'payment',
                                    balance: '0',
                                    error: addrError.message
                                };
                            }
                        }));
                    }
                })(),
                timeoutPromise
            ]);
        } catch (error) {
            // If we hit the timeout but have some data, continue with what we have
            if (error.message.includes('timed out')) {
                console.warn('Balance check timed out, but continuing with partial data');
                // Continue with partial data if we have it
                if (Object.keys(balances).length === 0) {
                    throw error; // Re-throw if we have no data at all
                }
            } else {
                throw error; // Re-throw other errors
            }
        }
        
        // Save updated address data
        try {
            fs.writeFileSync('./Json/keys.json', JSON.stringify(keys, null, 2));
        } catch (saveError) {
            console.error('Error saving updated address data:', saveError);
            // Continue execution - this is non-critical
        }
        
        // Calculate total ETH
        const totalEth = freshWeb3.utils.fromWei(totalBalance.toString(), 'ether');
        
        logBlockchain('BALANCE_CHECK', {
            rootAddress,
            activeAddressCount: activeAddresses.length,
            totalBalance: totalEth
        });
        
        console.log(`Total balance: ${totalEth} ETH across ${activeAddresses.length + 1} addresses`);
        
        // Prepare response
        const responseData = {
            success: true,
            balance: totalEth,
            rootAddress,
            activeAddresses,
            balances,
            addressDetails,
            timestamp: Date.now()
        };
        
        // Cache the response
        global[cachedBalanceKey] = responseData;
        global[cachedTimestampKey] = Date.now();
        
        res.json(responseData);
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        logToFile(`ERROR: Error getting wallet balance: ${error.message}`);
        
        // If we have a cached version, return that with a warning
        const cachedBalanceKey = 'wallet_balance_cache';
        if (global[cachedBalanceKey]) {
            console.log('Returning stale cached data due to error');
            // Clone the cached data and mark it as stale
            const staleData = {
                ...global[cachedBalanceKey],
                stale: true,
                warning: 'Using cached data due to error'
            };
            return res.json(staleData);
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to get wallet balance: ' + error.message
        });
    }
});

// Update the Alchemy endpoint and add backup providers

const PROVIDERS = {
   
    INFURA: 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
    BACKUP: 'https://rpc.sepolia.org'
};

// Generate new payment address
app.post('/api/generate-payment-address', async (req, res) => {
    try {
        logger.info('Generating payment address', { body: req.body });
        
        const { amount, cryptoType } = req.body;
        if (!amount || !cryptoType) {
            logger.error('Missing required parameters', { amount, cryptoType });
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required parameters' 
            });
        }

        // Get keys to derive address from HD wallet
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        
        // Find the next available index
        let nextIndex = 1; // Start from 1 as 0 is the root
        
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        } else {
            // Find the highest index used so far
            const usedIndices = Object.values(keys.activeAddresses)
                .map(addr => addr.index || 0)
                .filter(index => index > 0);
            
            if (usedIndices.length > 0) {
                nextIndex = Math.max(...usedIndices) + 1;
            }
        }
        
        // Try multiple providers in sequence to check network
        let provider;
        let networkInfo;
        
        for (const [name, url] of Object.entries(PROVIDERS)) {
            try {
                provider = new ethers.providers.JsonRpcProvider(url);
                logger.info(`Trying provider: ${name}`);
                
                // Test the connection with a timeout
                const networkPromise = provider.getNetwork();
                networkInfo = await Promise.race([
                    networkPromise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Provider timeout')), 5000)
                    )
                ]);
                
                logger.info(`Successfully connected to ${name}`, { network: networkInfo });
                break; // If successful, exit the loop
                
            } catch (error) {
                logger.warn(`Provider ${name} failed`, { error: error.message });
                continue; // Try next provider
            }
        }

        // Generate HD wallet address from mnemonic using next index
        const { address, privateKey } = await recoverWallet(mnemonic, nextIndex);
        logger.info('Generated HD wallet address', { address, index: nextIndex });
        
        // Store address in active addresses
        keys.activeAddresses[address] = {
            index: nextIndex,
            expectedAmount: amount,
            cryptoType: cryptoType,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
            status: 'pending'
        };
        
        // Save updated keys
        fs.writeFileSync('./Json/keys.json', JSON.stringify(keys, null, 2));

        // Prepare response
        const response = {
            success: true,
            address: address,
            networkId: networkInfo ? networkInfo.chainId : 11155111, // Sepolia
            networkType: networkInfo ? networkInfo.name : 'sepolia',
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString()
        };

        logger.info('Sending response', { response });
        res.json(response);

    } catch (error) {
        logger.error('Error generating payment address', { error });
        
        // Try to recover by generating a random wallet as backup
        try {
            // Get keys
            const keys = getStoredKeys();
            const mnemonic = decrypt(keys.mnemonic);
            
            // Use last index + 1 or 999 as emergency
            const emergencyIndex = 999;
            const { address } = await recoverWallet(mnemonic, emergencyIndex);
            
            // Still save this emergency address
            if (!keys.activeAddresses) {
                keys.activeAddresses = {};
            }
            
            keys.activeAddresses[address] = {
                index: emergencyIndex,
                expectedAmount: req.body.amount || '0',
                cryptoType: req.body.cryptoType || 'ETH',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
                status: 'emergency',
                error: error.message
            };
            
            // Save updated keys
            fs.writeFileSync('./Json/keys.json', JSON.stringify(keys, null, 2));
            
            res.json({
                success: true,
                address: address,
                networkId: 11155111, // Sepolia
                networkType: 'sepolia',
                expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
                note: 'Emergency address generated'
            });
        } catch (recoveryError) {
            logger.error('Failed to recover with HD wallet, falling back to random wallet', { error: recoveryError });
            
            // Last resort fallback - generate completely random wallet
        const wallet = ethers.Wallet.createRandom();
        res.json({
            success: true,
            address: wallet.address,
                networkId: 11155111, 
            networkType: 'sepolia',
                expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
                note: 'Emergency address generated'
        });
        }
    }
});

// New endpoint to verify transaction status
app.post('/api/verify-transaction', async (req, res) => {
    const { txHash, cryptoType } = req.body;
    
    if (!txHash) {
        return res.status(400).json({
            success: false,
            error: 'Transaction hash is required'
        });
    }
    
    logBlockchain('TRANSACTION_VERIFICATION_REQUESTED', {
        txHash,
        cryptoType
    });
    
    try {
        // First try with our main provider
        let txReceipt, txDetails;
        
        try {
            // Get transaction receipt
            txReceipt = await web3.eth.getTransactionReceipt(txHash);
            
            // If no receipt, try with a fresh provider
            if (!txReceipt) {
                console.log('Transaction receipt not found with primary provider, trying alternative');
                const altWeb3 = await getFreshProvider();
                txReceipt = await altWeb3.eth.getTransactionReceipt(txHash);
            }
            
            // Get full transaction details if we have a receipt
            if (txReceipt) {
                txDetails = await web3.eth.getTransaction(txHash);
                
                // If no details, try with a fresh provider
                if (!txDetails) {
                    const altWeb3 = await getFreshProvider();
                    txDetails = await altWeb3.eth.getTransaction(txHash);
                }
            }
        } catch (providerError) {
            console.error('Error with primary provider, trying alternative:', providerError);
            const altWeb3 = await getFreshProvider();
            txReceipt = await altWeb3.eth.getTransactionReceipt(txHash);
            
            if (txReceipt) {
                txDetails = await altWeb3.eth.getTransaction(txHash);
            }
        }
        
        if (!txReceipt) {
            logBlockchain('TRANSACTION_PENDING', { txHash });
            return res.json({
                success: true,
                status: 'pending',
                message: 'Transaction is still pending or not found'
            });
        }
        
        // Log detailed transaction information if we have it
        if (txDetails) {
            logBlockchain('TRANSACTION_DETAILS', {
                receipt: {
                    blockNumber: txReceipt.blockNumber,
                    status: txReceipt.status,
                    gasUsed: txReceipt.gasUsed
                },
                transaction: {
                    hash: txDetails.hash,
                    from: txDetails.from,
                    to: txDetails.to,
                    value: txDetails.value ? web3.utils.fromWei(txDetails.value, 'ether') + ' ETH' : '0 ETH',
                    gasPrice: txDetails.gasPrice ? web3.utils.fromWei(txDetails.gasPrice, 'gwei') + ' gwei' : 'unknown',
                    gas: txDetails.gas,
                    blockNumber: txDetails.blockNumber
                }
            });
        } else {
            logBlockchain('TRANSACTION_RECEIPT_ONLY', {
                blockNumber: txReceipt.blockNumber,
                status: txReceipt.status,
                gasUsed: txReceipt.gasUsed
            });
        }
        
        // Determine if transaction was successful based on receipt
        const isSuccess = txReceipt.status;
        
        if (isSuccess) {
            // Get current block for confirmations count
            const currentBlock = await web3.eth.getBlockNumber();
            const confirmations = txReceipt.blockNumber ? (currentBlock - txReceipt.blockNumber) + 1 : 0;
            
            // For successful transaction
            return res.json({
                success: true,
                status: 'confirmed',
                confirmations: confirmations,
                blockNumber: txReceipt.blockNumber,
                message: 'Transaction confirmed successfully!',
                receipt: {
                    blockNumber: txReceipt.blockNumber,
                    status: txReceipt.status,
                    gasUsed: txReceipt.gasUsed,
                    from: txReceipt.from,
                    to: txReceipt.to
                }
            });
        } else {
            // For failed transaction
            return res.json({
                success: true,
                status: 'failed',
                blockNumber: txReceipt.blockNumber,
                message: 'Transaction failed on the blockchain',
                receipt: {
                    blockNumber: txReceipt.blockNumber,
                    status: txReceipt.status,
                    gasUsed: txReceipt.gasUsed,
                    from: txReceipt.from,
                    to: txReceipt.to
                }
            });
        }
    } catch (error) {
        console.error('Error verifying transaction:', error);
        logBlockchain('TRANSACTION_VERIFICATION_ERROR', {
            txHash,
            error: error.message
        });
        
        return res.status(500).json({
            success: false,
            error: 'Failed to verify transaction: ' + error.message
        });
    }
});

// Process payment - revised to use real blockchain data only
app.post('/api/process-payment', async (req, res) => {
    const { cryptoType, address, pollCount, txHash } = req.body;
    
    console.log(`[${new Date().toISOString()}] Payment check for address: ${address}, pollCount: ${pollCount || 'N/A'}`);
    logToFile(`Payment check for address: ${address}, pollCount: ${pollCount || 'N/A'}`);
    
    try {
        // If transaction hash is directly provided
        if (txHash) {
            try {
                const txReceipt = await web3.eth.getTransactionReceipt(txHash);
                
                // Transaction found on blockchain
                if (txReceipt) {
                    // Check if transaction is confirmed (has block number and status)
                    if (txReceipt.blockNumber && txReceipt.status) {
                        logBlockchain('TRANSACTION_CONFIRMED', {
                            hash: txHash,
                            blockNumber: txReceipt.blockNumber,
                            from: txReceipt.from,
                            to: txReceipt.to
                        });
                        
                        return res.json({
                            success: true,
                            status: 'confirmed',
                            txHash: txHash,
                            receipt: {
                                blockNumber: txReceipt.blockNumber,
                                status: txReceipt.status
                            }
                        });
                    } 
                    // Transaction exists but failed
                    else if (txReceipt.blockNumber && !txReceipt.status) {
                        logBlockchain('TRANSACTION_FAILED', {
                            hash: txHash,
                            blockNumber: txReceipt.blockNumber
                        });
                        
                        return res.json({
                            success: false,
                            status: 'failed',
                            txHash: txHash,
                            error: 'Transaction was rejected by the blockchain'
                        });
                    }
                    // Transaction exists but still pending 
                    else {
                        logBlockchain('TRANSACTION_PENDING', {
                            hash: txHash
                        });
                        
                        return res.json({
                            success: true,
                            status: 'pending',
                            txHash: txHash,
                            pending: true
                        });
                    }
                }
                // Transaction not found yet
                else {
                    logBlockchain('TRANSACTION_NOT_FOUND', {
                        hash: txHash
                    });
                    
                    return res.json({
                        success: true,
                        status: 'not_found',
                        txHash: txHash
                    });
                }
            } catch (txError) {
                console.error('Error checking transaction:', txError);
                logBlockchain('TRANSACTION_CHECK_ERROR', {
                    hash: txHash,
                    error: txError.message
                });
                
                return res.status(500).json({
                    success: false,
                    error: 'Error checking transaction: ' + txError.message
                });
            }
        }
        
        // No hash provided, check for transactions to the address
        if (address) {
            try {
                // Check the most recent blocks for transactions to this address
                const latestBlockNumber = await web3.eth.getBlockNumber();
                const blocksToCheck = 5; // Check the last 5 blocks
                
                for (let i = 0; i < blocksToCheck; i++) {
                    const blockNumber = latestBlockNumber - i;
                    const block = await web3.eth.getBlock(blockNumber, true);
                    
                    if (block && block.transactions) {
                        // Find transactions to our address
                        const matchingTx = block.transactions.find(tx => 
                            tx.to && tx.to.toLowerCase() === address.toLowerCase());
                        
                        if (matchingTx) {
                            // Found a matching transaction!
                            const txReceipt = await web3.eth.getTransactionReceipt(matchingTx.hash);
                            
                            logBlockchain('TRANSACTION_FOUND_IN_BLOCK', {
                                hash: matchingTx.hash,
                                blockNumber: matchingTx.blockNumber,
                                from: matchingTx.from,
                                to: matchingTx.to,
                                value: web3.utils.fromWei(matchingTx.value, 'ether') + ' ETH'
                            });
                            
                            return res.json({
                                success: true,
                                status: txReceipt && txReceipt.status ? 'confirmed' : 'failed',
                                txHash: matchingTx.hash,
                                receipt: txReceipt
                            });
                        }
                    }
                }
                
                // No transaction found yet, return this fact
                return res.json({
                    success: true,
                    status: 'no_transaction',
                    message: 'No transactions found yet for this address'
                });
                
            } catch (addressCheckError) {
                console.error('Error checking address for transactions:', addressCheckError);
                return res.status(500).json({
                    success: false,
                    error: 'Error checking for transactions: ' + addressCheckError.message
                });
            }
        }
        
        // If we got here, we don't have enough information to check for transactions
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: address or txHash'
        });
        
    } catch (error) {
        const errorMsg = `Payment processing failed: ${error.message || 'Unknown error'}`;
        console.error(errorMsg);
        logToFile(`ERROR: ${errorMsg}`);
        
        logBlockchain('PAYMENT_CHECK_FAILED', {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({
            success: false,
            error: 'Payment check failed: ' + (error.message || 'Unknown error')
        });
    }
});

// Get merchant transaction history
app.get('/api/merchant-transactions', async (req, res) => {
    try {
        // Use cache control headers for better client-side caching
        res.set('Cache-Control', 'private, max-age=30'); // Cache for 30 seconds on client
        
        // Check if we have a cached result (server-side)
        const cachedTxKey = 'tx_history_cache';
        const cachedTxTimestampKey = 'tx_history_timestamp';
        
        // Only use cache if it's less than 30 seconds old
        const cachedTimestamp = global[cachedTxTimestampKey] || 0;
        if (global[cachedTxKey] && (Date.now() - cachedTimestamp) < 30000) {
            console.log('Returning cached transaction history (< 30 seconds old)');
            return res.json(global[cachedTxKey]);
        }
        
        console.log('Reading transaction history from file');
        const txFile = 'merchant_transactions.json';
        let transactions = [];
        
        if (fs.existsSync(txFile)) {
            try {
            const fileContent = fs.readFileSync(txFile, 'utf8');
                if (fileContent && fileContent.trim()) {
                    transactions = JSON.parse(fileContent);
            
            // Ensure we have an array
                    if (!Array.isArray(transactions)) {
                console.warn('Transaction log was corrupted, resetting to empty array');
                        transactions = [];
                        
                        // Create a backup of the corrupted file
                        const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                        fs.copyFileSync(txFile, backupFile);
                        console.warn(`Created backup of corrupted file: ${backupFile}`);
                        
                        // Reset the file with an empty array
                        fs.writeFileSync(txFile, JSON.stringify([]));
                    }
                } else {
                    console.log('Transaction file is empty, initializing with empty array');
                    transactions = [];
                    fs.writeFileSync(txFile, JSON.stringify([]));
                }
            } catch (parseError) {
                console.error('Error parsing transaction log:', parseError);
                
                // Create a backup of the corrupted file
                const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                try {
                    fs.copyFileSync(txFile, backupFile);
                    console.warn(`Created backup of corrupted file: ${backupFile}`);
                } catch (backupError) {
                    console.error('Error creating backup:', backupError);
                }
                
                // Reset with empty array
                transactions = [];
                fs.writeFileSync(txFile, JSON.stringify([]));
            }
        } else {
            console.log('Transaction file does not exist, creating empty file');
            transactions = [];
            fs.writeFileSync(txFile, JSON.stringify([]));
        }
        
        // Try to enhance transaction data with wallet information
        try {
            // Get active addresses info (only if transaction list is not empty)
            if (transactions.length > 0) {
                const keys = getStoredKeys();
                const activeAddresses = keys.activeAddresses || {};
                
                // Enhance transactions with additional data
                transactions = transactions.map(tx => {
                    // Check if this is an address we know about
                    if (tx.address && activeAddresses[tx.address]) {
                        const addrInfo = activeAddresses[tx.address];
                        return {
                            ...tx,
                            addrInfo: {
                                createdAt: addrInfo.createdAt,
                                expectedAmount: addrInfo.expectedAmount,
                                cryptoType: addrInfo.cryptoType,
                                status: addrInfo.status
                            }
                        };
                    }
                    return tx;
                });
            }
        } catch (walletError) {
            console.warn('Could not enhance transactions with wallet data:', walletError.message);
            // Continue with basic transaction data
        }
        
        // Sort by timestamp (newest first)
        transactions.sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Limit to the most recent 100 transactions to avoid huge payloads
        const limitedTransactions = transactions.slice(0, 100);
        
        // Prepare response
        const responseData = {
            success: true,
            transactions: limitedTransactions,
            total: transactions.length,
            timestamp: Date.now()
        };
        
        // Cache the response
        global[cachedTxKey] = responseData;
        global[cachedTxTimestampKey] = Date.now();
        
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching merchant transactions:', error);
        
        // If we have a cached version, return that with a warning
        const cachedTxKey = 'tx_history_cache';
        if (global[cachedTxKey]) {
            console.log('Returning stale cached transaction history due to error');
            // Clone the cached data and mark it as stale
            const staleData = {
                ...global[cachedTxKey],
                stale: true,
                warning: 'Using cached data due to error'
            };
            return res.json(staleData);
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction history: ' + error.message
        });
    }
});

// Create a new helper function for sending transactions with robust error handling and retries
async function sendTransactionWithRetry(web3, signedTx, retries = 5, timeout = 180000) {
    console.log('Starting robust transaction sending process...');
    const txHash = signedTx.transactionHash;
    const startTime = Date.now();
    
    // Store original transaction data
    const txData = {
        hash: txHash,
        startTime: startTime,
        attempts: 0
    };
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        console.log(`Transaction send attempt ${attempt}/${retries} for hash ${txHash}`);
        
        try {
            // First check if the transaction already exists on the network
            console.log(`Checking if transaction already exists on the network...`);
            const receipt = await checkTransactionReceipt(web3, txHash, 3);
            
            if (receipt) {
                console.log(`Transaction already confirmed! Receipt:`, receipt);
                return receipt;
            }
            
            // If we're here, we need to send or resend the transaction
            try {
                // Send the transaction
                const sentTxHash = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
                console.log(`Transaction submitted to network with hash: ${txHash}`);
                
                // Wait for confirmation with long timeout for first attempt
                const longTimeout = attempt === 1 ? timeout : timeout / 2;
                const receipt = await waitForTransactionReceipt(web3, txHash, longTimeout);
                
                if (receipt) {
                    console.log(`Transaction confirmed in block ${receipt.blockNumber}!`);
                    // Log final status with gas used
                    console.log(`Gas used: ${receipt.gasUsed}, status: ${receipt.status}`);
                    return receipt;
                }
            } catch (sendError) {
                // If it's a "known transaction" error, it means the tx is already in the pool
                if (sendError.message.includes('known transaction') || 
                    sendError.message.includes('already known')) {
                    console.log(`Transaction ${txHash} is already in the mempool, waiting for confirmation...`);
                    
                    // Try to get receipt again
                    try {
                        const receipt = await waitForTransactionReceipt(web3, txHash, timeout / 2);
                        if (receipt) {
                            console.log(`Transaction confirmed in block ${receipt.blockNumber}!`);
                            return receipt;
                        }
                    } catch (waitError) {
                        console.error(`Error waiting for existing transaction: ${waitError.message}`);
                    }
                } else {
                    console.error(`Error sending transaction (attempt ${attempt}/${retries}): ${sendError.message}`);
                }
            }
            
            console.error(`Error sending transaction (attempt ${attempt}/${retries}): Transaction confirmation timed out`);
            
            // If we get here, we need to retry - first, use a fresh provider
            if (attempt < retries) {
                console.log(`Retrying in 3000ms...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                try {
                    // Try with a fresh Web3 provider for retry
                    const freshWeb3 = await getFreshProvider();
                    console.log('Got fresh provider for retry attempt');
                    web3 = freshWeb3; // Replace the web3 instance for subsequent tries
                    
                    // Check if transaction was already mined with new provider
                    const receipt = await checkTransactionReceipt(web3, txHash, 5);
                    if (receipt) {
                        console.log(`Transaction was already confirmed! Receipt:`, receipt);
                        return receipt;
                    }
                } catch (providerError) {
                    console.error(`Error getting fresh provider: ${providerError.message}`);
                }
            }
        } catch (error) {
            console.error(`Unexpected error during transaction attempt ${attempt}: ${error.message}`);
        }
    }
    
    // If we've exhausted all retries, throw an error
    throw new Error(`Failed to send transaction after ${retries} attempts: Transaction confirmation timed out`);
}

// Helper function to wait for receipt with timeout
async function waitForTransactionReceipt(web3, txHash, timeout = 120000) {
    console.log(`Waiting for transaction receipt for ${txHash} (timeout: ${timeout}ms)...`);
    
    // Implement a more robust receipt checking mechanism
    const checkInterval = 3000; // Check every 3 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const receipt = await web3.eth.getTransactionReceipt(txHash);
            if (receipt && receipt.blockNumber) {
                return receipt;
            }
            
            // Log progress periodically
            if ((Date.now() - startTime) % 15000 < checkInterval) {
                console.log(`Still waiting for receipt... (${Math.round((Date.now() - startTime)/1000)}s elapsed)`);
                
                // Check current block number
                try {
                    const currentBlock = await web3.eth.getBlockNumber();
                    console.log(`Current block: ${currentBlock}`);
                } catch (blockError) {
                    console.error(`Error checking current block: ${blockError.message}`);
                }
            }
            
            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        } catch (error) {
            console.error(`Error checking receipt: ${error.message}`);
            
            // If we detect a connection issue, try to refresh the provider
            if (error.message.includes('CONNECTION ERROR') || 
                error.message.includes('Invalid JSON RPC response') ||
                error.message.includes('timeout')) {
                console.log('Connection error detected, trying to get fresh provider...');
                try {
                    const freshWeb3 = await getFreshProvider();
                    console.log('Successfully switched to a fresh provider');
                    web3 = freshWeb3; // Replace the web3 instance
                } catch (providerError) {
                    console.error(`Failed to get fresh provider: ${providerError.message}`);
                }
            }
            
            // Wait a bit longer after errors
            await new Promise(resolve => setTimeout(resolve, checkInterval * 2));
        }
    }
    
    console.log(`Timeout reached while waiting for transaction receipt`);
    return null;
}

// Enhanced helper to check transaction receipt with polling
async function checkTransactionReceipt(web3, txHash, maxAttempts = 10) {
    console.log(`Checking for transaction receipt: ${txHash}`);
    let attempts = 0;
    
    // Try multiple providers if first one fails
    async function getReceiptWithFallback(txHash) {
        try {
            return await web3.eth.getTransactionReceipt(txHash);
        } catch (error) {
            console.error('Error in primary provider, trying fallback for receipt check...');
            try {
                const fallbackWeb3 = await getFreshProvider();
                return await fallbackWeb3.eth.getTransactionReceipt(txHash);
            } catch (fallbackError) {
                console.error('Fallback provider also failed for receipt check');
                return null;
            }
        }
    }
    
    while (attempts < maxAttempts) {
        attempts++;
        try {
            const receipt = await getReceiptWithFallback(txHash);
            if (receipt) {
                console.log(`Receipt found on attempt ${attempts}/${maxAttempts}:`, JSON.stringify({
                    blockNumber: receipt.blockNumber,
                    status: receipt.status,
                    gasUsed: receipt.gasUsed
                }, null, 2));
                return receipt;
            }
            console.log(`Receipt not found yet, attempt ${attempts}/${maxAttempts}`);
        } catch (error) {
            console.error(`Error checking receipt (attempt ${attempts}/${maxAttempts}):`, error.message);
        }
        
        // Wait before the next attempt - increasing wait times
        const delay = 2000 * Math.pow(1.5, attempts-1);
        console.log(`Waiting ${delay}ms before next receipt check...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log(`Could not find receipt after ${maxAttempts} attempts`);
    return null; // Return null if no receipt found after all attempts
}

// Release funds to merchant
app.post('/api/release-funds', async (req, res) => {
    const { amount } = req.body;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /api/release-funds`);
    console.log(`[${timestamp}] Request Body: ${JSON.stringify(req.body)}`);
    
    if (!amount) {
        return res.status(400).json({ 
            success: false,
            error: 'Amount is required' 
        });
    }
    
    console.log('====================', 'FUND RELEASE REQUEST', '====================');
    console.log(`Request received to release ${amount} ETH`);
    
    try {
        // Verify merchant address is configured
        const merchantAddress = process.env.MERCHANT_ADDRESS || DEFAULT_MERCHANT_ADDRESS;
        console.log(`Merchant address verified: ${merchantAddress}`);
        console.log(`Requested amount: ${amount} ETH`);
    
    logBlockchain('FUNDS_RELEASE_REQUESTED', { amount });
    
        // Initialize web3 provider for transaction
        console.log('Initializing fresh Web3 provider...');
        const freshWeb3 = await getFreshProvider();
        console.log('Web3 provider initialized successfully');
        
        // Get wallet keys from storage
        console.log('Retrieving wallet keys...');
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        
        // Decrypt the mnemonic
        console.log('Decrypting mnemonic...');
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        
        // Recover the root wallet from mnemonic
        console.log('Recovering root wallet...');
        const rootAddress = await recoverWallet(mnemonic, 0);
        const rootAddr = rootAddress.address;
        console.log(`Root address: ${rootAddr}`);
        
        // Get active HD wallet addresses
        const activeAddresses = keys.activeAddresses || {};
        console.log(`Found ${Object.keys(activeAddresses).length} active addresses`);
        
        // Calculate total balance across all addresses
        console.log('Calculating total available balance...');
        
        // Check root address balance
        console.log('Checking root address balance...');
        const rootBalance = await getBalanceWithRetry(freshWeb3, rootAddr);
        console.log(`Root address balance: ${rootBalance} ETH`);
        
        // Check all active address balances to find one with sufficient funds
        console.log(`Checking balances of ${Object.keys(activeAddresses).length} active addresses...`);
        const addressBalances = [];
        
        for (const addr in activeAddresses) {
            const addrInfo = activeAddresses[addr];
            console.log(`Checking balance for ${addr}...`);
            const balance = await getBalanceWithRetry(freshWeb3, addr);
            console.log(`Address ${addr} balance: ${balance} ETH`);
            
            addressBalances.push({
                address: addr,
                balance: parseFloat(balance),
                ethBalance: balance,
                index: addrInfo.index
            });
        }
        
        // Calculate total balance
        const totalBalanceEth = addressBalances.reduce((sum, addr) => sum + addr.balance, 0) + parseFloat(rootBalance);
        console.log(`Total available balance across all addresses: ${totalBalanceEth} ETH`);
        
        // Convert amount to wei for calculations
        const amountWei = freshWeb3.utils.toWei(amount, 'ether');
        console.log(`Requested amount in wei: ${amountWei}`);
        
        // First try to use root address if it has sufficient balance
        if (parseFloat(rootBalance) >= parseFloat(amount)) {
            // Root address has enough funds, proceed with transaction
            console.log(`Root address has sufficient balance (${rootBalance} ETH). Using it for the transfer.`);
            
            // Check for existing pending transactions from root address to merchant
            const pendingTx = await checkPendingTransactions(rootAddr, merchantAddress);
            
            // If we found a pending transaction, check if it's truly still pending
            if (pendingTx && pendingTx.txHash) {
                console.log(`Found existing pending transaction ${pendingTx.txHash}, checking status...`);
                
                // Check if transaction is actually still pending by checking for a receipt
                const receipt = await checkTransactionReceipt(freshWeb3, pendingTx.txHash);
                if (receipt) {
                    console.log(`Found receipt for pending transaction: ${JSON.stringify(receipt)}`);
                    
                    // Update transaction status in our log based on receipt info
                    updateTransactionLog(pendingTx.txHash, {
                        status: receipt.status,
                        blockNumber: receipt.blockNumber,
                        confirmations: 1, // At least 1 confirmation since it's mined
                    });
                    
                    if (receipt.status === true) {
                        // Transaction was successful, so no need to send a new one
                        console.log(`Found receipt for pending transaction, not sending a new one`);
                        return res.json({
                            success: true,
                            message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                            txHash: pendingTx.txHash,
                            amount: pendingTx.amount,
                            timestamp: pendingTx.timestamp,
                            existingTransaction: true
                        });
                    } else {
                        // Transaction failed, should send a new one
                        console.log(`Previous transaction failed, sending a new one`);
                    }
                } else {
                    // No receipt found, transaction is still pending
                    console.log(`No receipt found, existing transaction is still pending`);
                    return res.json({
                        success: true,
                        message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                        txHash: pendingTx.txHash,
                        amount: pendingTx.amount,
                        timestamp: pendingTx.timestamp,
                        existingTransaction: true
                    });
                }
            }
            
            // Proceed with sending a new transaction from root address
            console.log('Preparing transaction from root address...');
            
            try {
                // Get reliable nonce for root address
                const nonce = await getReliableNonce(freshWeb3, rootAddr);
                console.log(`Using nonce: ${nonce} for root address`);
                
                // Get reliable gas price
                const gasPrice = await getReliableGasPrice(freshWeb3);
                console.log(`Using gas price: ${freshWeb3.utils.fromWei(gasPrice, 'gwei')} gwei`);
                
                // Standard gas limit for ETH transfer
                const gasLimit = 21000;
                console.log(`Using gas limit: ${gasLimit}`);
                
                // Calculate gas cost
                const gasCostWei = BigInt(gasPrice) * BigInt(gasLimit);
                const gasCostEth = freshWeb3.utils.fromWei(gasCostWei.toString(), 'ether');
                console.log(`Estimated gas cost: ${gasCostEth} ETH`);
                
                // Calculate maximum amount to send (considering gas)
                const maxAmountWei = BigInt(freshWeb3.utils.toWei(rootBalance, 'ether')) - gasCostWei;
                const requestedAmountWei = BigInt(freshWeb3.utils.toWei(amount, 'ether'));
                
                // Ensure we're not trying to send more than available after gas
                if (requestedAmountWei > maxAmountWei) {
                    console.log(`Requested amount plus gas exceeds available balance`);
                    console.log(`Max sendable amount: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`);
                    
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance after gas fees. Available to send: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`
                    });
                }
                
                // Prepare transaction data
                const txData = {
                    from: rootAddr,
                    to: merchantAddress,
                    value: freshWeb3.utils.toHex(requestedAmountWei.toString()),
                    gas: gasLimit,
                    gasPrice: gasPrice,
                    nonce: nonce
                };
                
                console.log('Transaction data prepared:', JSON.stringify(txData, null, 2));
                
                // Sign transaction
                console.log('Signing transaction...');
                const signedTx = await freshWeb3.eth.accounts.signTransaction(txData, rootAddress.privateKey);
                console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
                
                // Send transaction with retry mechanism
                console.log('Sending transaction with retry...');
                const receipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                console.log('Transaction successfully sent and confirmed!');
                console.log(`Transaction hash: ${receipt.transactionHash}`);
                console.log(`Block number: ${receipt.blockNumber}`);
                console.log(`Gas used: ${receipt.gasUsed}`);
                
                // Record the transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const txLogEntry = {
                    txId: txId,
                    txHash: signedTx.transactionHash,
                    from: rootAddr,
                    to: merchantAddress,
                    amount: amount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    type: 'release'
                };
                
                // Save transaction to log
                saveTxLog(txLogEntry);
                
                // Return success response
                return res.json({
                    success: true,
                    txHash: signedTx.transactionHash,
                    amount: amount,
                    timestamp: new Date().toISOString(),
                    blockNumber: receipt.blockNumber
                });
                
            } catch (txError) {
                console.error('Error sending transaction from root address:', txError);
                console.error('Stack trace:', txError.stack);
                
                // Log the detailed error for debugging
                logBlockchain('TX_ERROR', {
                    address: rootAddr,
                    error: txError.message,
                    stack: txError.stack
                });
                
                return res.status(500).json({
                    success: false,
                    error: `Failed to send transaction: ${txError.message}`
                });
            }
        } else {
            console.log(`Root address has insufficient balance. Consolidating funds from ${Object.keys(activeAddresses).length} active addresses...`);
            
            // Find addresses with positive balances
            const fundedAddresses = addressBalances.filter(addr => addr.balance > 0);
            console.log(`Found ${fundedAddresses.length} addresses with positive balances`);
            
            if (fundedAddresses.length === 0) {
            return res.status(400).json({
                success: false,
                    error: 'Insufficient balance across all wallet addresses'
                });
            }
            
            // Find address with highest balance
            const highestBalanceAddr = fundedAddresses.reduce((max, addr) => 
                addr.balance > max.balance ? addr : max, fundedAddresses[0]);
                
            console.log(`Highest balance address: ${highestBalanceAddr.address} with ${highestBalanceAddr.ethBalance} ETH`);
            
            if (highestBalanceAddr.balance < parseFloat(amount)) {
            return res.status(400).json({
                success: false,
                    error: `Insufficient balance. Requested: ${amount} ETH, Available: ${highestBalanceAddr.ethBalance} ETH`
                });
            }
            
            console.log(`Using address ${highestBalanceAddr.address} with balance ${highestBalanceAddr.ethBalance} ETH for direct release`);
            
            // Check for existing pending transactions
            const pendingTx = await checkPendingTransactions(highestBalanceAddr.address, merchantAddress);
            
            // If we found a pending transaction, check if it's truly still pending
            if (pendingTx && pendingTx.txHash) {
                console.log(`Found existing pending transaction ${pendingTx.txHash}, checking status...`);
                
                // Check if transaction is actually still pending by checking for a receipt
                const receipt = await checkTransactionReceipt(freshWeb3, pendingTx.txHash);
                if (receipt) {
                    console.log(`Found receipt for pending transaction: ${JSON.stringify(receipt)}`);
                    
                    // Update transaction status in our log based on receipt info
                    updateTransactionLog(pendingTx.txHash, {
                        status: receipt.status,
                        blockNumber: receipt.blockNumber,
                        confirmations: 1, // At least 1 confirmation since it's mined
                    });
                    
                    if (receipt.status === true) {
                        // Transaction was successful, so no need to send a new one
                        console.log(`Found receipt for pending transaction, not sending a new one`);
                        return res.json({
                            success: true,
                            message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                            txHash: pendingTx.txHash,
                            amount: pendingTx.amount,
                            timestamp: pendingTx.timestamp,
                            existingTransaction: true
                        });
                    } else {
                        // Transaction failed, should send a new one
                        console.log(`Previous transaction failed, sending a new one`);
                    }
                } else {
                    // No receipt found, transaction is still pending
                    console.log(`No receipt found, existing transaction is still pending`);
                    return res.json({
                        success: true,
                        message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                        txHash: pendingTx.txHash,
                        amount: pendingTx.amount,
                        timestamp: pendingTx.timestamp,
                        existingTransaction: true
                    });
                }
            }
            
            // Proceed with sending a new transaction from highest balance address
            console.log('Preparing transaction from highest balance address...');
            
            try {
                // Recover the private key for this address
                console.log(`Recovering wallet for index ${highestBalanceAddr.index}...`);
                const senderWallet = await recoverWallet(mnemonic, highestBalanceAddr.index);
                
                // Verify address matches
                if (senderWallet.address.toLowerCase() !== highestBalanceAddr.address.toLowerCase()) {
                    console.error(`Address mismatch! Expected: ${highestBalanceAddr.address}, Got: ${senderWallet.address}`);
                    throw new Error('Address derivation mismatch - security issue detected');
                }
                
                // Get reliable nonce for sender address
                const nonce = await getReliableNonce(freshWeb3, highestBalanceAddr.address);
                console.log(`Using nonce: ${nonce} for address ${highestBalanceAddr.address}`);
                
                // Get reliable gas price
                const gasPrice = await getReliableGasPrice(freshWeb3);
                console.log(`Using gas price: ${freshWeb3.utils.fromWei(gasPrice, 'gwei')} gwei`);
                
                // Standard gas limit for ETH transfer
                const gasLimit = 21000;
                console.log(`Using gas limit: ${gasLimit}`);
                
                // Calculate gas cost
                const gasCostWei = BigInt(gasPrice) * BigInt(gasLimit);
                const gasCostEth = freshWeb3.utils.fromWei(gasCostWei.toString(), 'ether');
                console.log(`Estimated gas cost: ${gasCostEth} ETH`);
                
                // Calculate maximum amount to send (considering gas)
                const maxAmountWei = BigInt(freshWeb3.utils.toWei(highestBalanceAddr.ethBalance, 'ether')) - gasCostWei;
                const requestedAmountWei = BigInt(freshWeb3.utils.toWei(amount, 'ether'));
                
                // Ensure we're not trying to send more than available after gas
                if (requestedAmountWei > maxAmountWei) {
                    console.log(`Requested amount plus gas exceeds available balance`);
                    console.log(`Max sendable amount: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`);
                    
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance after gas fees. Available to send: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`
                    });
                }
                
                // Prepare transaction data
                const txData = {
                    from: highestBalanceAddr.address,
                    to: merchantAddress,
                    value: freshWeb3.utils.toHex(requestedAmountWei.toString()),
                    gas: gasLimit,
                    gasPrice: gasPrice,
                    nonce: nonce
                };
                
                console.log('Transaction data prepared:', JSON.stringify(txData, null, 2));
                
                // Sign transaction
                console.log('Signing transaction...');
                const signedTx = await freshWeb3.eth.accounts.signTransaction(txData, senderWallet.privateKey);
                console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
                
                // Send transaction with retry mechanism
                console.log('Sending transaction with retry...');
                const receipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                console.log('Transaction successfully sent and confirmed!');
                console.log(`Transaction hash: ${receipt.transactionHash}`);
                console.log(`Block number: ${receipt.blockNumber}`);
                console.log(`Gas used: ${receipt.gasUsed}`);
                
                // Record the transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const txLogEntry = {
                    txId: txId,
                    txHash: signedTx.transactionHash,
                    from: highestBalanceAddr.address,
                    to: merchantAddress,
                    amount: amount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    type: 'release'
                };
                
                // Save transaction to log
                saveTxLog(txLogEntry);
                
                // Return success response
                return res.json({
                    success: true,
                    txHash: signedTx.transactionHash,
                    amount: amount,
                    timestamp: new Date().toISOString(),
                    blockNumber: receipt.blockNumber
                });
                
            } catch (txError) {
                console.error('Error sending transaction from highest balance address:', txError);
                console.error('Stack trace:', txError.stack);
                
                // Log the detailed error for debugging
                logBlockchain('TX_ERROR', {
                    address: highestBalanceAddr.address,
                    error: txError.message,
                    stack: txError.stack
                });
                
                return res.status(500).json({
                    success: false,
                    error: `Failed to send transaction: ${txError.message}`
                });
            }
        }
    } catch (error) {
        console.error('Error in release funds endpoint:', error);
        console.error('Stack trace:', error.stack);
        logToFile(`ERROR: Error in release funds endpoint: ${error.message}`);
        console.log('===========================================================');
        
        res.status(500).json({
            success: false,
            error: 'Failed to process release funds request: ' + error.message
        });
    }
});

// Endpoint to record detected payments from client side
app.post('/api/record-payment', async (req, res) => {
    try {
        const { address, amount, cryptoType } = req.body;
        logger.info('Recording payment', { address, amount, cryptoType });
        
        if (!address || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Address and amount are required'
            });
        }
        
        // Format amount to standard decimal format
        const formattedAmount = parseFloat(amount).toFixed(6);
        
        // Get stored keys
        const keys = getStoredKeys();
        
        // Check if the address exists in active addresses
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        }
        
        // Add or update the address with a timestamp
        keys.activeAddresses[address] = {
            amount: formattedAmount,
            cryptoType: cryptoType || 'ETH',
            timestamp: new Date().toISOString(),
            status: 'confirmed'
        };
        
        // Save updated keys
        fs.writeFileSync('./Json/keys.json', JSON.stringify(keys, null, 2));
        
        // Log the transaction
        logBlockchain('PAYMENT_RECORDED', {
            address,
            amount: formattedAmount,
            cryptoType: cryptoType || 'ETH',
            timestamp: new Date().toISOString()
        });
        
        // Record in merchant transactions log
        const txLog = {
            address: address,
            amount: formattedAmount,
            timestamp: new Date().toISOString(),
            status: true,
            type: 'payment',
            cryptoType: cryptoType || 'ETH'
        };
        
        const txFile = 'merchant_transactions.json';
        try {
            let txLogs = [];
            
            // Read existing logs if file exists
            if (fs.existsSync(txFile)) {
                const fileContent = fs.readFileSync(txFile, 'utf8');
                try {
                txLogs = JSON.parse(fileContent || '[]');
                
                // Ensure we have an array
                if (!Array.isArray(txLogs)) {
                    console.warn('Transaction log was corrupted, resetting to empty array');
                        txLogs = [];
                    }
                } catch (parseError) {
                    console.error('Error parsing transaction log:', parseError);
                    txLogs = [];
                }
            }
            
            // Add new transaction
            txLogs.push(txLog);
            
            // Write back to file
            fs.writeFileSync(txFile, JSON.stringify(txLogs, null, 2));
        } catch (fileError) {
            console.error('Error saving transaction log:', fileError);
            // Try to recover by creating fresh file with just this transaction
            try {
                fs.writeFileSync(txFile, JSON.stringify([txLog], null, 2));
            } catch (recoveryError) {
                console.error('Failed to recover transaction log:', recoveryError);
            }
        }
        
        res.json({
            success: true,
            message: 'Payment recorded successfully'
        });
    } catch (error) {
        console.error('Error recording payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record payment'
        });
    }
});

// Configuration endpoint for frontend
app.get('/api/config', (req, res) => {
    res.json({
        merchantAddress: MERCHANT_ADDRESS,
        networkName: 'Sepolia Testnet',
        chainId: 11155111
    });
});

// Handle errors
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err });
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
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
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`Blockchain Payment Gateway Server v1.0`);
    console.log('='.repeat(50));
    console.log(`Server running on port ${PORT}`);
    console.log(`Access e-commerce store at http://localhost:${PORT}`);
    console.log(`Access merchant dashboard at http://localhost:${PORT}/merchant`);
    console.log('='.repeat(50));
    
    logToFile('='.repeat(50));
    logToFile(`Blockchain Payment Gateway Server v1.0`);
    logToFile('='.repeat(50));
    logToFile(`Server running on port ${PORT}`);
    logToFile(`Access e-commerce store at http://localhost:${PORT}`);
    logToFile(`Access merchant dashboard at http://localhost:${PORT}/merchant`);
    logToFile('='.repeat(50));
});

// Get release transaction status
app.get('/api/release-status/:txHash', async (req, res) => {
    const { txHash } = req.params;
    
    if (!txHash || typeof txHash !== 'string' || txHash.length !== 66) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid transaction hash format' 
        });
    }
    
    try {
        // Get fresh provider for reliable RPC connection
        const freshWeb3 = await getFreshProvider();
        
        // Log the request
        logBlockchain('CHECK_TX_STATUS', { txHash });
        
        // First check if transaction exists in our transaction log
        const txLogPath = 'merchant_transactions.json';
        let txLog = [];
        let foundTx = null;
        
        try {
            if (fs.existsSync(txLogPath)) {
                const fileContent = fs.readFileSync(txLogPath, 'utf8');
                try {
                    txLog = JSON.parse(fileContent || '[]');
                    
                    // Find transaction in our logs (if it exists)
                    foundTx = txLog.find(tx => tx.txHash === txHash);
                    
                    if (foundTx) {
                        console.log(`Found transaction in local log:`, JSON.stringify(foundTx, null, 2));
                    } else {
                        console.log(`Transaction ${txHash} not found in local log`);
                    }
                } catch (parseError) {
                    console.error('Error parsing transaction log:', parseError);
                    // Continue anyway to check the blockchain
                }
            } else {
                console.log('Transaction log file does not exist');
            }
        } catch (readError) {
            console.error('Error reading transaction log:', readError);
            // Continue anyway to check the blockchain
        }
        
        // Get the transaction receipt from the blockchain
        console.log(`Checking blockchain for transaction receipt: ${txHash}`);
        let receipt = null;
        let currentBlock = null;
        
        try {
            receipt = await freshWeb3.eth.getTransactionReceipt(txHash);
            currentBlock = await freshWeb3.eth.getBlockNumber();
            
            console.log(`Current block: ${currentBlock}, Receipt:`, receipt ? 
                `Found in block ${receipt.blockNumber}` : 'Not found');
        } catch (blockchainError) {
            console.error('Error checking blockchain:', blockchainError);
            // Continue with what we have from our logs
        }
        
        // If we have a receipt, transaction was submitted to the network
        if (receipt) {
            const confirmations = (currentBlock && receipt.blockNumber) ? 
                (currentBlock - receipt.blockNumber) + 1 : 0;
            const success = receipt.status;
            
            // Update our transaction log if the transaction exists in our records
            if (foundTx) {
                console.log(`Updating transaction log for ${txHash}`);
                updateTransactionLog(txHash, { 
                    status: success, 
                    confirmations,
                    receiptChecked: true,
                    lastChecked: new Date().toISOString()
                });
            } else if (receipt.from && receipt.to && success !== undefined) {
                // We don't have this transaction in our logs, but we have a receipt
                // Let's add it to our transaction log for future reference
                console.log(`Adding transaction to log: ${txHash}`);
                
                // Get transaction details to get value information
                let txDetails = null;
                try {
                    txDetails = await freshWeb3.eth.getTransaction(txHash);
                } catch (txError) {
                    console.error(`Error getting transaction details:`, txError.message);
                }
                
                const isMerchantAddressRecipient = receipt.to?.toLowerCase() === 
                    (process.env.MERCHANT_ADDRESS || '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b').toLowerCase();
                
                const transactionType = isMerchantAddressRecipient ? 'release' : 'unknown';
                
                const txLogEntry = {
                    txHash,
                    from: receipt.from,
                    to: receipt.to,
                    amount: txDetails ? freshWeb3.utils.fromWei(txDetails.value, 'ether') : '0',
                    timestamp: new Date().toISOString(),
                    status: success,
                    confirmations,
                    blockNumber: receipt.blockNumber,
                    type: transactionType,
                    gasUsed: receipt.gasUsed,
                    addedFromStatusCheck: true
                };
                
                saveTxLog(txLogEntry);
            }
            
            return res.json({
                success: true,
                txHash,
                status: success,
                confirmations,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                from: receipt.from,
                to: receipt.to
            });
        } 
        
        // If we don't have a receipt but have the transaction in our logs
        if (foundTx) {
            return res.json({
                success: true,
                txHash,
                status: foundTx.status !== undefined ? foundTx.status : null,
                confirmations: foundTx.confirmations || 0,
                pending: true,
                from: foundTx.from,
                to: foundTx.to,
                amount: foundTx.amount,
                timestamp: foundTx.timestamp
            });
        }
        
        // If nothing found - send a proper JSON response instead of 404
        return res.json({
            success: false,
            txHash,
            found: false,
            status: null,
            message: 'Transaction not found in our system or on the blockchain',
            pending: false
        });
    } catch (error) {
        console.error(`Error checking transaction status for ${txHash}:`, error);
        logBlockchain('TX_STATUS_ERROR', { txHash, error: error.message });
        
        return res.status(500).json({
            success: false,
            error: 'Failed to check transaction status',
            details: error.message
        });
    }
});

// Helper function to update transaction log entries with robust error handling
function updateTransactionLog(txHash, updates) {
    try {
        console.log(`Updating transaction log for hash: ${txHash}`);
        console.log(`Updates:`, JSON.stringify(updates, null, 2));
        
        const txFile = 'merchant_transactions.json';
        
        // Check if file exists
        if (!fs.existsSync(txFile)) {
            console.warn('Transaction file does not exist, cannot update');
            return false;
        }
        
        // Read and parse transaction log with error handling
        let txLogs = [];
        let fileContent;
        
        try {
            fileContent = fs.readFileSync(txFile, 'utf8');
        } catch (readError) {
            console.error('Error reading transaction log file:', readError);
            return false;
        }
        
        try {
            txLogs = JSON.parse(fileContent || '[]');
            
            // Ensure we have an array
            if (!Array.isArray(txLogs)) {
                console.warn('Transaction log was corrupted (not an array), creating backup');
                
                // Create a backup of the corrupted file
                const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                fs.copyFileSync(txFile, backupFile);
                
                // Create a new empty log
                fs.writeFileSync(txFile, JSON.stringify([]));
                
                console.warn('Reset transaction log to empty array');
                return false;
            }
        } catch (parseError) {
            console.error('Error parsing transaction log for update:', parseError);
            
            // Create a backup of the corrupted file
            const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
            fs.copyFileSync(txFile, backupFile);
            
            // Create a new empty log
            fs.writeFileSync(txFile, JSON.stringify([]));
            
            return false;
        }
        
        // Find and update the transaction
        let updated = false;
        const updatedLogs = txLogs.map(tx => {
            if (tx.txHash === txHash) {
                updated = true;
                return {
                    ...tx,
                    ...updates,
                    lastUpdated: new Date().toISOString()
                };
            }
            return tx;
        });
        
        if (updated) {
            // Write back to file using the same safe approach as saveTxLog
            const tempFile = `${txFile}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(updatedLogs, null, 2));
            fs.renameSync(tempFile, txFile);
            console.log(`Updated transaction log for ${txHash}`);
            return true;
        } else {
            console.log(`Transaction ${txHash} not found in log, cannot update`);
            return false;
        }
    } catch (error) {
        console.error('Error updating transaction log:', error);
        return false;
    }
}

// Helper function to save a new transaction log entry
function saveTxLog(txLogEntry) {
    try {
        console.log(`Saving transaction log entry:`, JSON.stringify(txLogEntry, null, 2));
        
        const txFile = 'merchant_transactions.json';
        let txLogs = [];
        
        // Read existing logs if file exists
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = fs.readFileSync(txFile, 'utf8');
                txLogs = JSON.parse(fileContent || '[]');
                
                // Ensure we have an array
                if (!Array.isArray(txLogs)) {
                    console.warn('Transaction log was corrupted (not an array), creating backup');
                    
                    // Create a backup of the corrupted file
                    const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                    fs.copyFileSync(txFile, backupFile);
                    
                    // Reset to empty array
                    txLogs = [];
                }
            } catch (parseError) {
                console.error('Error parsing transaction log:', parseError);
                
                // Create a backup of the potentially corrupted file
                if (fs.existsSync(txFile)) {
                    const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                    fs.copyFileSync(txFile, backupFile);
                    console.log(`Created backup of corrupted transaction log: ${backupFile}`);
                }
                
                // Reset to empty array
                txLogs = [];
            }
        }
        
        // Add new transaction to the beginning for easier access
        txLogs.unshift(txLogEntry);
        
        // Use a safe write approach with a temp file
        const tempFile = `${txFile}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(txLogs, null, 2));
        fs.renameSync(tempFile, txFile);
        
        console.log(`Transaction log saved successfully with ${txLogs.length} entries`);
        return true;
    } catch (error) {
        console.error('Error saving transaction log:', error);
        
        // Try to save just this transaction as a fallback
        try {
            const fallbackFile = `tx_${Date.now()}.json`;
            fs.writeFileSync(fallbackFile, JSON.stringify([txLogEntry], null, 2));
            console.log(`Saved transaction to fallback file: ${fallbackFile}`);
        } catch (fallbackError) {
            console.error('Failed to save transaction to fallback file:', fallbackError);
        }
        
        return false;
    }
}

// Fix the issue with sending transactions from an address with the wrong nonce
// This function gets a reliable nonce for a specific address
async function getReliableNonce(web3, address) {
    console.log(`Getting reliable nonce for address: ${address}`);
    
    try {
        // First try getting the transaction count with 'pending' state
        // This includes transactions in the mempool that haven't been mined yet
        const pendingNonce = await web3.eth.getTransactionCount(address, 'pending');
        console.log(`Pending nonce for ${address}: ${pendingNonce}`);
        
        // Also get the latest confirmed nonce
        const confirmedNonce = await web3.eth.getTransactionCount(address, 'latest');
        console.log(`Confirmed nonce for ${address}: ${confirmedNonce}`);
        
        // Use the higher nonce to be safe
        const nonce = Math.max(pendingNonce, confirmedNonce);
        console.log(`Using nonce: ${nonce} for address ${address}`);
        return nonce;
    } catch (error) {
        console.error(`Error getting nonce for ${address}:`, error.message);
        
        // Try with a fresh provider
        try {
            const freshWeb3 = await getFreshProvider();
            console.log('Using fresh provider to get nonce');
            const nonce = await freshWeb3.eth.getTransactionCount(address, 'pending');
            console.log(`Got nonce ${nonce} from fresh provider`);
            return nonce;
        } catch (fallbackError) {
            console.error('Fallback provider also failed to get nonce:', fallbackError.message);
            throw error; // Re-throw the original error
        }
    }
}

// Helper function to get balance with retry
async function getBalanceWithRetry(web3, address, retryCount = 3) {
    console.log(`Checking balance for ${address}...`);
    while (retryCount > 0) {
        try {
            const balance = await web3.eth.getBalance(address);
            const formattedBalance = web3.utils.fromWei(balance, 'ether');
            console.log(`Balance for ${address}: ${formattedBalance} ETH`);
            return formattedBalance;
        } catch (error) {
            console.error(`Error checking balance for ${address} (${retryCount} retries left):`, error);
            retryCount--;
            if (retryCount === 0) throw error;
            console.log(`Waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    throw new Error(`Failed to get balance for ${address} after multiple attempts`);
}

// Function to get a reliable gas price to ensure transactions go through
async function getReliableGasPrice(web3) {
    try {
        console.log("Getting reliable gas price...");
        // Try to get the gas price from the network
        const standardGasPrice = await web3.eth.getGasPrice();
        
        // For Sepolia testnet, ensure a minimum gas price of 1 gwei
        // This is critical as miners may ignore transactions with very low gas prices
        const minGasPrice = web3.utils.toWei('1', 'gwei');
        
        // Use the higher of the current gas price or our minimum
        let gasPrice = BigInt(standardGasPrice) > BigInt(minGasPrice) ? 
            standardGasPrice : minGasPrice;
        
        // Increase by 20% to prioritize our transaction
        const increasedGasPrice = BigInt(gasPrice) * BigInt(120) / BigInt(100);
        
        console.log(`Standard gas price: ${web3.utils.fromWei(standardGasPrice, 'gwei')} gwei`);
        console.log(`Using gas price: ${web3.utils.fromWei(increasedGasPrice.toString(), 'gwei')} gwei`);
        
        return increasedGasPrice.toString();
    } catch (error) {
        console.error("Error getting standard gas price:", error);
        
        try {
            // Try with a fresh provider if the first attempt fails
            const freshWeb3 = await getFreshProvider();
            const backupGasPrice = await freshWeb3.eth.getGasPrice();
            
            // Apply the same minimum gas price logic
            const minGasPrice = freshWeb3.utils.toWei('1', 'gwei');
            let gasPrice = BigInt(backupGasPrice) > BigInt(minGasPrice) ? 
                backupGasPrice : minGasPrice;
                
            // Increase by 20%
            const increasedGasPrice = BigInt(gasPrice) * BigInt(120) / BigInt(100);
            
            console.log(`Backup gas price: ${freshWeb3.utils.fromWei(increasedGasPrice.toString(), 'gwei')} gwei`);
            return increasedGasPrice.toString();
        } catch (backupError) {
            console.error("Error getting backup gas price:", backupError);
            
            // Default to 1.5 gwei if all else fails (much higher than previous 30 gwei)
            // This is a reasonable default for Sepolia testnet that should get mined
            const fallbackGasPrice = web3.utils.toWei('1.5', 'gwei');
            console.log(`Using fallback gas price: 1.5 gwei`);
            return fallbackGasPrice;
        }
    }
}

// Function to check if we have pending transactions for the same address
async function checkPendingTransactions(fromAddress, toAddress) {
    console.log(`Checking for pending transactions from ${fromAddress} to ${toAddress}`);
    
    try {
        const txFile = 'merchant_transactions.json';
        if (!fs.existsSync(txFile)) {
            console.log('No transaction file exists yet');
            return null;
        }
        
        // Read transaction log
        const fileContent = fs.readFileSync(txFile, 'utf8');
        if (!fileContent || !fileContent.trim()) {
            console.log('Transaction file is empty');
            return null;
        }
        
        try {
            const txLogs = JSON.parse(fileContent);
            
            // Filter for pending transactions with the same from/to addresses
            // A transaction is pending if:
            // 1. It has same from/to addresses
            // 2. It's not marked as failed (status !== false)
            // 3. Either has no confirmations or confirmations is 0 
            // 4. Has no blockNumber (not yet mined)
            const pendingTx = txLogs.find(tx => 
                tx.from && tx.from.toLowerCase() === fromAddress.toLowerCase() &&
                tx.to && tx.to.toLowerCase() === toAddress.toLowerCase() &&
                tx.status !== false &&  // Not a failed transaction
                (tx.confirmations === undefined || tx.confirmations === 0 || tx.confirmations === null) && // No confirmations yet
                !tx.blockNumber // Not yet mined
            );
            
            if (pendingTx) {
                console.log(`Found pending transaction:`, JSON.stringify(pendingTx, null, 2));
                return pendingTx;
            }
            
            console.log('No pending transactions found');
            return null;
        } catch (parseError) {
            console.error('Error parsing transaction log:', parseError);
            return null;
        }
    } catch (error) {
        console.error('Error checking pending transactions:', error);
        return null;
    }
}
app.post('/api/release-all-funds', async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /api/release-all-funds`);
    console.log('==================== FULL BALANCE RELEASE REQUEST ====================');
    
    try {
        // Verify merchant address is configured
        const merchantAddress = process.env.MERCHANT_ADDRESS || DEFAULT_MERCHANT_ADDRESS;
        console.log(`Merchant address verified: ${merchantAddress}`);
        console.log(`Request to release ALL available funds`);
    
        logBlockchain('ALL_FUNDS_RELEASE_REQUESTED', { merchantAddress });
    
        // Initialize web3 provider for transaction
        console.log('Initializing fresh Web3 provider...');
        const freshWeb3 = await getFreshProvider();
        console.log('Web3 provider initialized successfully');
        
        // Get wallet keys from storage
        console.log('Retrieving wallet keys...');
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        
        // Decrypt the mnemonic
        console.log('Decrypting mnemonic...');
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        
        // Recover the root wallet from mnemonic
        console.log('Recovering root wallet...');
        const rootAddress = await recoverWallet(mnemonic, 0);
        const rootAddr = rootAddress.address;
        console.log(`Root address: ${rootAddr}`);
        
        // Get root address balance
        console.log('Checking root address balance...');
        const rootBalance = await getBalanceWithRetry(freshWeb3, rootAddr);
        console.log(`Root address balance: ${rootBalance} ETH`);
        
        // Check if there's any balance to send
        if (parseFloat(rootBalance) <= 0) {
            console.error('No balance available to transfer');
            return res.status(400).json({
                success: false,
                error: 'No funds available to release'
            });
        }
        
        // Check for existing pending transactions from root address to merchant
        const pendingTx = await checkPendingTransactions(rootAddr, merchantAddress);
        
        // If we found a pending transaction, check if it's truly still pending
        if (pendingTx && pendingTx.txHash) {
            console.log(`Found existing pending transaction ${pendingTx.txHash}, checking status...`);
            
            // Check if transaction is actually still pending by checking for a receipt
            const receipt = await checkTransactionReceipt(freshWeb3, pendingTx.txHash);
            if (receipt) {
                console.log(`Found receipt for pending transaction: ${JSON.stringify(receipt)}`);
                
                // Update transaction status in our log based on receipt info
                updateTransactionLog(pendingTx.txHash, {
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    confirmations: 1, // At least 1 confirmation since it's mined
                });
                
                if (receipt.status === true) {
                    // Transaction was successful, so no need to send a new one
                    console.log(`Found receipt for pending transaction, not sending a new one`);
                    return res.json({
                        success: true,
                        message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                        txHash: pendingTx.txHash,
                        amount: pendingTx.amount,
                        timestamp: pendingTx.timestamp,
                        existingTransaction: true
                    });
                }
            } else {
                // No receipt found, transaction is still pending
                console.log(`No receipt found, existing transaction is still pending`);
                return res.json({
                    success: true,
                    message: `Found existing transaction in progress: ${pendingTx.txHash}`,
                    txHash: pendingTx.txHash,
                    amount: pendingTx.amount,
                    timestamp: pendingTx.timestamp,
                    existingTransaction: true
                });
            }
        }
        
        // Proceed with sending a full balance transaction from root address
        console.log('Preparing transaction to send entire wallet balance...');
        
        try {
            // Get reliable nonce for root address
            const nonce = await getReliableNonce(freshWeb3, rootAddr);
            console.log(`Using nonce: ${nonce} for root address`);
            
            // Get reliable gas price
            const gasPrice = await getReliableGasPrice(freshWeb3);
            console.log(`Using gas price: ${freshWeb3.utils.fromWei(gasPrice, 'gwei')} gwei`);
            
            // Standard gas limit for ETH transfer
            const gasLimit = 21000;
            console.log(`Using gas limit: ${gasLimit}`);
            
            // Calculate gas cost
            const gasCostWei = BigInt(gasPrice) * BigInt(gasLimit);
            const gasCostEth = freshWeb3.utils.fromWei(gasCostWei.toString(), 'ether');
            console.log(`Estimated gas cost: ${gasCostEth} ETH`);
            
            // Get total balance in wei
            const balanceWei = BigInt(freshWeb3.utils.toWei(rootBalance, 'ether'));
            
            // Calculate amount to send (total balance minus gas cost)
            if (balanceWei <= gasCostWei) {
                return res.status(400).json({
                    success: false,
                    error: `Insufficient balance to cover gas fees. Need at least ${gasCostEth} ETH for gas.`
                });
            }
            
            const amountToSendWei = balanceWei - gasCostWei;
            const amountToSendEth = freshWeb3.utils.fromWei(amountToSendWei.toString(), 'ether');
            console.log(`Sending amount (after gas): ${amountToSendEth} ETH`);
            
            // Prepare transaction data
            const txData = {
                from: rootAddr,
                to: merchantAddress,
                value: freshWeb3.utils.toHex(amountToSendWei.toString()),
                gas: gasLimit,
                gasPrice: gasPrice,
                nonce: nonce
            };
            
            console.log('Transaction data prepared:', JSON.stringify(txData, null, 2));
            
            // Sign transaction
            console.log('Signing transaction...');
            const signedTx = await freshWeb3.eth.accounts.signTransaction(txData, rootAddress.privateKey);
            console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
            
            // Send transaction with retry mechanism
            console.log('Sending transaction with retry...');
            const receipt = await sendTransactionWithRetry(freshWeb3, signedTx);
            console.log('Transaction successfully sent and confirmed!');
            console.log(`Transaction hash: ${receipt.transactionHash}`);
            console.log(`Block number: ${receipt.blockNumber}`);
            console.log(`Gas used: ${receipt.gasUsed}`);
            
            // Record the transaction
            const txLog = {
                txHash: receipt.transactionHash,
                from: rootAddr,
                to: merchantAddress,
                amount: amountToSendEth,
                type: 'release',
                timestamp: new Date().toISOString(),
                status: receipt.status,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                fullBalance: true, // Mark this as a full balance transfer
                adjustedForGas: true
            };
            
            saveTxLog(txLog);
            
            // Return success response
            return res.json({
                success: true,
                txHash: receipt.transactionHash,
                amount: amountToSendEth,
                timestamp: txLog.timestamp
            });
            
        } catch (txError) {
            console.error('Error preparing or sending transaction:', txError);
            logBlockchain('TX_ERROR', { error: txError.message });
            
            return res.status(500).json({
                success: false,
                error: `Transaction error: ${txError.message}`,
            });
        }
    } catch (error) {
        console.error('Error processing full balance release request:', error);
        logBlockchain('FULL_RELEASE_ERROR', { error: error.message });
        
        return res.status(500).json({
            success: false,
            error: `Processing error: ${error.message}`
        });
    }
});

