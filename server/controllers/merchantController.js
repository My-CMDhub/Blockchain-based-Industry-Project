// Merchant Controller

const fs = require('fs');
const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
const { saveTxLog, updateTransactionLog } = require('../utils/txLogUtils');
// const Web3 = require('web3');
const web3 = global.web3;
const {
  getFreshProvider,
  getReliableNonce,
  getReliableGasPrice,
  waitForTransactionReceipt,
  checkTransactionReceipt,
  getBalanceWithRetry,
  shouldRetryTransaction,
  isProviderError,
  checkPendingTransactions,
  scanForAddressIndices,
  updateAddressIndex,
  findWalletForAddress,
  sendTransactionWithRetry
} = require('../utils/web3Utils');
const { logBlockchain, logToFile } = require('../utils/logger');
const { recoverWallet, getStoredKeys } = require('../../recover.js');
const { decrypt } = require('../../encryptionUtils');
const ethers = require('ethers');
const { BigNumber } = require('ethers');
// const { recoverWallet } = require('../../recover.js');

// Default merchant address for fallback
const DEFAULT_MERCHANT_ADDRESS = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';

// Helper function to normalize an Ethereum address
function normalizeAddress(address) {
  try {
    // Check if address is valid
    if (!address || typeof address !== 'string') {
      console.error('Invalid address format:', address);
      return null;
    }
    
    // Make sure it starts with 0x
    let normalizedAddr = address.trim();
    if (!normalizedAddr.startsWith('0x')) {
      normalizedAddr = '0x' + normalizedAddr;
    }
    
    // Validate the address format using web3 utils if available
    if (web3 && web3.utils && web3.utils.isAddress) {
      if (!web3.utils.isAddress(normalizedAddr)) {
        console.error('Invalid Ethereum address format:', normalizedAddr);
        return null;
      }
    } else if (normalizedAddr.length !== 42) {
      // Simple validation if web3 is not available
      console.error('Address does not have the correct length (should be 42 chars including 0x):', normalizedAddr);
      return null;
    }
    
    // Return the normalized address
    return normalizedAddr;
  } catch (error) {
    console.error('Error normalizing address:', error);
    return null;
  }
}

// Helper function to check if wallet has previous activity
function hasPreviousWalletActivity() {
    try {
        // Check if keys.json exists
        const keysExist = fs.existsSync('Json/keys.json');
        if (!keysExist) return false;
        
        // Get stored keys and check for active addresses
        const keys = getStoredKeys();
        const hasActiveAddresses = Object.keys(keys.activeAddresses || {}).length > 0;
        
        // Check backup files
        const backupFiles = fs.readdirSync('.').filter(file => 
            file.startsWith('merchant_transactions.json.corrupted') || 
            file.startsWith('merchant_transactions.json.bak')
        );
        
        // Check if there are any transaction-related files
        const transactionMetaFiles = fs.readdirSync('.').filter(file => 
            file.includes('transaction') || 
            file.includes('payment') ||
            file.includes('address_index_map.json')
        );
        
        return hasActiveAddresses || backupFiles.length > 0 || transactionMetaFiles.length > 0;
    } catch (error) {
        console.error('Error checking for previous wallet activity:', error);
        return false;
    }
}

exports.getMerchantTransactions = async (req, res) => {
    try {
        const txFile = 'merchant_transactions.json';
        let transactions = [];
        let dbStatus = {
            isCorrupted: false,
            backupCreated: false,
            errorDetails: null,
            lastBackup: null
        };

        // Check if database file exists
        if (fs.existsSync(txFile)) {
            try {
                // Try to read the file
                const fileContent = secureReadFile(txFile);
                
                // Check if file is empty
                if (!fileContent || !fileContent.trim()) {
                    dbStatus.isCorrupted = true;
                    dbStatus.errorDetails = "Transaction file exists but is empty";
                    console.error('ERROR: Transaction file is empty');
                } else {
                    // Try to parse the JSON
                    try {
                        transactions = JSON.parse(fileContent);
                        
                        // Validate data structure
                        if (!Array.isArray(transactions)) {
                            dbStatus.isCorrupted = true;
                            dbStatus.errorDetails = "Transaction data is not in expected format (not an array)";
                            console.error('ERROR: Transaction data is not an array');
                            
                            // Create backup of corrupted file
                            const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                            fs.copyFileSync(txFile, backupFile);
                            dbStatus.backupCreated = true;
                            dbStatus.lastBackup = backupFile;
                            
                            // Reset to empty array
                            transactions = [];
                        } 
                        // Check if array is empty but there's evidence of previous activity
                        else if (transactions.length === 0 && hasPreviousWalletActivity()) {
                            dbStatus.isCorrupted = true;
                            dbStatus.errorDetails = "Transaction file has been emptied unexpectedly";
                            dbStatus.dataLoss = true;
                            console.error('ERROR: Transaction file has been emptied unexpectedly');
                            
                            // Look for backups
                            const backupFiles = fs.readdirSync('.').filter(file => 
                                file.startsWith('merchant_transactions.json.corrupted') || 
                                file.startsWith('merchant_transactions.json.bak')
                            );
                            
                            if (backupFiles.length > 0) {
                                // Find most recent backup
                                const latestBackup = backupFiles.sort().pop();
                                dbStatus.lastBackup = latestBackup;
                                dbStatus.recoveryPossible = true;
                            }
                        }
                    } catch (parseError) {
                        // JSON parsing failed
                        dbStatus.isCorrupted = true;
                        dbStatus.errorDetails = `Invalid JSON format: ${parseError.message}`;
                        console.error('ERROR: Failed to parse transaction JSON:', parseError);
                        
                        // Create backup of corrupted file
                        const backupFile = `${txFile}.corrupted.${Date.now()}.bak`;
                        fs.copyFileSync(txFile, backupFile);
                        dbStatus.backupCreated = true;
                        dbStatus.lastBackup = backupFile;
                        
                        // Reset to empty array
                        transactions = [];
                    }
                }
            } catch (error) {
                // File read error
                dbStatus.isCorrupted = true;
                dbStatus.errorDetails = `Failed to read transaction file: ${error.message}`;
                console.error('ERROR: Exception reading transaction file:', error);
                transactions = [];
            }
        } else {
            console.log('INFO: Transaction file does not exist');
            
            // Check if we have backup files - if we do, this might be unexpected data loss rather than new installation
            const backupFiles = fs.readdirSync('.').filter(file => 
                file.startsWith('merchant_transactions.json.corrupted') || 
                file.startsWith('merchant_transactions.json.bak')
            );
            
            // Check if there are any transaction-related files (indicators of previous existence)
            const transactionMetaFiles = fs.readdirSync('.').filter(file => 
                file.includes('transaction') || 
                file.includes('payment') ||
                file.includes('address_index_map.json')
            );
            
            // Check if there are folders or keys that would indicate this is not a new installation
            const keysExist = fs.existsSync('Json/keys.json');
            const hasActiveAddresses = keysExist ? Object.keys(getStoredKeys().activeAddresses || {}).length > 0 : false;
            
            // If we find backup files, other transaction files, or active wallet keys, this is likely unexpected data loss
            if (backupFiles.length > 0 || transactionMetaFiles.length > 0 || hasActiveAddresses) {
                dbStatus.isCorrupted = true;
                dbStatus.isMissing = true;
                dbStatus.errorDetails = "Transaction database file is missing unexpectedly";
                dbStatus.recoveryPossible = backupFiles.length > 0;
                
                if (backupFiles.length > 0) {
                    // Find most recent backup
                    const latestBackup = backupFiles.sort().pop();
                    dbStatus.lastBackup = latestBackup;
                }
                
                console.error('ERROR: Transaction file is missing unexpectedly');
                
                // Create new empty file to prevent repeated errors
                secureWriteFile(txFile, JSON.stringify([]));
                console.log('Created new empty transaction file');
            } else {
                // This appears to be a new installation
                console.log('INFO: This appears to be a new installation, creating transaction file');
                secureWriteFile(txFile, JSON.stringify([]));
            }
        }

        console.log('DEBUG: Returning merchant transactions:', transactions.length, transactions);
        // Return all transactions for dashboard along with database status
        res.json({ 
            transactions,
            dbStatus
        });
    } catch (error) {
        console.error('ERROR: Exception in getMerchantTransactions:', error);
        res.status(500).json({ 
            error: 'Failed to fetch merchant transactions',
            details: error.message,
            dbStatus: {
                isCorrupted: true,
                errorDetails: `Server error: ${error.message}`
            }
        });
    }
};

exports.createTransactionFile = async (req, res) => {
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
};

exports.getReleaseStatus = async (req, res) => {
    const { txHash } = req.params;
    const { getFreshProvider } = require('../utils/web3Utils');
    const { logBlockchain } = require('../utils/logger');
    const { secureReadFile } = require('../utils/fileUtils');
    const fs = require('fs');
    // These helpers are defined in server.js, so require them if modularized
    let updateTransactionLog, saveTxLog;
    try {
        updateTransactionLog = require('../../server.js').updateTransactionLog;
    } catch (e) {}
    try {
        saveTxLog = require('../../server.js').saveTxLog;
    } catch (e) {}
    if (!txHash || typeof txHash !== 'string' || txHash.length !== 66) {
        return res.status(400).json({ 
            success: false,
            error: 'Invalid transaction hash format' 
        });
    }
    try {
        const freshWeb3 = await getFreshProvider();
        logBlockchain('CHECK_TX_STATUS', { txHash });
        const txLogPath = 'merchant_transactions.json';
        let txLog = [];
        let foundTx = null;
        try {
            if (fs.existsSync(txLogPath)) {
                const fileContent = secureReadFile(txLogPath);
                try {
                    txLog = JSON.parse(fileContent || '[]');
                    foundTx = txLog.find(tx => tx.txHash === txHash);
                    if (foundTx) {
                        console.log(`Found transaction in local log:`, JSON.stringify(foundTx, null, 2));
                    } else {
                        console.log(`Transaction ${txHash} not found in local log`);
                    }
                } catch (parseError) {
                    console.error('Error parsing transaction log:', parseError);
                }
            } else {
                console.log('Transaction log file does not exist');
            }
        } catch (readError) {
            console.error('Error reading transaction log:', readError);
        }
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
        }
        if (receipt) {
            const confirmations = (currentBlock && receipt.blockNumber) ? 
                (currentBlock - receipt.blockNumber) + 1 : 0;
            const success = receipt.status;
            if (foundTx && updateTransactionLog) {
                console.log(`Updating transaction log for ${txHash}`);
                updateTransactionLog(txHash, { 
                    status: success, 
                    confirmations,
                    receiptChecked: true,
                    lastChecked: new Date().toISOString()
                });
            } else if (receipt.from && receipt.to && success !== undefined && saveTxLog) {
                console.log(`Adding transaction to log: ${txHash}`);
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
        return res.json({
            success: false,
            txHash,
            found: false,
            status: null,
            message: 'Transaction not found in our system or on the blockchain',
            pending: false
        });
    } catch (error) {
        logBlockchain('TX_STATUS_ERROR', { txHash, error: error.message });
        return res.status(500).json({
            success: false,
            error: 'Failed to check transaction status',
            details: error.message
        });
    }
};

// Modularized version of /api/release-all-funds from server.js
exports.releaseAllFunds = async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] POST /api/release-all-funds`);
    try {
        const merchantAddress = process.env.MERCHANT_ADDRESS || DEFAULT_MERCHANT_ADDRESS;
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
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        const rootAddress = await recoverWallet(mnemonic, 0);
        const rootAddr = rootAddress.address;
        console.log(`Root address: ${rootAddr}`);
        const activeAddresses = keys.activeAddresses || {};
        console.log(`Found ${Object.keys(activeAddresses).length} active addresses`);
        console.log('Calculating total available balance...');
        console.log('Checking root address balance...');
        const rootBalance = await getBalanceWithRetry(freshWeb3, rootAddr);
        console.log(`Root address balance: ${rootBalance} ETH`);
        console.log(`Checking balances of ${Object.keys(activeAddresses).length} active addresses...`);
        const addressBalances = [];
        let totalBalanceEth = parseFloat(rootBalance);
        for (const addr in activeAddresses) {
            const addrInfo = activeAddresses[addr];
            if (addrInfo.isWrongPayment === true || addrInfo.wrongPayment === true || addrInfo.status === 'wrong') {
                console.log(`Skipping wrong payment address: ${addr}`);
                continue;
            }
            console.log(`Checking balance for ${addr}...`);
            const balance = await getBalanceWithRetry(freshWeb3, addr);
            console.log(`Address ${addr} balance: ${balance} ETH`);
            addressBalances.push({
                address: addr,
                balance: parseFloat(balance),
                ethBalance: balance,
                index: addrInfo.index
            });
            totalBalanceEth += parseFloat(balance);
        }
        if (totalBalanceEth <= 0) {
            return res.status(400).json({
                success: false,
                error: 'No funds available to transfer'
            });
        }
        
        // Sort addresses by balance (highest first)
        addressBalances.sort((a, b) => b.balance - a.balance);
        
        console.log(`Total balance: ${totalBalanceEth} ETH`);
        console.log(`Addresses with balance: ${addressBalances.length}`);
        
        // Calculate transaction cost first to determine how much we can actually send
        const gasPrice = await getReliableGasPrice(freshWeb3);
        const gasLimit = 21000; // Basic ETH transfer
        const gasCostWei = BigInt(gasPrice) * BigInt(gasLimit);
        const gasCostEth = parseFloat(freshWeb3.utils.fromWei(gasCostWei.toString(), 'ether'));
        console.log(`Estimated gas cost per transaction: ${gasCostEth} ETH`);
        
        // Choose the address with the highest balance to use for the consolidation
        let selectedAddress;
        let selectedWallet;
        let selectedBalance;
        
        // First try the root address if it has enough funds
        if (parseFloat(rootBalance) >= gasCostEth * 1.2) { // 20% buffer for gas price fluctuations
            console.log('Root address has sufficient balance for gas costs, using it as the sending address');
            selectedAddress = rootAddr;
            selectedWallet = rootAddress;
            selectedBalance = parseFloat(rootBalance);
        } else if (addressBalances.length > 0 && addressBalances[0].balance >= gasCostEth * 1.2) {
            // Otherwise use the address with the highest balance
            const topAddress = addressBalances[0];
            console.log(`Using address with highest balance: ${topAddress.address} (${topAddress.balance} ETH)`);
            try {
                // Find the wallet for this address
                const { wallet, index } = await findWalletForAddress(mnemonic, topAddress.address);
                if (wallet) {
                    selectedAddress = topAddress.address;
                    selectedWallet = wallet;
                    selectedBalance = topAddress.balance;
                    console.log(`Found wallet for address ${selectedAddress} at index ${index}`);
                } else {
                    throw new Error(`Could not find wallet for address ${topAddress.address}`);
                }
            } catch (error) {
                console.error('Error finding wallet for address:', error);
                return res.status(500).json({
                    success: false,
                    error: `Could not find wallet for selected address: ${error.message}`
                });
            }
        } else {
            console.error('No address has sufficient balance to cover gas costs');
            return res.status(400).json({
                success: false,
                error: `No address has sufficient balance to cover gas costs. Need at least ${gasCostEth * 1.2} ETH.`
            });
        }
        
        // Calculate the amount to send (total balance minus gas cost)
        let sendAmount = selectedBalance - (gasCostEth * 1.1); // 10% buffer
        
        // Convert to Wei
        let sendAmountWei;
        try {
            sendAmountWei = freshWeb3.utils.toWei(sendAmount.toString(), 'ether');
        } catch (error) {
            console.error('Error converting amount to Wei:', error);
            return res.status(500).json({
                success: false,
                error: `Error converting amount to Wei: ${error.message}`
            });
        }
        
        console.log(`Sending ${sendAmount} ETH from ${selectedAddress} to merchant address ${normalizedMerchantAddress}`);
        
        // Get nonce for sender
        const nonce = await getReliableNonce(freshWeb3, selectedAddress);
        console.log(`Nonce for ${selectedAddress}: ${nonce}`);
        
        // Create and sign transaction
        const txObject = {
            from: selectedAddress,
            to: normalizedMerchantAddress,
            value: sendAmountWei,
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce
        };
        
        console.log('Transaction object:', txObject);
        
        // Sign the transaction
        console.log('Signing transaction...');
        const signedTx = await freshWeb3.eth.accounts.signTransaction(txObject, selectedWallet.privateKey);
        console.log('Transaction signed');
        
        // Send transaction with retry
        console.log('Sending transaction...');
        let txReceipt;
        try {
            txReceipt = await sendTransactionWithRetry(freshWeb3, signedTx);
            console.log('Transaction sent, hash:', txReceipt.transactionHash);
        } catch (txError) {
            console.error('Failed to send transaction:', txError);
            return res.status(500).json({
                success: false,
                error: `Failed to send transaction: ${txError.message}`
            });
        }
        
        // Log the transaction
        const txLogEntry = {
            txHash: txReceipt.transactionHash,
            from: selectedAddress,
            to: normalizedMerchantAddress,
            amount: sendAmount.toString(),
            timestamp: new Date().toISOString(),
            status: 'pending',
            type: 'release',
            gasUsed: txReceipt.gasUsed || gasLimit.toString(),
            gasPrice: freshWeb3.utils.fromWei(gasPrice, 'gwei') + ' gwei'
        };
        
        // Save to transaction log
        saveTxLog(txLogEntry);
        
        // Start monitoring transaction for confirmation
        const monitorTransaction = async () => {
            try {
                const receipt = await checkTransactionReceipt(freshWeb3, txReceipt.transactionHash);
                if (receipt) {
                    const confirmations = receipt.confirmations || 0;
                    console.log(`Transaction confirmed with ${confirmations} confirmations`);
                    // Update transaction log with confirmed status
                    updateTransactionLog(txReceipt.transactionHash, {
                        status: true,
                        confirmations,
                        completedAt: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Error monitoring transaction:', error);
            }
        };
        
        // Start monitoring in background
        setTimeout(monitorTransaction, 5000);
        
        // Return success response immediately
        return res.json({
            success: true,
            txHash: txReceipt.transactionHash,
            amount: sendAmount.toString(),
            from: selectedAddress,
            to: normalizedMerchantAddress
        });
    } catch (error) {
        console.error('Error in release-all-funds endpoint:', error);
        console.error('Stack trace:', error.stack);
        return res.status(500).json({
            success: false,
            error: `Internal server error: ${error.message}`
        });
    }
};

// Modularized version of /api/release-funds from server.js
exports.releaseFunds = async (req, res) => {
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
    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Amount must be a positive number'
        });
    }
    console.log('====================', 'FUND RELEASE REQUEST', '====================');
    console.log(`Request received to release ${amount} ETH`);
    try {
        const merchantAddress = process.env.MERCHANT_ADDRESS || DEFAULT_MERCHANT_ADDRESS;
        const normalizedMerchantAddress = normalizeAddress(merchantAddress);
        if (!normalizedMerchantAddress) {
            console.error(`Invalid merchant address format: ${merchantAddress}`);
            return res.status(400).json({
                success: false,
                error: 'Invalid merchant address format. Please check your .env configuration.'
            });
        }
        
        console.log(`Merchant address verified: ${normalizedMerchantAddress}`);
        console.log(`Requested amount: ${amount} ETH`);
        logBlockchain('FUNDS_RELEASE_REQUESTED', { amount });
        const freshWeb3 = await getFreshProvider();
        console.log('Web3 provider initialized successfully');
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        const rootAddress = await recoverWallet(mnemonic, 0);
        const rootAddr = rootAddress.address;
        console.log(`Root address: ${rootAddr}`);
        const activeAddresses = keys.activeAddresses || {};
        console.log(`Found ${Object.keys(activeAddresses).length} active addresses`);
        console.log('Checking root address balance...');
        const rootBalance = await getBalanceWithRetry(freshWeb3, rootAddr);
        console.log(`Root address balance: ${rootBalance} ETH`);
        const addressBalances = [];
        let totalBalanceEth = parseFloat(rootBalance);
        for (const addr in activeAddresses) {
            const addrInfo = activeAddresses[addr];
            if (addrInfo.isWrongPayment === true || addrInfo.wrongPayment === true || addrInfo.status === 'wrong') {
                console.log(`Skipping wrong payment address: ${addr}`);
                continue;
            }
            console.log(`Checking balance for ${addr}...`);
            const balance = await getBalanceWithRetry(freshWeb3, addr);
            console.log(`Address ${addr} balance: ${balance} ETH`);
            if (parseFloat(balance) > 0) {
                addressBalances.push({
                    address: addr,
                    balance: parseFloat(balance),
                    ethBalance: balance,
                    index: addrInfo.index
                });
            }
            totalBalanceEth += parseFloat(balance);
        }
        if (totalBalanceEth < requestedAmount) {
            console.warn(`Insufficient balance. Requested: ${requestedAmount} ETH, Available: ${totalBalanceEth} ETH`);
            return res.status(400).json({
                success: false,
                error: `Insufficient balance. Requested: ${requestedAmount} ETH, Available: ${totalBalanceEth} ETH`
            });
        }
        
        // First try to use root address if it has sufficient balance
        if (parseFloat(rootBalance) >= requestedAmount) {
            // Root address has enough funds, proceed with transaction
            console.log(`Root address has sufficient balance (${rootBalance} ETH). Using it for the transfer.`);
            
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
                    // Otherwise transaction failed, should send a new one
                    console.log(`Previous transaction failed, sending a new one`);
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
                    to: normalizedMerchantAddress,
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
                    to: normalizedMerchantAddress,
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
                    to: normalizedMerchantAddress,
                    amount: amount,
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
            console.log(`Root address has insufficient balance. Checking ${addressBalances.length} active addresses...`);
            
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
                    console.warn(`Index for address ${highestBalanceAddr.address} was undefined. Attempting to find wallet...`);
                    
                    try {
                        // Find the wallet for this address
                        const result = await findWalletForAddress(mnemonic, highestBalanceAddr.address);
                        if (result && result.wallet) {
                            senderIndex = result.index;
                            console.log(`Found wallet for address ${highestBalanceAddr.address} at index ${senderIndex}`);
                            
                            // Update our records for future use
                            updateAddressIndex(highestBalanceAddr.address, senderIndex);
                        } else {
                            throw new Error(`Could not find wallet for address ${highestBalanceAddr.address}`);
                        }
                    } catch (walletError) {
                        console.error('Error finding wallet for address:', walletError);
                        return res.status(500).json({
                            success: false,
                            error: `Could not find wallet for address: ${walletError.message}`
                        });
                    }
                }

                // Recover the wallet for this address using the validated index
                console.log(`Recovering wallet for index ${senderIndex}...`);
                const senderWallet = await recoverWallet(mnemonic, senderIndex);
                
                // Verify address matches (case-insensitive compare)
                if (senderWallet.address.toLowerCase() !== highestBalanceAddr.address.toLowerCase()) {
                    console.error(`Address mismatch! Expected: ${highestBalanceAddr.address}, Got: ${senderWallet.address}`);
                    
                    // Try a different approach - search through more indices to find the matching wallet
                    console.log(`Searching for wallet matching address ${highestBalanceAddr.address}...`);
                    const foundWallet = await findWalletForAddress(mnemonic, highestBalanceAddr.address);
                    
                    if (!foundWallet || !foundWallet.wallet) {
                        throw new Error('Address derivation mismatch - could not find matching wallet');
                    }
                    
                    console.log(`Found wallet with matching address at index ${foundWallet.index}`);
                    senderWallet = foundWallet.wallet;
                    senderIndex = foundWallet.index;
                    
                    // Update our records for future use
                    updateAddressIndex(highestBalanceAddr.address, senderIndex);
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
                    to: normalizedMerchantAddress,
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
                    to: normalizedMerchantAddress,
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
                    to: normalizedMerchantAddress,
                    amount: amount,
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
};

// exports.getWrongPayments = async (req, res) => {
//     ...
// };

exports.getCryptoPrices = async (req, res) => {
    const fetch = require('node-fetch');
    const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    if (!global.cryptoPriceCache) {
        global.cryptoPriceCache = { data: null, timestamp: 0 };
    }
    // Check cache first
    const now = Date.now();
    if (global.cryptoPriceCache.data && (now - global.cryptoPriceCache.timestamp < CACHE_DURATION_MS)) {
        return res.json(global.cryptoPriceCache.data);
    }
    try {
        const apiKey = process.env.CMC_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'CoinMarketCap API key not set in .env (CMC_API_KEY)' });
        }
        // Fetch ETH, MATIC, BNB by ID from CoinMarketCap in AUD
        const cmcUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=1027,3890,1839&convert=AUD';
        const cmcResponse = await fetch(cmcUrl, {
            headers: {
                'X-CMC_PRO_API_KEY': apiKey,
                'Accept': 'application/json'
            }
        });
        if (!cmcResponse.ok) {
            if (global.cryptoPriceCache.data) {
                return res.json(global.cryptoPriceCache.data); 
            }
            return res.status(502).json({ error: 'Failed to fetch prices from CoinMarketCap' });
        }
        const cmcData = await cmcResponse.json();
        // Extract prices by ID (AUD)
        let maticPrice = cmcData.data['3890']?.quote?.AUD?.price || null;
        // Fallback to CoinGecko if MATIC is null
        if (!maticPrice) {
            try {
                const cgkUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=aud';
                const cgkResponse = await fetch(cgkUrl);
                if (cgkResponse.ok) {
                    const cgkData = await cgkResponse.json();
                    maticPrice = cgkData['matic-network']?.aud || null;
                    if (!maticPrice) {
                        const altCgkUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=polygon&vs_currencies=aud';
                        const altCgkResponse = await fetch(altCgkUrl);
                        if (altCgkResponse.ok) {
                            const altCgkData = await altCgkResponse.json();
                            maticPrice = altCgkData['polygon']?.aud || null;
                        }
                    }
                }
            } catch (maticError) {}
        }
        const freshPrices = {
            ETH: cmcData.data['1027']?.quote?.AUD?.price || null,
            MATIC: maticPrice,
            BNB: cmcData.data['1839']?.quote?.AUD?.price || null
        };
        // Update cache
        global.cryptoPriceCache = {
            data: freshPrices,
            timestamp: now
        };
        return res.json(freshPrices);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch crypto prices' });
    }
};

exports.getAdminStatistics = async (req, res) => {
    try {
      const view = req.query.view;
      let stats = {};
      const path = require('path');
      const fs = require('fs');
      if (view === 'user') {
        // Read keys.json
        let keysPath = path.join(__dirname, '../../Json/keys.json');
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
        let merchantPath = path.join(__dirname, '../../merchant_transactions.json');
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
  };

// Modularized version of /api/wallet-balance from server.js
// const { getFreshProvider, getBalanceWithRetry } = require('../utils/web3Utils');
// const { secureReadFile } = require('../utils/fileUtils');

exports.getWalletBalance = async (req, res) => {
    try {
        // Check rate limit for this endpoint
        const rateLimitKey = `rateLimit:wallet-balance:${req.ip}`;
        if (global[rateLimitKey] && global[rateLimitKey] > 10) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again later.'
            });
        }
        global[rateLimitKey] = (global[rateLimitKey] || 0) + 1;
        setTimeout(() => {
            global[rateLimitKey]--;
        }, 60000);
        res.set('Cache-Control', 'private, max-age=10');
        const cachedBalanceKey = 'wallet_balance_cache';
        const cachedBalanceTimestampKey = 'wallet_balance_timestamp';
        const cachedTimestamp = global[cachedBalanceTimestampKey] || 0;
        const forceRefresh = req.query.force === 'true';
        if (!forceRefresh && global[cachedBalanceKey] && (Date.now() - cachedTimestamp) < 10000) {
            console.log('Returning cached wallet balance (< 10 seconds old)');
            return res.json(global[cachedBalanceKey]);
        }
        console.log('Fetching fresh wallet balances');
        const startTime = Date.now();
        const keys = getStoredKeys();
        const merchantAddress = process.env.MERCHANT_ADDRESS || process.env.MERCHANT_ADDRESS;
        const activeAddresses = keys.activeAddresses || {};
        const freshWeb3 = await getFreshProvider();
        const balances = new Map();
        const checkAddressPromises = [];
        async function getAddressBalanceWithTimeout(address, info, timeoutMs) {
            try {
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
        for (const [address, info] of Object.entries(activeAddresses)) {
            if (info.isWrongPayment === true || info.wrongPayment === true) {
                checkAddressPromises.push(getAddressBalanceWithTimeout(address, {...info, isWrongPayment: true}, 3000));
            } else {
                checkAddressPromises.push(getAddressBalanceWithTimeout(address, info, 3000));
            }
        }
        const addressResults = await Promise.allSettled(checkAddressPromises);
        const hdWalletAddresses = [];
        let totalHdWalletBalance = 0;
        let wrongPaymentsBalanceTotal = 0;
        for (const result of addressResults) {
            if (result.status === 'fulfilled' && result.value) {
                const { address, balance, info } = result.value;
                const addressData = {
                    address,
                    balance,
                    rawBalance: balance,
                    ...info
                };
                hdWalletAddresses.push(addressData);
                try {
                    const addrBalance = parseFloat(balance) || 0;
                    if (info.isWrongPayment !== true && info.wrongPayment !== true) {
                        totalHdWalletBalance += addrBalance;
                    } else {
                        // wrongPaymentsBalanceTotal += addrBalance;
                    }
                } catch (error) {
                    console.error(`Error processing balance for ${address}:`, error);
                }
            }
        }
        const txFile = 'merchant_transactions.json';
        let transactions = [];
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
                if (fileContent && fileContent.trim()) {
                    transactions = JSON.parse(fileContent);
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
        let pendingBalanceWei = BigInt(0);
        let verifiedBalanceWei = BigInt(0);
        for (const tx of transactions) {
            if (tx.type !== 'payment' || !tx.amount) continue;
            if (tx.amountVerified === false || tx.isWrongPayment === true || tx.wrongPayment === true || tx.status === 'wrong') continue;
            
            try {
                let amountWei;
                let amountStr = tx.amount ? tx.amount.toString() : "0";
                
                if (amountStr.includes('.')) {
                    amountWei = web3.utils.toWei(amountStr, 'ether'); 
                } else {
                    amountWei = amountStr;
                }

                let amountBigInt = BigInt(0);
                try {
                    amountBigInt = BigInt(amountWei);
                } catch (bigIntError) {
                    console.error(`[WARN] Could not convert amountWei to BigInt: '${amountWei}' for tx:`, tx);
                    continue;
                }
                
                if (tx.status === 'confirmed' || tx.status === 'verified') {
                    verifiedBalanceWei += amountBigInt;
                } else if (tx.status === 'pending' || tx.status === 'processing') {
                    pendingBalanceWei += amountBigInt;
                }
            } catch (error) {
                console.error('[ERROR] Processing transaction amount for pending/verified balance:', error, tx);
            }
        }
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
            console.log('[DEBUG] wrongPayments array:', JSON.stringify(wrongPayments, null, 2));
            console.log('[DEBUG] wrongPaymentsCount before sum:', wrongPaymentsCount);
            if (wrongPaymentsCount > 0) {
                let totalWei = BigInt(0);
                for (const tx of wrongPayments) {
                    let amountStr = tx.amount ? tx.amount.toString() : "0";
                    try {
                        let amountWei = web3.utils.toWei(amountStr, 'ether');
                        totalWei += BigInt(amountWei);
                        console.log('[DEBUG] Summing wrong payment:', amountStr, '->', amountWei);
                    } catch (e) {
                        console.error('Error converting amount to wei:', amountStr, e);
                    }
                }
                wrongPaymentsAmount = web3.utils.fromWei(totalWei.toString(), 'ether');
                console.log('[DEBUG] wrongPaymentsCount:', wrongPaymentsCount);
                console.log('[DEBUG] totalWei:', totalWei.toString());
                console.log('[DEBUG] wrongPaymentsAmount:', wrongPaymentsAmount);
            }
        } catch (countError) {
            console.error('Error counting wrong payments:', countError);
        }
    } catch (error) {
        console.error('[FATAL] Error in getWalletBalance:', error);
        console.error('Stack trace:', error.stack);
        logToFile(`[FATAL] Error in getWalletBalance: ${error.message} ${error.stack}`);
        console.log('===========================================================');
        res.status(500).json({
            success: false,
            error: `Failed to fetch wallet balance: ${error.message}`
        });
    }

    return res.json({
        success: true,
        addresses: hdWalletAddresses.filter(a => !a.isWrongPayment && !a.wrongPayment),
        totalBalance: totalHdWalletBalance.toString(),
        pendingBalance: pendingBalanceWei.toString(),
        verifiedBalance: verifiedBalanceWei.toString(),
        wrongPaymentAddresses: hdWalletAddresses.filter(a => a.isWrongPayment || a.wrongPayment),
        wrongPaymentsBalance: wrongPaymentsAmount,
        wrongPaymentsCount: wrongPaymentsCount,
        wrongPayments: wrongPaymentsCount,
        wrongPaymentsAmount: wrongPaymentsAmount
    });
};

// ... (rest of the existing code)
   