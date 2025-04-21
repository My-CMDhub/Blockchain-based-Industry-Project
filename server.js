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

// Secure file operation functions to prevent path traversal attacks
function secureWriteFile(filePath, data) {
    // Normalize the path to prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    const absolutePath = path.resolve(normalizedPath);
    
    // Check if the path is within the allowed directories
    const baseDir = path.resolve('.');
    if (!absolutePath.startsWith(baseDir)) {
        throw new Error(`Security error: Attempted to write to file outside of application directory: ${filePath}`);
    }
    
    // Write the file
    fs.writeFileSync(absolutePath, data);
    return true;
}

function secureReadFile(filePath) {
    // Normalize the path to prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    const absolutePath = path.resolve(normalizedPath);
    
    // Check if the path is within the allowed directories
    const baseDir = path.resolve('.');
    if (!absolutePath.startsWith(baseDir)) {
        throw new Error(`Security error: Attempted to read file outside of application directory: ${filePath}`);
    }
    
    // Read the file
    return fs.readFileSync(absolutePath, 'utf8');
}

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

// #############################################################################
// ## Define /api/release-all-funds EARLY to avoid potential middleware issues ##
// #############################################################################
app.post('/api/release-all-funds', async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /api/release-all-funds`);
    
    try {
        // Get merchant address
        const merchantAddress = process.env.MERCHANT_ADDRESS || DEFAULT_MERCHANT_ADDRESS;
        
        // Normalize and validate merchant address
        const normalizedMerchantAddress = normalizeAddress(merchantAddress);
        if (!normalizedMerchantAddress) {
            console.error(`Invalid merchant address format: ${merchantAddress}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid merchant address format. Please check your .env configuration.'
            });
        }
        
        console.log('====================', 'FULL BALANCE RELEASE REQUEST', '====================');
        console.log(`Merchant address verified: ${normalizedMerchantAddress}`);
        
        logBlockchain('FULL_FUNDS_RELEASE_REQUESTED', { merchantAddress: normalizedMerchantAddress });
        
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
        
        // Scan for additional addresses that may not be in activeAddresses
        // This helps when the system has generated addresses but not properly saved them
        console.log('Scanning for additional addresses...');
        const addressIndexMap = await scanForAddressIndices(mnemonic, 50); // Scan first 50 indices
        console.log(`Found ${Object.keys(addressIndexMap).length} addresses in scan`);
        
        // Add any addresses found with positive balances to our list
        for (const [addr, index] of Object.entries(addressIndexMap)) {
            // Skip addresses we already checked
            if (addr.toLowerCase() === rootAddr.toLowerCase() || 
                addressBalances.some(item => item.address.toLowerCase() === addr.toLowerCase())) {
                continue;
            }
            
            // Check balance for this address
            console.log(`Checking balance for additional address ${addr}...`);
            try {
                const balance = await getBalanceWithRetry(freshWeb3, addr);
                console.log(`Additional address ${addr} balance: ${balance} ETH`);
                
                // Add to address balances if it has funds
                if (parseFloat(balance) > 0) {
                    addressBalances.push({
                        address: addr,
                        balance: parseFloat(balance),
                        ethBalance: balance,
                        index: index
                    });
                    
                    // Also add to activeAddresses for future use
                    if (!activeAddresses[addr]) {
                        activeAddresses[addr] = { index };
                        console.log(`Added address ${addr} with index ${index} to active addresses`);
                    }
                }
            } catch (error) {
                console.error(`Error checking balance for ${addr}:`, error.message);
            }
        }
        
        // Calculate total balance
        const totalBalanceEth = addressBalances.reduce((sum, addr) => sum + addr.balance, 0) + parseFloat(rootBalance);
        console.log(`Total available balance across all addresses: ${totalBalanceEth} ETH`);
        
        if (totalBalanceEth <= 0) {
            return res.status(400).json({
                success: false,
                error: 'No funds available to transfer'
            });
        }
        
        // First try to use root address if it has sufficient balance
        if (parseFloat(rootBalance) > 0) {
            // Root address has funds, proceed with transaction
            console.log(`Root address has balance (${rootBalance} ETH). Using it for the transfer.`);
            
            // Check for existing pending transactions from root address to merchant
            const pendingTx = await checkPendingTransactions(rootAddr, normalizedMerchantAddress);
            
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
                
                // Get balance in Wei
                const balanceWei = freshWeb3.utils.toWei(rootBalance, 'ether');
                
                // Calculate maximum amount to send (balance - gas cost)
                const maxAmountWei = BigInt(balanceWei) - gasCostWei;
                
                // Ensure we have enough to cover gas
                if (maxAmountWei <= BigInt(0)) {
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance to cover gas fees. Available: ${rootBalance} ETH, Gas cost: ${gasCostEth} ETH`
                    });
                }
                
                // Prepare transaction data
                const txData = {
                    from: rootAddr,
                    to: normalizedMerchantAddress,
                    value: maxAmountWei.toString(),
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
                
                // Format amount to ETH for display
                const amountEth = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                
                // Record the transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const txLogEntry = {
                    txId: txId,
                    txHash: signedTx.transactionHash,
                    from: rootAddr,
                    to: normalizedMerchantAddress,
                    amount: amountEth,
                    amountWei: maxAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    type: 'release',
                    fullBalance: true
                };
                
                // Save transaction to log
                saveTxLog(txLogEntry);
                
                // Return success response
                return res.json({
                    success: true,
                    txHash: signedTx.transactionHash,
                    amount: amountEth,
                    senderAddress: rootAddr,
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
                
                // Record the failed transaction attempt in our logs
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const failedTxEntry = {
                    txId: txId,
                    from: rootAddr,
                    to: normalizedMerchantAddress,
                    amount: amountEth,
                    amountWei: maxAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    error: txError.message,
                    type: 'release',
                    attemptedRelease: true,
                    errorDetails: txError.stack ? txError.stack.split('\n')[0] : 'Unknown error'
                };
                
                // Save failed transaction to log for tracking and debugging
                saveTxLog(failedTxEntry);
                
                return res.status(500).json({
                    success: false,
                    error: `Failed to send transaction: ${txError.message}`
                });
            }
        } else {
            console.log(`Root address has no balance. Looking for addresses with funds...`);
            
            // Find addresses with positive balances
            const fundedAddresses = addressBalances.filter(addr => addr.balance > 0);
            console.log(`Found ${fundedAddresses.length} addresses with positive balances`);
            
            if (fundedAddresses.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No wallet addresses have any funds to transfer'
                });
            }
            
            // Find address with highest balance
            const highestBalanceAddr = fundedAddresses.reduce((max, addr) => 
                addr.balance > max.balance ? addr : max, fundedAddresses[0]);
                
            console.log(`Highest balance address: ${highestBalanceAddr.address} with ${highestBalanceAddr.ethBalance} ETH`);
            
            // Check for existing pending transactions
            const pendingTx = await checkPendingTransactions(highestBalanceAddr.address, normalizedMerchantAddress);
            
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
                        confirmations: 1,
                    });
                    
                    if (receipt.status === true) {
                        // Transaction was successful, no need to send a new one
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
                    // Transaction is still pending
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
            
            // Proceed with sending transaction from highest balance address
            try {
                // Ensure we have a valid index before recovering the wallet
                let senderIndex = highestBalanceAddr.index;
                if (senderIndex === undefined || senderIndex === null) {
                    console.warn(`Index for address ${highestBalanceAddr.address} was undefined. Attempting to retrieve from keys.activeAddresses...`);
                    const addrInfo = keys.activeAddresses[highestBalanceAddr.address];
                    if (addrInfo && addrInfo.index !== undefined) {
                        senderIndex = addrInfo.index;
                        console.log(`Successfully retrieved index: ${senderIndex}`);
                    } else {
                        console.warn(`Could not find index in activeAddresses. Checking address index map...`);
                        // Try to find the index in our scanned map
                        const normalizedAddr = highestBalanceAddr.address.toLowerCase();
                        if (addressIndexMap[normalizedAddr]) {
                            senderIndex = addressIndexMap[normalizedAddr];
                            console.log(`Found index ${senderIndex} for address ${highestBalanceAddr.address} in scanned map`);
                        } else {
                            // If we still can't find it, do a deeper scan with more addresses
                            console.log(`Performing deep scan for address ${highestBalanceAddr.address}...`);
                            const deepScanMap = await scanForAddressIndices(mnemonic, 200); // Scan 200 indices
                            if (deepScanMap[normalizedAddr]) {
                                senderIndex = deepScanMap[normalizedAddr];
                                console.log(`Found index ${senderIndex} for address ${highestBalanceAddr.address} in deep scan`);
                            } else {
                                throw new Error(`Could not determine derivation index for address ${highestBalanceAddr.address}`);
                            }
                        }
                    }
                }

                // Recover the private key for this address using the validated index
                console.log(`Recovering wallet for index ${senderIndex}...`);
                const senderWallet = await recoverWallet(mnemonic, senderIndex);
                
                // Verify address matches (case-insensitive compare)
                if (senderWallet.address.toLowerCase() !== highestBalanceAddr.address.toLowerCase()) {
                    console.error(`Address mismatch! Expected: ${highestBalanceAddr.address}, Got: ${senderWallet.address}`);
                    
                    // Try a different approach - search through more indices to find the matching wallet
                    console.log(`Searching for wallet matching address ${highestBalanceAddr.address}...`);
                    const foundWallet = await findWalletForAddress(mnemonic, highestBalanceAddr.address);
                    
                    if (!foundWallet) {
                        throw new Error('Address derivation mismatch - could not find matching wallet');
                    }
                    
                    console.log(`Found wallet with matching address at index ${foundWallet.index}`);
                    senderWallet = foundWallet.wallet;
                    senderIndex = foundWallet.index;
                    
                    // Update our records for future use
                    if (!activeAddresses[highestBalanceAddr.address]) {
                        activeAddresses[highestBalanceAddr.address] = { index: senderIndex };
                        
                        // Try to save the updated address list
                        try {
                            updateAddressIndex(highestBalanceAddr.address, senderIndex);
                            console.log(`Updated address index map with ${highestBalanceAddr.address} -> ${senderIndex}`);
                        } catch (updateError) {
                            console.error(`Failed to update address index map:`, updateError);
                        }
                    }
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
                
                // Get balance in Wei
                const balanceWei = freshWeb3.utils.toWei(highestBalanceAddr.ethBalance, 'ether');
                
                // Calculate maximum amount to send (balance - gas cost)
                const maxAmountWei = BigInt(balanceWei) - gasCostWei;
                
                // Ensure we have enough to cover gas
                if (maxAmountWei <= BigInt(0)) {
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance to cover gas fees. Available: ${highestBalanceAddr.ethBalance} ETH, Gas cost: ${gasCostEth} ETH`
                    });
                }
                
                // Format amount to ETH for display
                const amountToSend = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                console.log(`Sending maximum amount: ${amountToSend} ETH`);
                
                // Check if this is a wrong payment address that should be skipped
                const isWrongPaymentAddress = addrInfo => {
                    return addrInfo && 
                           (addrInfo.isWrongPayment === true || 
                            addrInfo.wrongPayment === true || 
                            addrInfo.status === 'wrong');
                };
                
                // If this is a wrong payment address, warn the user but proceed
                if (keys.activeAddresses[highestBalanceAddr.address] && 
                    isWrongPaymentAddress(keys.activeAddresses[highestBalanceAddr.address])) {
                    console.warn(`⚠️ WARNING: Releasing funds from address ${highestBalanceAddr.address} which was marked as a wrong payment`);
                    console.warn(`This may be funds that were incorrectly sent. Proceeding with caution.`);
                    
                    // Add a log entry about this
                    logBlockchain('WRONG_PAYMENT_RELEASE_WARNING', {
                        address: highestBalanceAddr.address,
                        amount: amountToSend,
                        wrongReason: keys.activeAddresses[highestBalanceAddr.address].wrongReason || 'Unknown'
                    });
                }
                
                // Prepare transaction data
                const txData = {
                    from: highestBalanceAddr.address,
                    to: normalizedMerchantAddress,
                    value: maxAmountWei.toString(),
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
                    to: normalizedMerchantAddress,
                    amount: amountToSend,
                    amountWei: maxAmountWei.toString(),
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
                    amount: amountToSend,
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
                
                // Record the failed transaction attempt in our logs
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const failedTxEntry = {
                    txId: txId,
                    from: highestBalanceAddr.address,
                    to: normalizedMerchantAddress,
                    amount: amountToSend,
                    amountWei: maxAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    error: txError.message,
                    type: 'release',
                    attemptedRelease: true,
                    errorDetails: txError.stack ? txError.stack.split('\n')[0] : 'Unknown error'
                };
                
                // Save failed transaction to log for tracking and debugging
                saveTxLog(failedTxEntry);
                
                return res.status(500).json({
                    success: false,
                    error: `Failed to send transaction: ${txError.message}`
                });
            }
        }
    } catch (error) {
        console.error('Error in release-all-funds endpoint:', error);
        console.error('Stack trace:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: `Internal server error: ${error.message}`
        });
    }
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
    
    // Add custom endpoints from environment if available
    if (process.env.CUSTOM_RPC_ENDPOINTS) {
        try {
            const customEndpoints = process.env.CUSTOM_RPC_ENDPOINTS.split(',');
            rpcEndpoints.unshift(...customEndpoints); // Add custom endpoints with higher priority
            console.log(`Added ${customEndpoints.length} custom RPC endpoints from environment`);
        } catch (error) {
            console.error('Failed to parse custom RPC endpoints:', error);
        }
    }
    
    // Track errors for better diagnostics
    const errors = [];
    
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
            
            // Verify the connection and network in a more robust way
            try {
                const [network, chainId, blockNumber] = await Promise.all([
                    web3.eth.net.getNetworkType().catch(() => null),
                    web3.eth.getChainId().catch(() => null),
                    web3.eth.getBlockNumber().catch(() => null)
                ]);
                
                // Verify we're on Sepolia (chainId 11155111)
                if (chainId === 11155111) {
                    console.log(`Provider ${providerName} connected successfully! Current block: ${blockNumber}`);
                    
                    // Log success
                    logBlockchain('WEB3_PROVIDER_SUCCESS', {
                        provider: providerName,
                        endpoint: endpoint,
                        network: 'Sepolia',
                        blockNumber: blockNumber
                    });
                    
                    // Cache this working provider for fallback purposes
                    global.lastWorkingProvider = provider;
                    global.lastWorkingProviderTimestamp = Date.now();
                    global.lastWorkingWeb3 = web3;
                    
                    return web3;
                } else {
                    console.warn(`Provider ${providerName} connected to wrong network: ${network}, chainId: ${chainId}`);
                    errors.push(`Provider ${providerName}: Wrong network (chainId: ${chainId})`);
                    continue; // Try the next provider
                }
            } catch (verificationError) {
                console.error(`Provider ${providerName} connection verification failed:`, verificationError.message);
                errors.push(`Provider ${providerName}: Verification failed - ${verificationError.message}`);
                continue; // Try the next provider
            }
            
        } catch (error) {
            const providerName = endpoint.split('//')[1].split('.')[0];
            console.error(`Provider ${providerName} connection failed:`, error.message);
            errors.push(`Provider ${providerName}: ${error.message}`);
            // Continue to the next provider
        }
    }
    
    // Try to use cached provider as a last resort
    if (global.lastWorkingWeb3 && global.lastWorkingProviderTimestamp && 
        (Date.now() - global.lastWorkingProviderTimestamp) < 3600000) { // Less than 1 hour old
        console.log('All providers failed, trying the last working provider from cache...');
        
        try {
            // Verify the cached provider still works
            const blockNumber = await global.lastWorkingWeb3.eth.getBlockNumber();
            console.log(`Cached provider is working! Current block: ${blockNumber}`);
            return global.lastWorkingWeb3;
        } catch (cachedError) {
            console.error('Cached provider also failed:', cachedError.message);
        }
    }
    
    // Log all provider errors for diagnostics
    logBlockchain('ALL_PROVIDERS_FAILED', { errors });
    
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
        // Check rate limit for this endpoint
        const rateLimitKey = `rateLimit:wallet-balance:${req.ip}`;
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
        const cachedBalanceKey = 'wallet_balance_cache';
        const cachedBalanceTimestampKey = 'wallet_balance_timestamp';
        
        // Only use cache if it's less than 10 seconds old (server-side cache)
        const cachedTimestamp = global[cachedBalanceTimestampKey] || 0;
        const forceRefresh = req.query.force === 'true';
        
        if (!forceRefresh && global[cachedBalanceKey] && (Date.now() - cachedTimestamp) < 10000) {
            console.log('Returning cached wallet balance (< 10 seconds old)');
            return res.json(global[cachedBalanceKey]);
        }
        
        console.log('Fetching fresh wallet balances');
        const startTime = Date.now();
        
        // Get the active payment addresses (HD wallet addresses)
        const keys = getStoredKeys();
        const merchantAddress = process.env.MERCHANT_ADDRESS || MERCHANT_ADDRESS;
        const activeAddresses = keys.activeAddresses || {};
        
        // Initialize Web3 provider
        const freshWeb3 = await getFreshProvider();
        
        // Create a map to store balances by address
        const balances = new Map();
        
        // Get all active payment address balances - this might take time
        const checkAddressPromises = [];
        
        // Helper function for getting address balance with timeout
        async function getAddressBalanceWithTimeout(address, info, timeoutMs) {
            try {
                // Use Promise.race to implement timeout
                const balancePromise = getBalanceWithRetry(freshWeb3, address, 2);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Balance check timed out')), timeoutMs)
                );
                
                const balance = await Promise.race([balancePromise, timeoutPromise]);
                return { address, balance, info };
            } catch (error) {
                console.warn(`Balance check for ${address} failed or timed out:`, error.message);
                return { address, balance: '0', info, error: error.message };
            }
        }
        
        // Check balances for all HD wallet addresses (excluding wrong payments)
        let hdWalletTotal = 0;
        for (const [address, info] of Object.entries(activeAddresses)) {
            // Skip wrong payment addresses when counting HD wallet funds
            if (info.isWrongPayment === true || info.wrongPayment === true) {
                // Still get the balance but mark it as wrong payment
                checkAddressPromises.push(getAddressBalanceWithTimeout(address, {...info, isWrongPayment: true}, 3000));
            } else {
                // Regular HD wallet address
                checkAddressPromises.push(getAddressBalanceWithTimeout(address, info, 3000));
            }
        }
        
        // Wait for all address checks to complete (or timeout)
        const addressResults = await Promise.allSettled(checkAddressPromises);
        
        // Process the results - add all balances to the map and calculate totals
        const hdWalletAddresses = [];
        let totalHdWalletBalance = 0;
        let wrongPaymentsBalanceTotal = 0;
        
        for (const result of addressResults) {
            if (result.status === 'fulfilled' && result.value) {
                const { address, balance, info } = result.value;
                
                // Store the address data
                const addressData = {
                    address,
                    balance,
                    rawBalance: balance,
                    ...info
                };
                
                // Add to the addresses array
                hdWalletAddresses.push(addressData);
                
                // Calculate balance values based on wrong payment status
                try {
                    const addrBalance = parseFloat(balance) || 0;
                    
                    // For regular HD addresses, add to the total HD wallet balance
                    if (info.isWrongPayment !== true && info.wrongPayment !== true) {
                        totalHdWalletBalance += addrBalance;
                    } else {
                        // For wrong payments, track separately
                        wrongPaymentsBalanceTotal += addrBalance;
                    }
                } catch (error) {
                    console.error(`Error processing balance for ${address}:`, error);
                }
            }
        }
        
        // Get transaction history to calculate pending and verified balances
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
        
        // Calculate pending and verified amounts from transactions
        let pendingBalanceWei = BigInt(0);
        let verifiedBalanceWei = BigInt(0);
        
        for (const tx of transactions) {
            // Skip transactions that aren't payments or don't have an amount
            if (tx.type !== 'payment' || !tx.amount) continue;
            
            // Skip wrong payments from balance calculations
            if (tx.amountVerified === false) continue;
            
            try {
                let amountWei;
                
                // Handle different amount formats (decimal ETH vs Wei)
                if (typeof tx.amount === 'string' && tx.amount.includes('.')) {
                    // Amount is already in ETH format, convert to wei
                    amountWei = freshWeb3.utils.toWei(tx.amount, 'ether');
                } else {
                    // Amount is already in Wei
                    amountWei = tx.amount.toString();
                }
                
                // Convert to BigInt for calculations
                const amountBigInt = BigInt(amountWei);
                
                // Categorize by verification status
                if (tx.status === 'confirmed' || tx.status === 'verified') {
                    verifiedBalanceWei += amountBigInt;
                } else if (tx.status === 'pending' || tx.status === 'processing') {
                    pendingBalanceWei += amountBigInt;
                }
            } catch (error) {
                console.error('Error processing transaction amount:', error, tx);
                // Continue with other transactions
            }
        }
        
        // Count wrong payments
        let wrongPaymentsCount = 0;
        let wrongPaymentsAmount = "0";
        
        try {
            const wrongPayments = transactions.filter(tx => 
                tx.type === 'payment' && 
                (
                    tx.amountVerified === false || 
                    tx.isWrongPayment === true || 
                    tx.wrongPayment === true || 
                    tx.status === 'wrong'
                )
            );
            
            wrongPaymentsCount = wrongPayments.length;
            
            // Calculate total wrong payment amount
            if (wrongPaymentsCount > 0) {
                const totalWei = wrongPayments.reduce((totalBigInt, tx) => {
                    try {
                        let amountWei;
                        
                        if (typeof tx.amount === 'string' && tx.amount.includes('.')) {
                            // Amount is already in ETH format, convert to wei
                            amountWei = freshWeb3.utils.toWei(tx.amount, 'ether');
                        } else {
                            // Amount is already in Wei
                            amountWei = tx.amount.toString();
                        }
                        
                        return totalBigInt + BigInt(amountWei);
                    } catch (e) {
                        console.error('Error processing wrong payment amount:', e, tx);
                        return totalBigInt;
                    }
                }, BigInt(0));
                
                wrongPaymentsAmount = freshWeb3.utils.fromWei(totalWei.toString(), 'ether');
            }
        } catch (countError) {
            console.error('Error counting wrong payments:', countError);
        }
        
        // Format the results
        const pendingBalance = freshWeb3.utils.fromWei(pendingBalanceWei.toString(), 'ether');
        const verifiedBalance = freshWeb3.utils.fromWei(verifiedBalanceWei.toString(), 'ether');
        
        // Create the response with only HD wallet balance
        const response = {
            success: true,
            addresses: hdWalletAddresses,
            totalBalance: totalHdWalletBalance.toString(),
            pendingBalance: pendingBalance,
            verifiedBalance: verifiedBalance,
            wrongPayments: wrongPaymentsCount,
            wrongPaymentsAmount: wrongPaymentsAmount,
            wrongPaymentsBalance: wrongPaymentsBalanceTotal.toString(),
            timestamp: Date.now(),
            processingTime: Date.now() - startTime
        };
        
        // Update cache
        global[cachedBalanceKey] = response;
        global[cachedBalanceTimestampKey] = Date.now();
        
        return res.json(response);
    } catch (error) {
        console.error('Error fetching wallet balances:', error);
        
        // If we have a cached version, return that with a warning
        const cachedBalanceKey = 'wallet_balance_cache';
        if (global[cachedBalanceKey]) {
            console.log('Returning stale cached wallet balance due to error');
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
            error: 'Failed to fetch wallet balances: ' + error.message
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
        
        const { amount, cryptoType, fiatAmount, fiatCurrency } = req.body;
        if (!amount || !cryptoType) {
            logger.error('Missing required parameters', { amount, cryptoType });
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required parameters' 
            });
        }

        // Validate and properly format the ETH amount to ensure consistency
        // This will convert values like "1" or "0.0036" to a consistent format
        let formattedAmount;
        try {
            // Parse as float first to handle any string representation
            const floatAmount = parseFloat(amount);
            if (isNaN(floatAmount)) {
                throw new Error('Invalid amount format');
            }
            
            // Format to 8 decimal places to ensure consistency
            formattedAmount = floatAmount.toFixed(8);
            
            // Log the conversion for debugging
            logger.info('Formatted payment amount', { 
                original: amount, 
                formatted: formattedAmount,
                fiatAmount: fiatAmount
            });
        } catch (parseError) {
            logger.error('Failed to parse amount', { amount, error: parseError.message });
            return res.status(400).json({
                success: false,
                error: 'Invalid amount format'
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
        
        // Store address in active addresses - CRITICALLY: store both ETH and fiat values separately
        keys.activeAddresses[address] = {
            index: nextIndex,
            ethAmount: formattedAmount,         // The ETH amount to be paid (what's shown to users)
            expectedAmount: formattedAmount,    // Keep for backward compatibility
            cryptoType: cryptoType,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
            status: 'pending'
        };
        
        // If fiat amount is provided, store it separately
        if (fiatAmount) {
            keys.activeAddresses[address].fiatAmount = fiatAmount;
            keys.activeAddresses[address].fiatCurrency = fiatCurrency || 'USD';
        }
        
        // Save updated keys
        secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));

        // Prepare response
        const response = {
            success: true,
            address: address,
            amount: formattedAmount,
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
            
            // Format amount correctly
            const formattedAmount = parseFloat(req.body.amount || '0').toFixed(8);
            
            // Still save this emergency address
            if (!keys.activeAddresses) {
                keys.activeAddresses = {};
            }
            
            keys.activeAddresses[address] = {
                index: emergencyIndex,
                ethAmount: formattedAmount,
                expectedAmount: formattedAmount,
                cryptoType: req.body.cryptoType || 'ETH',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
                status: 'emergency',
                error: error.message
            };
            
            // If fiat amount is provided, store it separately
            if (req.body.fiatAmount) {
                keys.activeAddresses[address].fiatAmount = req.body.fiatAmount;
                keys.activeAddresses[address].fiatCurrency = req.body.fiatCurrency || 'USD';
            }
            
            // Save updated keys
            secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
            
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
                // Check if the address is expired in our records
                const keys = getStoredKeys();
                const addrInfo = keys.activeAddresses && keys.activeAddresses[address];
                
                if (addrInfo && addrInfo.isExpired === true) {
                    console.log(`Rejecting payment processing for expired address ${address}`);
                    return res.status(400).json({
                        success: false,
                        isExpired: true,
                        message: 'This payment address has expired',
                        reason: addrInfo.expiredReason || 'Address expired due to previous wrong payment',
                        expiredAt: addrInfo.expiredAt || new Date().toISOString()
                    });
                }
                
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
                const fileContent = secureReadFile(txFile);
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
                        secureWriteFile(txFile, JSON.stringify([]));
                    }
                } else {
                    console.log('Transaction file is empty, initializing with empty array');
                    transactions = [];
                    secureWriteFile(txFile, JSON.stringify([]));
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
                secureWriteFile(txFile, JSON.stringify([]));
            }
        } else {
            console.log('Transaction file does not exist, creating empty file');
            transactions = [];
            secureWriteFile(txFile, JSON.stringify([]));
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
        
        // Check for wrong payments and mark them
        let transactionsUpdated = false;
        transactions = transactions.map(tx => {
            // Skip non-payment transactions and already processed transactions with verified status
            if (tx.type !== 'payment' || (tx.amountVerified !== undefined && tx.wrongPaymentRecorded === true)) {
                return tx;
            }
            
            // Log the transaction being checked
            console.log(`Checking payment correctness for transaction: ${tx.txHash || tx.address || 'unknown'}`);
            
            // Verify the payment amount is correct
            const isCorrect = isPaymentAmountCorrect(tx);
            
            // Mark the transaction with verification result
            tx.amountVerified = isCorrect;
            transactionsUpdated = true;
            
            // If the amount is wrong, record it for admin review and mark it clearly
            if (!isCorrect) {
                console.log(`Payment amount incorrect for ${tx.txHash || tx.address || 'unknown'}: expected=${tx.addrInfo?.expectedAmount || tx.expectedAmount}, actual=${tx.amount}`);
                
                // Set all relevant wrong payment flags
                tx.isWrongPayment = true;
                tx.wrongPayment = true;
                tx.status = 'wrong'; // Explicitly mark status as wrong for UI display
                
                // Record the wrong payment if not already recorded
                if (!tx.wrongPaymentRecorded) {
                    recordWrongPayment(tx);
                    tx.wrongPaymentRecorded = true;
                    console.log(`Marked transaction ${tx.txHash || tx.address || 'unknown'} as wrong payment`);
                }
            } else {
                // If payment is correct, ensure status is set properly
                if (!tx.status || tx.status === 'pending') {
                    tx.status = 'confirmed';
                }
            }
            
            return tx;
        });
        
        // Improved wrong payment detection in transaction list
        // Count wrong payments and calculate their total
        let wrongPaymentsCount = 0;
        let wrongPaymentsAmount = "0";
        
        try {
            // Improved filter to catch all possible wrong payment markers
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
            
            wrongPaymentsCount = wrongPayments.length;
            
            // Calculate total wrong payment amount
            if (wrongPaymentsCount > 0) {
                console.log(`Found ${wrongPaymentsCount} wrong payments, calculating total amount...`);
                
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
                        console.log(`Added wrong payment: ${tx.amount} ETH (${amountWei} wei), running total: ${totalWei} wei`);
                    } catch (e) {
                        console.error('Error processing wrong payment amount:', e, tx);
                        // Continue with other transactions
                    }
                }
                
                // Convert total wei to ETH
                wrongPaymentsAmount = web3.utils.fromWei(totalWei.toString(), 'ether');
                console.log(`Wrong payments: ${wrongPaymentsCount}, Total: ${wrongPaymentsAmount} ETH`);
            }
        } catch (countError) {
            console.error('Error counting wrong payments:', countError);
            // Use default values in case of error
            wrongPaymentsCount = 0;
            wrongPaymentsAmount = "0";
        }
        
        // Save the updated transactions back to file if any transactions were updated
        if (transactionsUpdated) {
            try {
                secureWriteFile(txFile, JSON.stringify(transactions, null, 2));
                console.log('Saved updated transaction data with payment verification');
            } catch (saveError) {
                console.error('Error saving updated transaction data:', saveError);
            }
        }
        
        // Sort by timestamp (newest first)
        transactions.sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Prepare response
        const responseData = {
            success: true,
            transactions: transactions.slice(0, 100), // Limit to most recent 100
            total: transactions.length,
            timestamp: Date.now(),
            wrongPayments: wrongPaymentsCount,
            wrongPaymentsAmount: wrongPaymentsAmount
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

// Improved transaction sending with better retry logic
async function sendTransactionWithRetry(web3, signedTx, retries = 5, timeout = 180000) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < retries) {
        attempt++;
        console.log(`Sending transaction: Attempt ${attempt}/${retries}`);
        
        try {
            // Start timer for this attempt
            const startTime = Date.now();
            
            // Send the transaction
            const receipt = await new Promise((resolve, reject) => {
                let timeoutId;
                
                // Setup timeout for this attempt
                timeoutId = setTimeout(() => {
                    reject(new Error(`Transaction send timed out after ${timeout / 1000} seconds`));
                }, timeout);
                
                // Attempt to send the transaction
                web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                    .once('transactionHash', (hash) => {
                        console.log(`Transaction hash received: ${hash}`);
                        // Log the transaction hash - but keep waiting for receipt
                        logBlockchain('TX_HASH_RECEIVED', { hash, attempt });
                    })
                    .once('receipt', (receipt) => {
                        clearTimeout(timeoutId);
                        console.log(`Transaction receipt received: ${JSON.stringify(receipt, null, 2)}`);
                        resolve(receipt);
                    })
                    .once('error', (error) => {
                        clearTimeout(timeoutId);
                        reject(error);
                    });
            });
            
            // If we get here, transaction was successful
            const duration = (Date.now() - startTime) / 1000;
            console.log(`Transaction confirmed in ${duration} seconds on attempt ${attempt}/${retries}`);
            
            // Log success
            logBlockchain('TX_SUCCESS', {
                txHash: receipt.transactionHash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed,
                attempt: attempt,
                duration: duration
            });
            
            return receipt;
            
        } catch (error) {
            lastError = error;
            console.error(`Transaction attempt ${attempt}/${retries} failed:`, error.message);
            
            // Log the error for diagnostics
            logBlockchain('TX_ATTEMPT_FAILED', {
                attempt: attempt,
                error: error.message,
                errorCode: error.code || 'unknown'
            });
            
            // Check if we should retry based on the error
            if (shouldRetryTransaction(error) && attempt < retries) {
                const delay = Math.min(2000 * attempt, 10000); // Exponential backoff with max 10 seconds
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // If the error suggests RPC issues, get a fresh provider
                if (isProviderError(error)) {
                    try {
                        console.log('Provider error detected, getting fresh provider for next attempt...');
                        const freshWeb3 = await getFreshProvider();
                        web3 = freshWeb3; // Use the fresh provider for the next attempt
                    } catch (providerError) {
                        console.error('Failed to get fresh provider:', providerError.message);
                        // Continue with existing provider
                    }
                }
                
                // Continue to next attempt
                continue;
            } else {
                // We should not retry or have exhausted retries
                break;
            }
        }
    }
    
    // If we get here, all attempts failed
    throw new Error(`Transaction failed after ${attempt} attempts. Last error: ${lastError.message}`);
}

// Helper to determine if we should retry a transaction based on error type
function shouldRetryTransaction(error) {
    // List of errors that we should retry on
    const retryableErrors = [
        'connection error', 'timeout', 'timed out', 'CONNECTION ERROR',
        'nonce too low', 'known transaction', 'replacement transaction underpriced',
        'already known', 'invalid json response', 'invalid response'
    ];
    
    // Check if the error message contains any of our retryable errors
    return retryableErrors.some(retryErr => error.message.toLowerCase().includes(retryErr.toLowerCase()));
}

// Helper to identify provider errors
function isProviderError(error) {
    const providerErrorIndicators = [
        'connection error', 'timeout', 'timed out', 'CONNECTION ERROR',
        'invalid json response', 'invalid response', 'not connected', 'unavailable',
        'cannot fetch', 'bad gateway', '502', '503', '504'
    ];
    
    return providerErrorIndicators.some(indicator => 
        error.message.toLowerCase().includes(indicator.toLowerCase()));
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
        
        // Check if root address matches merchant address
        if (rootAddr.toLowerCase() !== merchantAddress.toLowerCase()) {
            console.warn(`Warning: Root address ${rootAddr} doesn't match configured merchant address ${merchantAddress}`);
        }
        
        // Get active HD wallet addresses
        const activeAddresses = keys.activeAddresses || {};
        console.log(`Found ${Object.keys(activeAddresses).length} active addresses`);
        
        // Check root address balance
        console.log('Checking root address balance...');
        const rootBalance = await getBalanceWithRetry(freshWeb3, rootAddr);
        console.log(`Root address balance: ${rootBalance} ETH`);
        
        // Convert amount to ETH float for safe comparison
        const requestedAmount = parseFloat(amount);
        const rootBalanceFloat = parseFloat(rootBalance);
        
        // Check all active address balances to find one with sufficient funds
        console.log(`Checking balances of ${Object.keys(activeAddresses).length} active addresses...`);
        const addressBalances = [];
        
        for (const addr in activeAddresses) {
            const addrInfo = activeAddresses[addr];
            
            // Skip addresses that don't belong to our wallet (wrong payments)
            if (addrInfo.isWrongPayment === true) {
                console.log(`Skipping wrong payment address: ${addr}`);
                continue;
            }
            
            console.log(`Checking balance for ${addr}...`);
            const balance = await getBalanceWithRetry(freshWeb3, addr);
            console.log(`Address ${addr} balance: ${balance} ETH`);
            
            // Skip addresses with zero balance to optimize
            if (parseFloat(balance) > 0) {
                addressBalances.push({
                    address: addr,
                    balance: parseFloat(balance),
                    ethBalance: balance,
                    index: addrInfo.index
                });
            }
        }
        
        // Calculate total balance (including root balance)
        const totalBalanceEth = addressBalances.reduce((sum, addr) => sum + addr.balance, 0) + rootBalanceFloat;
        console.log(`Total available balance across all addresses: ${totalBalanceEth} ETH`);
        
        // Convert amount to wei for calculations
        const amountWei = freshWeb3.utils.toWei(amount, 'ether');
        console.log(`Requested amount in wei: ${amountWei}`);
        
        // First try to use root address if it has sufficient balance
        if (rootBalanceFloat >= requestedAmount) {
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
                
                // Record the failed transaction attempt in our logs
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const failedTxEntry = {
                    txId: txId,
                    from: rootAddr,
                    to: merchantAddress,
                    amount: amount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    error: txError.message,
                    type: 'release',
                    attemptedRelease: true,
                    errorDetails: txError.stack ? txError.stack.split('\n')[0] : 'Unknown error'
                };
                
                // Save failed transaction to log for tracking and debugging
                saveTxLog(failedTxEntry);
                
                return res.status(500).json({
                    success: false,
                    error: `Failed to send transaction: ${txError.message}`
                });
            }
        } else {
            console.log(`Root address has insufficient balance. Consolidating funds from ${addressBalances.length} active addresses...`);
            
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
            
            if (highestBalanceAddr.balance < requestedAmount) {
                // If no single address has enough, check if total balance is sufficient
                if (totalBalanceEth >= requestedAmount) {
                    console.log(`No single address has sufficient funds, but total balance is enough. Multiple transactions needed.`);
                    
                    // Implementation for multiple transactions could go here
                    // For now, return an informative error
                    return res.status(400).json({
                        success: false,
                        error: `No single address has sufficient balance. Requested: ${amount} ETH, Total available: ${totalBalanceEth} ETH. Consider using 'Release All Funds' instead.`
                    });
                }
                
                return res.status(400).json({
                    success: false,
                    error: `Insufficient balance. Requested: ${amount} ETH, Available: ${highestBalanceAddr.ethBalance} ETH (highest single address), Total: ${totalBalanceEth} ETH`
                });
            }
            
            console.log(`Using address ${highestBalanceAddr.address} with balance ${highestBalanceAddr.ethBalance} ETH for direct release`);
            
            // Proceed with sending a new transaction from highest balance address
            console.log('Preparing transaction from highest balance address...');
            
            try {
                // Ensure we have a valid index before recovering the wallet
                let senderIndex = highestBalanceAddr.index;
                if (senderIndex === undefined || senderIndex === null) {
                    console.warn(`Index for address ${highestBalanceAddr.address} was undefined. Attempting to retrieve from keys.activeAddresses...`);
                    const addrInfo = keys.activeAddresses[highestBalanceAddr.address];
                    if (addrInfo && addrInfo.index !== undefined) {
                        senderIndex = addrInfo.index;
                        console.log(`Successfully retrieved index: ${senderIndex}`);
                    } else {
                        console.warn(`Could not find index in activeAddresses. Checking address index map...`);
                        // Try to find the index in our scanned map
                        const normalizedAddr = highestBalanceAddr.address.toLowerCase();
                        if (addressIndexMap[normalizedAddr]) {
                            senderIndex = addressIndexMap[normalizedAddr];
                            console.log(`Found index ${senderIndex} for address ${highestBalanceAddr.address} in scanned map`);
                        } else {
                            // If we still can't find it, do a deeper scan with more addresses
                            console.log(`Performing deep scan for address ${highestBalanceAddr.address}...`);
                            const deepScanMap = await scanForAddressIndices(mnemonic, 200); // Scan 200 indices
                            if (deepScanMap[normalizedAddr]) {
                                senderIndex = deepScanMap[normalizedAddr];
                                console.log(`Found index ${senderIndex} for address ${highestBalanceAddr.address} in deep scan`);
                            } else {
                                throw new Error(`Could not determine derivation index for address ${highestBalanceAddr.address}`);
                            }
                        }
                    }
                }

                // Recover the private key for this address using the validated index
                console.log(`Recovering wallet for index ${senderIndex}...`);
                const senderWallet = await recoverWallet(mnemonic, senderIndex);
                
                // Verify address matches (case-insensitive compare)
                if (senderWallet.address.toLowerCase() !== highestBalanceAddr.address.toLowerCase()) {
                    console.error(`Address mismatch! Expected: ${highestBalanceAddr.address}, Got: ${senderWallet.address}`);
                    
                    // Try a different approach - search through more indices to find the matching wallet
                    console.log(`Searching for wallet matching address ${highestBalanceAddr.address}...`);
                    const foundWallet = await findWalletForAddress(mnemonic, highestBalanceAddr.address);
                    
                    if (!foundWallet) {
                        throw new Error('Address derivation mismatch - could not find matching wallet');
                    }
                    
                    console.log(`Found wallet with matching address at index ${foundWallet.index}`);
                    senderWallet = foundWallet.wallet;
                    senderIndex = foundWallet.index;
                    
                    // Update our records for future use
                    if (!activeAddresses[highestBalanceAddr.address]) {
                        activeAddresses[highestBalanceAddr.address] = { index: senderIndex };
                        
                        // Try to save the updated address list
                        try {
                            updateAddressIndex(highestBalanceAddr.address, senderIndex);
                            console.log(`Updated address index map with ${highestBalanceAddr.address} -> ${senderIndex}`);
                        } catch (updateError) {
                            console.error(`Failed to update address index map:`, updateError);
                        }
                    }
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
                
                // Record the failed transaction attempt in our logs
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const failedTxEntry = {
                    txId: txId,
                    from: highestBalanceAddr.address,
                    to: merchantAddress,
                    amount: amount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    error: txError.message,
                    type: 'release',
                    attemptedRelease: true,
                    errorDetails: txError.stack ? txError.stack.split('\n')[0] : 'Unknown error'
                };
                
                // Save failed transaction to log for tracking and debugging
                saveTxLog(failedTxEntry);
                
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
        
        // Get address info if it exists
        const addrInfo = keys.activeAddresses[address] || {};
        
        // Check if address is expired due to a previous wrong payment
        if (addrInfo.isExpired === true) {
            console.log(`Rejecting payment to expired address ${address}`);
            return res.status(400).json({
                success: false,
                isExpired: true,
                message: 'This payment address has expired',
                reason: addrInfo.expiredReason || 'Address expired due to previous wrong payment',
                expiredAt: addrInfo.expiredAt || new Date().toISOString()
            });
        }
        
        // Check if this is a wrong payment (amount doesn't match expected amount)
        let isWrong = false;
        let ethAmount = addrInfo.ethAmount || addrInfo.expectedAmount;
        let wrongReason = '';
        
        if (ethAmount) {
            // Create a payment object for validation
            const paymentObj = {
                address,
                amount: formattedAmount,
                addrInfo: {
                    ethAmount: ethAmount,
                    expectedAmount: ethAmount
                }
            };
            
            // Check if the payment amount is correct
            const isCorrect = isPaymentAmountCorrect(paymentObj);
            
            // If not correct, it's a wrong payment
            isWrong = !isCorrect;
            
            // Set the reason for wrong payment
            if (isWrong) {
                wrongReason = `Please submit ${ethAmount} ETH. You sent ${formattedAmount} ETH which is incorrect.`;
                console.log(`Wrong payment detected: ${wrongReason}`);
            }
        }
        
        // If this is a wrong payment, record it as such
        if (isWrong) {
            const wrongPayment = {
                address,
                amount: formattedAmount,
                ethAmount: ethAmount,
                expectedAmount: ethAmount,
                timestamp: new Date().toISOString(),
                cryptoType: cryptoType || 'ETH'
            };
            
            await recordWrongPayment(wrongPayment);
            
            // Return a response but with wrong payment flag
            return res.json({
                success: true,
                isWrongPayment: true,
                message: 'Wrong payment recorded',
                reason: wrongReason
            });
        }
        
        // Add or update the address with a timestamp
        keys.activeAddresses[address] = {
            ...addrInfo,
            amount: formattedAmount,
            cryptoType: cryptoType || 'ETH',
            timestamp: new Date().toISOString(),
            status: 'confirmed',
            amountVerified: true
        };
        
        // Save updated keys
        updateStoredKeys(keys);
        
        // Log the transaction
        logBlockchain('PAYMENT_RECORDED', {
            address,
            amount: formattedAmount,
            cryptoType: cryptoType || 'ETH',
            timestamp: new Date().toISOString()
        });
        
        // Record in merchant transactions log
        const txLog = {
            txId: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            address: address,
            amount: formattedAmount,
            timestamp: new Date().toISOString(),
            status: 'confirmed',
            type: 'payment',
            cryptoType: cryptoType || 'ETH',
            amountVerified: true
        };
        
        const txFile = 'merchant_transactions.json';
        try {
            let txLogs = [];
            
            // Read existing logs if file exists
            if (fs.existsSync(txFile)) {
                const fileContent = secureReadFile(txFile);
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
            secureWriteFile(txFile, JSON.stringify(txLogs, null, 2));
        } catch (fileError) {
            console.error('Error saving transaction log:', fileError);
            // Try to recover by creating fresh file with just this transaction
            try {
                secureWriteFile(txFile, JSON.stringify([txLog], null, 2));
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

// Test wrong payment page
app.get('/test-wrong-payment', (req, res) => {
    res.sendFile(__dirname + '/Public/test-wrong-payment.html');
});

// Get all wrong payments
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

// TESTING ENDPOINT: Generate a payment address with expected amount
app.get('/api/generate-test-payment', async (req, res) => {
    try {
        // Get expected amount from query parameter
        const expectedAmount = req.query.amount || '0.01';
        
        // Generate a unique payment ID
        const paymentId = `payment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Get wallet keys from storage
        const keys = getStoredKeys();
        
        // Decrypt the mnemonic
        const mnemonic = decrypt(keys.mnemonic);
        
        // Get next available index
        const nextIndex = keys.lastIndex + 1 || 0;
        
        // Generate a new HD wallet address
        const wallet = await recoverWallet(mnemonic, nextIndex);
        const address = wallet.address;
        
        // Update the keys
        keys.lastIndex = nextIndex;
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        }
        
        // Add the new address with expected amount
        keys.activeAddresses[address] = {
            index: nextIndex,
            createdAt: new Date().toISOString(),
            orderId: paymentId,
            expectedAmount: expectedAmount,
            cryptoType: 'ETH',
            status: 'pending'
        };
        
        // Save the updated keys
        updateStoredKeys(keys);
        
        // Log the payment request
        console.log(`Generated test payment address: ${address} with expected amount: ${expectedAmount} ETH`);
        
        // Add to payment sessions table
        if (!keys.paymentSessions) {
            keys.paymentSessions = {};
        }
        
        // Create expiry time (20 minutes from now)
        const expiryTime = new Date();
        expiryTime.setMinutes(expiryTime.getMinutes() + 20);
        
        // Add payment session
        keys.paymentSessions[paymentId] = {
            id: paymentId,
            address: address,
            amount: expectedAmount,
            expiresAt: expiryTime.toISOString(),
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        // Save updated keys again
        updateStoredKeys(keys);
        
        // Return the payment details
        res.json({
            success: true,
            address: address,
            id: paymentId,
            expectedAmount: expectedAmount,
            expiresAt: expiryTime.toISOString()
        });
    } catch (error) {
        console.error('Error generating test payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate test payment: ' + error.message
        });
    }
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
                const fileContent = secureReadFile(txLogPath);
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
            fileContent = secureReadFile(txFile);
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
                secureWriteFile(txFile, JSON.stringify([]));
                
                console.warn('Reset transaction log to empty array');
                return false;
            }
        } catch (parseError) {
            console.error('Error parsing transaction log for update:', parseError);
            
            // Create a backup of the corrupted file
            const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
            fs.copyFileSync(txFile, backupFile);
            
            // Create a new empty log
            secureWriteFile(txFile, JSON.stringify([]));
            
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
            secureWriteFile(tempFile, JSON.stringify(updatedLogs, null, 2));
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
        console.log(`Saving transaction log entry for ${txLogEntry.txHash || txLogEntry.address || 'unknown'}`);
        
        // Get the transaction file path
        const txFile = 'merchant_transactions.json';
        
        // Read existing logs if file exists
        let txLogs = [];
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
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
        
        // Check if we already have this transaction recorded
        let existingIndex = -1;
        
        // Try to match by txHash first if available
        if (txLogEntry.txHash) {
            existingIndex = txLogs.findIndex(tx => 
                tx.txHash === txLogEntry.txHash
            );
        } 
        // If no txHash or not found by txHash, try to match by txId
        else if (txLogEntry.txId && existingIndex === -1) {
            existingIndex = txLogs.findIndex(tx => 
                tx.txId === txLogEntry.txId
            );
        }
        // If payment address is available, try to match by that and timestamp
        else if (txLogEntry.address && txLogEntry.timestamp && existingIndex === -1) {
            existingIndex = txLogs.findIndex(tx => 
                tx.address === txLogEntry.address && 
                tx.timestamp === txLogEntry.timestamp
            );
        }
        
        // Add or update the transaction log entry
        if (existingIndex >= 0) {
            console.log(`Updating existing transaction log entry at index ${existingIndex}`);
            
            // Keep existing fields that aren't in the new entry
            const existingTx = txLogs[existingIndex];
            txLogs[existingIndex] = {
                ...existingTx,
                ...txLogEntry,
                // Always record update history for better tracking
                lastUpdated: new Date().toISOString(),
                // If we're updating a status, keep track of status history
                statusHistory: existingTx.statusHistory ? [
                    ...existingTx.statusHistory,
                    {
                        status: txLogEntry.status,
                        timestamp: new Date().toISOString()
                    }
                ] : [
                    {
                        status: existingTx.status, 
                        timestamp: existingTx.timestamp || new Date().toISOString()
                    },
                    {
                        status: txLogEntry.status,
                        timestamp: new Date().toISOString()
                    }
                ]
            };
        } else {
            console.log(`Adding new transaction log entry`);
            
            // Initialize history for new transactions
            const newTxEntry = {
                ...txLogEntry,
                // Add creation timestamp if not present
                timestamp: txLogEntry.timestamp || new Date().toISOString(),
                // Initialize status history
                statusHistory: [{
                    status: txLogEntry.status,
                    timestamp: txLogEntry.timestamp || new Date().toISOString()
                }]
            };
            
            // Ensure txId is present
            if (!newTxEntry.txId) {
                newTxEntry.txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            }
            
            // Add transaction to log
            txLogs.push(newTxEntry);
        }
        
        // Write back to file
        secureWriteFile(txFile, JSON.stringify(txLogs, null, 2));
        console.log(`Transaction log updated successfully`);
        
        return true;
    } catch (error) {
        console.error('Error saving transaction log:', error);
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
        const fileContent = secureReadFile(txFile);
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

// Create transaction file if it doesn't exist
app.post('/api/create-transaction-file', async (req, res) => {
    try {
        console.log('Create transaction file request received');
        
        // Log headers for debugging
        console.log('Request headers:', JSON.stringify(req.headers, null, 2));
        
        const txFile = 'merchant_transactions.json';
        
        // Check if file already exists
        if (fs.existsSync(txFile)) {
            console.log('Transaction file already exists, no action needed');
            return res.json({
                success: true,
                message: 'Transaction file already exists',
                created: false
            });
        }
        
        // Create new empty transaction file
        console.log('Creating new transaction file');
        secureWriteFile(txFile, JSON.stringify([]));
        
        console.log('Created new transaction file successfully');
        return res.json({
            success: true,
            message: 'Transaction file created successfully',
            created: true
        });
    } catch (error) {
        console.error('Error creating transaction file:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create transaction file: ' + error.message
        });
    }
});

// Function to check if a payment amount is correct
function isPaymentAmountCorrect(payment) {
    try {
        // If payment has expected amount in addrInfo, check against actual amount
        if (payment.addrInfo && payment.amount) {
            // First check if we have a ethAmount specifically for ETH comparison
            const expectedAmountToUse = payment.addrInfo.ethAmount || 
                                       payment.addrInfo.displayAmount || 
                                       payment.addrInfo.expectedAmount;
            
            // Skip check if no expected amount is available
            if (!expectedAmountToUse) {
                console.warn(`No expected amount available for payment: ${payment.address}`);
                return false;
            }
            
            // Normalize values to ensure proper comparison
            let expectedAmount = expectedAmountToUse;
            let actualAmount = payment.amount;
            
            // Convert both to floats for easy comparison if they're strings
            if (typeof expectedAmount === 'string') {
                expectedAmount = parseFloat(expectedAmount);
            }
            if (typeof actualAmount === 'string') {
                actualAmount = parseFloat(actualAmount);
            }
            
            // Handle potentially undefined/NaN values
            if (isNaN(expectedAmount) || isNaN(actualAmount)) {
                console.warn(`Invalid amount values for comparison: expected=${expectedAmountToUse}, actual=${payment.amount}`);
                return false; // Mark as incorrect if we can't parse properly
            }
            
            // Allow for a small variance (0.5%)
            const deviation = expectedAmount * 0.005;
            const isWithinRange = actualAmount >= (expectedAmount - deviation) && 
                               actualAmount <= (expectedAmount + deviation);
            
            // Log the comparison for debugging
            console.log(`Payment amount check: Expected=${expectedAmount}, Actual=${actualAmount}, Within range: ${isWithinRange}`);
            
            return isWithinRange;
        } else if (payment.expectedAmount && payment.amount) {
            // Direct comparison if addrInfo is not available but expectedAmount is
            // First try to use ethAmount if it exists
            let expectedAmount = payment.ethAmount || 
                               payment.displayAmount || 
                               payment.expectedAmount;
            let actualAmount = payment.amount;
            
            // Normalize values
            if (typeof expectedAmount === 'string') {
                expectedAmount = parseFloat(expectedAmount);
            }
            if (typeof actualAmount === 'string') {
                actualAmount = parseFloat(actualAmount);
            }
            
            if (isNaN(expectedAmount) || isNaN(actualAmount)) {
                console.warn(`Invalid direct amount values: expected=${payment.ethAmount || payment.displayAmount || payment.expectedAmount}, actual=${payment.amount}`);
                return false;
            }
            
            // Allow 0.5% deviation
            const deviation = expectedAmount * 0.005;
            const isWithinRange = actualAmount >= (expectedAmount - deviation) && 
                               actualAmount <= (expectedAmount + deviation);
            
            console.log(`Direct payment amount check: Expected=${expectedAmount}, Actual=${actualAmount}, Within range: ${isWithinRange}`);
            
            return isWithinRange;
        }
        
        // If we can't determine the expected amount, default to incorrect
        console.warn('Cannot determine expected amount for payment:', payment.address);
        return false;
    } catch (error) {
        console.error('Error checking payment amount:', error);
        // If there's an error in checking, assume it's incorrect to be safe
        return false;
    }
}

// Function to save wrong payment record
async function recordWrongPayment(payment) {
    try {
        console.log(`Recording wrong payment for ${payment.address} with amount ${payment.amount || 'unknown'}`);
        
        // Get stored keys
        const keys = getStoredKeys();
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        }
        
        // Make sure we have an address to work with
        if (!payment.address) {
            console.error('Cannot record wrong payment without an address');
            return false;
        }
        
        // Get the existing entry or create a new one
        let addrInfo = keys.activeAddresses[payment.address] || {};
        
        // Get the ETH amount that was shown to the user on the payment page
        // This is the correct amount that should have been paid
        const correctEthAmount = payment.ethAmount || 
                              addrInfo.ethAmount || 
                              addrInfo.displayAmount || 
                              addrInfo.expectedAmount || 
                              payment.expectedAmount;
        
        // Determine the reason for wrong payment
        let wrongReason = '';
        if (correctEthAmount && payment.amount) {
            wrongReason = `Please submit ${correctEthAmount} ETH. You sent ${payment.amount} ETH which is incorrect.`;
        } else {
            wrongReason = 'Amount verification failed. Please check the expected payment amount and try again.';
        }
        
        // Mark as wrong payment
        addrInfo = {
            ...addrInfo,
            isWrongPayment: true,
            wrongPayment: true,
            amountVerified: false,
            amount: payment.amount || addrInfo.amount,
            ethAmount: correctEthAmount || addrInfo.ethAmount,  // Store ethAmount
            expectedAmount: correctEthAmount || addrInfo.expectedAmount,
            timestamp: payment.timestamp || addrInfo.timestamp || new Date().toISOString(),
            status: 'wrong',
            cryptoType: payment.cryptoType || addrInfo.cryptoType || 'ETH',
            wrongReason: wrongReason,
            isExpired: true,  // Mark the address as expired
            expiredAt: new Date().toISOString(),
            expiredReason: 'Address expired due to wrong payment detection'
        };
        
        // Add to active addresses
        keys.activeAddresses[payment.address] = addrInfo;
        
        // Save updated keys
        updateStoredKeys(keys);
        
        // Log the wrong payment
        logBlockchain('WRONG_PAYMENT', {
            address: payment.address,
            amount: payment.amount,
            expectedAmount: correctEthAmount,
            timestamp: new Date().toISOString(),
            reason: wrongReason
        });
        
        // Prepare transaction log entry
        const txLog = {
            address: payment.address,
            amount: payment.amount,
            ethAmount: correctEthAmount,
            expectedAmount: correctEthAmount,
            timestamp: payment.timestamp || new Date().toISOString(),
            status: 'wrong',
            type: 'payment',
            cryptoType: payment.cryptoType || 'ETH',
            isWrongPayment: true,
            wrongPayment: true,
            wrongPaymentRecorded: true,
            amountVerified: false,
            wrongReason: wrongReason,
            isExpired: true,
            expiredAt: new Date().toISOString(),
            expiredReason: 'Address expired due to wrong payment detection'
        };
        
        // If we have a txHash, include it
        if (payment.txHash) {
            txLog.txHash = payment.txHash;
        }
        
        // Add txId if not present
        if (!txLog.txId) {
            const timestamp = new Date().getTime();
            const randomStr = Math.random().toString(36).substring(2, 9);
            txLog.txId = `tx_${timestamp}_${randomStr}`;
        }
        
        // Add to transaction log
        const txFile = 'merchant_transactions.json';
        try {
            let txLogs = [];
            
            // Read existing logs if file exists
            if (fs.existsSync(txFile)) {
                const fileContent = secureReadFile(txFile);
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
            
            // Check if we already have this transaction recorded
            const existingIndex = txLogs.findIndex(tx => 
                (tx.txHash && payment.txHash && tx.txHash === payment.txHash) ||
                (tx.address === payment.address && tx.amount === payment.amount && 
                 tx.timestamp === payment.timestamp)
            );
            
            if (existingIndex >= 0) {
                console.log(`Wrong payment already recorded, updating existing record`);
                // Keep any existing fields and add/update our wrong payment flags
                txLogs[existingIndex] = {
                    ...txLogs[existingIndex],
                    ...txLog,
                    // Ensure these fields are always set correctly
                    isWrongPayment: true,
                    wrongPayment: true,
                    wrongPaymentRecorded: true,
                    amountVerified: false,
                    status: 'wrong',
                    isExpired: true,
                    expiredAt: new Date().toISOString(),
                    expiredReason: 'Address expired due to wrong payment detection'
                };
            } else {
                // Add new transaction
                txLogs.push(txLog);
            }
            
            // Write back to file
            secureWriteFile(txFile, JSON.stringify(txLogs, null, 2));
            console.log(`Wrong payment recorded successfully for ${payment.address}`);
            return true;
        } catch (fileError) {
            console.error('Error saving wrong payment to transaction log:', fileError);
            
            // Try to recover by creating fresh file with just this transaction
            try {
                secureWriteFile(txFile, JSON.stringify([txLog], null, 2));
                return true;
            } catch (recoveryError) {
                console.error('Failed to recover transaction log:', recoveryError);
                return false;
            }
        }
    } catch (error) {
        console.error('Error recording wrong payment:', error);
        return false;
    }
}
