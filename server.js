const express = require('express');
const cors = require('cors');
const Web3 = require('web3');
const fs = require('fs');
const { recoverWallet, getStoredKeys } = require('./recover.js');
const { decrypt } = require('./encryptionUtils');
const winston = require('winston');
const ethers = require('ethers');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Enhanced logging for blockchain operations
function logBlockchain(operation, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        operation,
        details
    };
    
    // Format for readable console output
    const formattedLog = `
=== BLOCKCHAIN OPERATION [${timestamp}] ===
>> Operation: ${operation}
>> Details: ${JSON.stringify(details, null, 2)}
=======================================`;
    
    console.log(formattedLog);
    
    // Write to specialized blockchain log file
    try {
        fs.appendFileSync('blockchain_tx.log', JSON.stringify(logEntry) + '\n');
    } catch (error) {
        console.error('Failed to write to blockchain log file:', error);
    }
}

// Simple file logging without overriding console methods
function logToFile(message) {
    try {
        fs.appendFileSync('payment_gateway.log', message + '\n');
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
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
const BACKUP_RPC = 'https://rpc.sepolia.org'; // Public RPC as backup

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

// Get a fresh provider when needed
async function getFreshProvider() {
    const providers = [
        BACKUP_RPC, // Try backup first since Infura might have issues
        INFURA_URL.replace('wss://', 'https://').replace('/ws/', '/'), // Ensure HTTPS
        'https://eth-sepolia.public.blastapi.io',
        'https://sepolia.gateway.tenderly.co'
    ];
    
    for (const providerUrl of providers) {
        try {
            const tempProvider = new Web3.providers.HttpProvider(providerUrl, {
                timeout: 10000,
                headers: [
                    {
                        name: 'User-Agent',
                        value: 'Mozilla/5.0 BlockchainPaymentGateway'
                    }
                ]
            });
            
            const tempWeb3 = new Web3(tempProvider);
            
            // Test if it works
            const isConnected = await tempWeb3.eth.net.isListening();
            if (isConnected) {
                console.log(`Got fresh Web3 provider from ${providerUrl.split('/')[2] || providerUrl}`);
                return tempWeb3;
            }
        } catch (error) {
            console.error(`Provider ${providerUrl.split('/')[2] || providerUrl} failed:`, error.message);
        }
    }
    
    console.error('All providers failed in getFreshProvider');
    return web3; // Return original as last resort
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
        console.log('Retrieving wallet balance...');
        let keys;
        try {
            keys = getStoredKeys();
            if (!keys || !keys.mnemonic) {
                throw new Error('No wallet keys found. Please generate new keys.');
            }

            let mnemonic;
            try {
                mnemonic = decrypt(keys.mnemonic);
                
                // Additional validation
                if (!bip39.validateMnemonic(mnemonic)) {
                    throw new Error('Decrypted mnemonic is invalid');
                }
        } catch (error) {
            if (error.message.includes('DECRYPTION_FAILED')) {
                // Create recovery file
                const recoveryFile = './key_recovery_instructions.txt';
                const instructions = `
CRITICAL ENCRYPTION ERROR
=========================

Error: ${error.message}

To recover:

1. Verify your ENCRYPTION_KEY environment variable matches what was used originally
   Current key: ${process.env.ENCRYPTION_KEY ? 'set' : 'not set'}

2. If you've lost the original key, you'll need to:
   a) Delete the existing keys file: rm Json/keys.json
   b) Restart the server to generate new keys

3. If you need to recover funds from the old wallet:
   - The original encrypted data is in Json/keys.json
   - You'll need the original encryption key to decrypt it
                `;
                
                fs.writeFileSync(recoveryFile, instructions);
                console.error(`\n\n!!! CRITICAL ERROR !!!\n${instructions}\nDetails written to ${recoveryFile}\n`);
            }
            throw error;
        }
        
        const { address } = await recoverWallet(mnemonic);
        
        logBlockchain('WALLET_RECOVERY', { address });
        
        // Retry balance check with error handling
        let balance;
        try {
            balance = await web3.eth.getBalance(address);
        } catch (balanceError) {
            console.error('Error in primary balance check:', balanceError);
            // Retry with fallback provider
            const fallbackWeb3 = new Web3(BACKUP_RPC);
            balance = await fallbackWeb3.eth.getBalance(address);
        }
        
        const balanceInEth = web3.utils.fromWei(balance, 'ether');
        
        logBlockchain('BALANCE_CHECK', {
            address,
            balanceWei: balance,
            balanceEth: balanceInEth
        });
        
        const message = `Wallet balance requested for ${address}: ${balanceInEth} ETH`;
        console.log(message);
        logToFile(message);
        
        res.json({
            success: true,
            balance: balanceInEth,
            address: address
        });
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        logToFile(`ERROR: Error getting wallet balance: ${error.message}`);
        let errorMessage = 'Failed to get wallet balance';
        if (error.message.includes('ENOENT')) {
            errorMessage = 'Wallet keys not found. Please generate new keys.';
        } else if (error.message.includes('bip39')) {
            errorMessage = 'Wallet recovery error. Please check your encryption key.';
        }

        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Update the Alchemy endpoint and add backup providers
const ALCHEMY_API_KEY = 'GyCxQ3-J4YtZ_RLRqkMJJB0Zk5_7H-8P';
const PROVIDERS = {
    ALCHEMY: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    INFURA: 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
    BACKUP: 'https://rpc.sepolia.org'
};

// Add at the top with other global variables
const paymentAddressPrivateKeys = new Map();

// Update the generate-payment-address endpoint
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

        // Try multiple providers in sequence
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

        // Generate wallet
        const wallet = ethers.Wallet.createRandom();
        const address = wallet.address;
        const privateKey = wallet.privateKey;
        
        // Store the private key
        paymentAddressPrivateKeys.set(address, privateKey);
        
        // Set a timeout to remove the private key after 30 minutes
        setTimeout(() => {
            paymentAddressPrivateKeys.delete(address);
            logger.info('Removed expired payment address', { address });
        }, 30 * 60 * 1000);

        logger.info('Generated wallet address', { address });

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
        res.status(500).json({
            success: false,
            error: 'Failed to generate payment address: ' + error.message
        });
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

// Add the transferFunds function
async function transferFunds(fromAddress, toAddress, amount, privateKey) {
    try {
        const provider = new ethers.providers.JsonRpcProvider('https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9');
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // Get the current gas price
        const gasPrice = await provider.getGasPrice();
        
        // Prepare the transaction
        const tx = {
            to: toAddress,
            value: amount,
            gasPrice: gasPrice,
            gasLimit: ethers.utils.hexlify(100000), // Set appropriate gas limit
            nonce: await provider.getTransactionCount(fromAddress, 'latest')
        };

        // Send the transaction
        const transaction = await wallet.sendTransaction(tx);
        console.log(`Transaction hash: ${transaction.hash}`);
        
        // Wait for transaction confirmation
        const receipt = await transaction.wait();
        console.log('Transaction confirmed:', receipt);
        
        return {
            success: true,
            transactionHash: transaction.hash
        };
    } catch (error) {
        console.error('Error in transferFunds:', error);
        throw new Error(`Failed to transfer funds: ${error.message}`);
    }
}

// Update the release funds endpoint
app.post('/api/release-funds', async (req, res) => {
    try {
        const { fromAddress, toAddress } = req.body;
        let { amount } = req.body;
        
        if (!fromAddress || !toAddress) {
            throw new Error('Missing required parameters: fromAddress and toAddress');
        }

        // Get the private key for the payment address
        const privateKey = paymentAddressPrivateKeys.get(fromAddress);
        if (!privateKey) {
            throw new Error('Payment address expired or not found');
        }

        try {
            // If amount is not provided, try to transfer the entire balance minus gas
            if (!amount) {
                const provider = new ethers.providers.JsonRpcProvider(INFURA_URL);
                const balance = await provider.getBalance(fromAddress);
                const gasPrice = await provider.getGasPrice();
                const gasLimit = ethers.BigNumber.from('21000');
                const gasCost = gasPrice.mul(gasLimit);
                amount = balance.sub(gasCost);

                if (amount.lte(0)) {
                    throw new Error('Insufficient balance to cover gas costs');
                }
            }

            // Transfer the funds
            const result = await transferFunds(fromAddress, toAddress, amount, privateKey);
            
            // Remove the private key after successful transfer
            paymentAddressPrivateKeys.delete(fromAddress);
            
            // Log successful operation
            console.log('=== BLOCKCHAIN OPERATION [' + new Date().toISOString() + '] ===');
            console.log('>> Operation: FUNDS_RELEASE_SUCCESS');
            console.log('>> Details:', {
                fromAddress,
                toAddress,
                transactionHash: result.transactionHash
            });
            console.log('=======================================');

            res.json({
                success: true,
                message: 'Funds released successfully',
                transactionHash: result.transactionHash
            });

        } catch (transferError) {
            throw new Error(`Transfer failed: ${transferError.message}`);
        }

    } catch (error) {
        console.error('Error releasing funds:', error);
        
        // Log failed operation
        console.log('=== BLOCKCHAIN OPERATION [' + new Date().toISOString() + '] ===');
        console.log('>> Operation: FUNDS_RELEASE_FAILED');
        console.log('>> Details:', {
            fromAddress: req.body.fromAddress,
            toAddress: req.body.toAddress,
            error: error.message
        });
        console.log('=======================================');

        res.status(500).json({
            success: false,
            error: 'Failed to release funds: ' + error.message
        });
    }
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
