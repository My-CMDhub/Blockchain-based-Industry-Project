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
app.use(express.json());
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

// API endpoint to update keys.json for address management
app.post('/api/update-keys', async (req, res) => {
    try {
        const updatedKeys = req.body;
        
        // Validate input data
        if (!updatedKeys || !updatedKeys.activeAddresses) {
            return res.status(400).json({
                success: false,
                error: 'Invalid keys data. Must contain activeAddresses object.'
            });
        }
        
        // Basic format validation
        if (typeof updatedKeys.activeAddresses !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'activeAddresses must be an object'
            });
        }
        
        // If mnemonic or masterKey is missing, get the existing data
        if (!updatedKeys.mnemonic || !updatedKeys.masterKey) {
            const existingKeys = JSON.parse(secureReadFile('Json/keys.json'));
            updatedKeys.mnemonic = existingKeys.mnemonic;
            updatedKeys.masterKey = existingKeys.masterKey;
        }
        
        // Save the updated keys to the file directly
        try {
            secureWriteFile('Json/keys.json', JSON.stringify(updatedKeys, null, 2));
            logToFile(`Updated keys.json successfully. Address count: ${Object.keys(updatedKeys.activeAddresses).length}`);
            return res.json({ success: true });
        } catch (writeError) {
            throw new Error(`Failed to write keys.json: ${writeError.message}`);
        }
    } catch (error) {
        console.error('Error updating keys.json:', error);
        logToFile(`Error updating keys.json: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to update keys: ' + error.message
        });
    }
});

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
        let freshWeb3;
        try {
          freshWeb3 = await getFreshProvider();
        } catch (err) {
          console.error('Failed to get a fresh Web3 provider:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to connect to any Ethereum RPC provider. Please try again later.'
          });
        }
        if (!freshWeb3 || !freshWeb3.utils) {
          return res.status(500).json({
            success: false,
            error: 'Web3 provider is not available or invalid. Please try again later.'
          });
        }
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
                address,
                balance,
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

// --- HD Wallet Balance Endpoint ---
let fetch;
import('node-fetch').then(module => {
    fetch = module.default;
}).catch(err => {
    console.error('Error importing node-fetch:', err);
});

app.get('/api/hd-wallet-balance', async (req, res) => {
    if (!fetch) {
        return res.status(500).json({ 
            success: false, 
            error: 'Fetch module not initialized' 
        });
    }
    
    try {
        // Load and parse keys.json
        const keys = JSON.parse(await secureReadFile(path.join(__dirname, 'Json/keys.json')));
        if (!keys || !keys.mnemonic) {
            return res.status(500).json({ success: false, error: 'Mnemonic not found in keys.json' });
        }
        if (!keys.masterKey) {
            return res.status(500).json({ success: false, error: 'MasterKey not found in keys.json' });
        }
        let mnemonic;
        try {
            mnemonic = decrypt(keys.mnemonic);
            if (!mnemonic) throw new Error('Decryption returned empty mnemonic');
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Failed to decrypt mnemonic: ' + e.message });
        }
        // Derive root address (m/44'/60'/0'/0/0)
        const hdNode = ethers.utils.HDNode.fromMnemonic(mnemonic);
        const rootNode = hdNode.derivePath("m/44'/60'/0'/0/0");
        const address = rootNode.address;
        // Get ETH balance
        const provider = new ethers.providers.JsonRpcProvider(process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9');
        const balanceWei = await provider.getBalance(address);
        const ethBalance = ethers.utils.formatEther(balanceWei);
        // Get AUD price
        let audBalance = null;
        try {
            const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=aud');
            const priceData = await priceRes.json();
            const ethAud = priceData.ethereum.aud;
            audBalance = (parseFloat(ethBalance) * ethAud).toFixed(2);
        } catch (e) {
            audBalance = null;
        }
        res.json({
            success: true,
            address,
            ethBalance,
            audBalance,
            lastUpdated: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/statistics', async (req, res) => {
    try {
      const view = req.query.view;
      let stats = {};
      if (view === 'user') {
        // Read keys.json
        let keysPath = path.join(__dirname, 'Json', 'keys.json');
        let keysData = {};
        try {
          keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        } catch (e) {
          // File missing or invalid
          keysData = {};
        }
        const addresses = keysData.activeAddresses ? Object.values(keysData.activeAddresses) : [];
        stats = {
          totalUserActivities: addresses.length,
          pending: addresses.filter(a => a.status === 'pending').length,
          confirmed: addresses.filter(a => a.status === 'confirmed').length,
          wrongPayment: addresses.filter(a => a.status === 'wrong' || a.isWrongPayment).length,
          releaseFund: addresses.filter(a => a.status === 'release').length
        };
      } else if (view === 'merchant') {
        // Read merchant_transactions.json
        let merchantPath = path.join(__dirname, 'merchant_transactions.json');
        let merchantData = [];
        try {
          merchantData = JSON.parse(fs.readFileSync(merchantPath, 'utf8'));
        } catch (e) {
          merchantData = [];
        }
        stats = {
          totalMerchantActivities: merchantData.length,
          pending: merchantData.filter(a => a.status === 'pending').length,
          confirmed: merchantData.filter(a => a.status === 'confirmed').length,
          wrongPayment: merchantData.filter(a => a.status === 'wrong' || a.isWrongPayment).length,
          releaseFund: merchantData.filter(a => a.status === 'release').length
        };
      } else {
        return res.status(400).json({ error: 'Invalid view parameter' });
      }
      return res.json({ stats });
    } catch (err) {
      console.error('Error in /api/admin/statistics:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  


// New endpoint to verify if a payment address is still active
app.post('/api/verify-payment-address', async (req, res) => {
    try {
        const { address } = req.body;
        logger.info('Verifying payment address status', { address });

        if (!address) {
            logger.warn('Verify payment address request missing address');
            return res.status(400).json({ success: false, error: 'Address is required' });
        }

        const keys = getStoredKeys();
        const addrInfo = keys.activeAddresses && keys.activeAddresses[address];

        if (addrInfo && !addrInfo.isExpired && !addrInfo.isWrongPayment && addrInfo.status !== 'wrong') {
            const expiresAt = new Date(addrInfo.expiresAt);
            if (!isNaN(expiresAt) && expiresAt > Date.now()) {
                logger.info('Payment address verified as active', { address });
                return res.json({ success: true, active: true, message: 'Address is active' });
            } else {
                logger.warn('Payment address expired based on timestamp', { address, expiresAt: addrInfo.expiresAt });
                if (!addrInfo.isExpired) {
                    addrInfo.isExpired = true;
                    addrInfo.expiredAt = new Date().toISOString();
                    addrInfo.expiredReason = 'Expired based on timestamp check';
                    updateStoredKeys(keys);
                }
                return res.json({ success: true, active: false, message: 'Address expired' });
            }
        } else if (addrInfo) {
            logger.warn('Payment address found but is expired or wrong', { address });
            return res.json({ success: true, active: false, message: 'Address expired or marked as wrong payment' });
        } else {
            logger.info('Payment address not found', { address });
            return res.json({ success: true, active: false, message: 'Address not found' });
        }
    } catch (error) {
        logger.error('Error verifying payment address', { error });
        res.status(500).json({ success: false, error: 'Failed to verify payment address' });
    }
});

app.use('/api', paymentRoutes);
app.use('/api', walletRoutes);
app.use('/api', merchantRoutes);
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



// Apply API key validation
app.use(validateApiKey);



// Print all registered routes for debugging
app._router.stack
  .filter(r => r.route)
  .forEach(r => {
    console.log(`${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
  });

// ... after initializing web3 ...

// ... existing code ...

