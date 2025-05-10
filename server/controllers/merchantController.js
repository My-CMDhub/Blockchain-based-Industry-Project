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
const path = require('path');

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
        console.log('Getting merchant transactions...');
        let transactions = [];
        const txFile = 'merchant_transactions.json';

        // Setup database status object
        let dbStatus = {
            isCorrupted: false,
            backupCreated: false,
            isMissing: false,
            dataLoss: false,
            recoveryPossible: false,
            errorDetails: null,
            lastBackup: null
        };

        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
                
                if (!fileContent || !fileContent.trim()) {
                    dbStatus.isCorrupted = true;
                    dbStatus.errorDetails = "Transaction file exists but is empty";
                    console.error('ERROR: Transaction file exists but is empty');
                } else {
                    try {
                        transactions = JSON.parse(fileContent);
                        
                        if (!Array.isArray(transactions)) {
                            dbStatus.isCorrupted = true;
                            dbStatus.errorDetails = "Transaction data is not in expected format (not an array)";
                            console.error('ERROR: Transaction data is not an array');
                            
                            // Create backup of corrupted file using the new system
                            const backupFile = createDatabaseBackup(txFile, 'corruption');
                            dbStatus.backupCreated = !!backupFile;
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
                            
                            // Look for backups using our new helper functions
                            const backupFiles = findAllBackupFiles('merchant_transactions');
                            
                            if (backupFiles.length > 0) {
                                // Latest backup is first in the array
                                const latestBackup = backupFiles[0];
                                dbStatus.lastBackup = latestBackup;
                                dbStatus.recoveryPossible = true;
                            }
                        }
                    } catch (parseError) {
                        // JSON parsing failed
                        dbStatus.isCorrupted = true;
                        dbStatus.errorDetails = `Invalid JSON format: ${parseError.message}`;
                        console.error('ERROR: Failed to parse transaction JSON:', parseError);
                        
                        // Create backup of corrupted file using the new system
                        const backupFile = createDatabaseBackup(txFile, 'corruption');
                        dbStatus.backupCreated = !!backupFile;
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
            
            // Check if we have backup files using our helper
            const backupFiles = findAllBackupFiles('merchant_transactions');
            
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
                    // Most recent backup is the first in the sorted array
                    const latestBackup = backupFiles[0];
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
        
        // Add root address to our list if it has a balance
        if (parseFloat(rootBalance) > 0) {
            addressBalances.push({
                address: rootAddr,
                balance: parseFloat(rootBalance),
                ethBalance: rootBalance,
                index: 0,
                wallet: rootAddress
            });
        }
        
        // Check all active addresses for balances
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
        
        // Calculate transaction cost to determine which addresses can send funds
        const gasPrice = await getReliableGasPrice(freshWeb3);
        const gasLimit = 21000; // Basic ETH transfer
        const gasCostWei = BigInt(gasPrice) * BigInt(gasLimit);
        const gasCostEth = parseFloat(freshWeb3.utils.fromWei(gasCostWei.toString(), 'ether'));
        console.log(`Estimated gas cost per transaction: ${gasCostEth} ETH`);
        
        // Identify which addresses have enough balance to cover gas costs
        const viableAddresses = [];
        let totalReleasableEth = 0;
        
        for (const addrInfo of addressBalances) {
            // Instead of checking for a 20% buffer, just check it has enough for gas
            // Check if this address has a non-zero balance
            if (addrInfo.balance > 0) {
                // For root address, we already have the wallet
                if (addrInfo.address === rootAddr && addrInfo.wallet) {
                    viableAddresses.push(addrInfo);
                    // Calculate exact releasable amount based on gas cost
                    const releasableAmount = Math.max(0, addrInfo.balance - gasCostEth);
                    totalReleasableEth += releasableAmount;
                    console.log(`Root address ${addrInfo.address} has ${addrInfo.balance} ETH, can release ${releasableAmount} ETH`);
                    continue;
                }
                
                try {
                    // Find or recover the wallet for this address
                    const { wallet, index } = await findWalletForAddress(mnemonic, addrInfo.address);
                if (wallet) {
                        addrInfo.wallet = wallet;
                        addrInfo.index = index;
                        viableAddresses.push(addrInfo);
                        // Calculate exact releasable amount based on gas cost
                        const releasableAmount = Math.max(0, addrInfo.balance - gasCostEth);
                        totalReleasableEth += releasableAmount;
                        console.log(`Address ${addrInfo.address} has ${addrInfo.balance} ETH, can release ${releasableAmount} ETH`);
                } else {
                        console.warn(`Could not find wallet for address ${addrInfo.address}, skipping`);
                }
            } catch (error) {
                    console.error(`Error recovering wallet for address ${addrInfo.address}:`, error);
            }
        } else {
                console.log(`Address ${addrInfo.address} has zero balance, skipping`);
            }
        }
        
        if (viableAddresses.length === 0) {
            return res.status(400).json({
                success: false,
                error: `No addresses with funds found. Please check your wallet balance.`
            });
        }
        
        console.log(`Found ${viableAddresses.length} addresses with sufficient balance for transfers`);
        console.log(`Total releasable amount: ${totalReleasableEth.toFixed(8)} ETH`);
        
        // Prepare to track all transactions
        const transactions = [];
        let totalAmountSent = 0;
        
        // Process each viable address and send its funds
        for (const addrInfo of viableAddresses) {
            try {
                console.log(`Processing address ${addrInfo.address} with balance ${addrInfo.ethBalance} ETH`);
                
                // Calculate the amount to send - use the full balance minus exact gas
                // Instead of leaving a buffer, calculate exactly what we need for gas
                let addrBalanceWei;
                try {
                    addrBalanceWei = freshWeb3.utils.toBN(freshWeb3.utils.toWei(addrInfo.ethBalance, 'ether'));
        } catch (error) {
                    console.error(`Error converting balance to Wei for address ${addrInfo.address}:`, error);
                    continue;
                }
                
                // Calculate gas cost in Wei precisely
                const gasCostWeiBN = freshWeb3.utils.toBN(gasCostWei.toString());
                
                // Check if this is a dust amount (very small balance that's close to or less than gas cost)
                const isDustAmount = addrBalanceWei.lte(gasCostWeiBN) || 
                                    addrBalanceWei.lt(freshWeb3.utils.toBN(freshWeb3.utils.toWei('0.0001', 'ether')));
                
                // For dust amounts, try alternative approach
                if (isDustAmount) {
                    console.log(`Address ${addrInfo.address} has dust amount (${addrInfo.ethBalance} ETH). Attempting special handling...`);
                    
                    // Try with minimal gas price for dust amounts
                    const minimalGasPrice = freshWeb3.utils.toWei('0.1', 'gwei');
                    const minimalGasCostWei = BigInt(minimalGasPrice) * BigInt(gasLimit);
                    const minimalGasCostWeiBN = freshWeb3.utils.toBN(minimalGasCostWei.toString());
                    
                    if (addrBalanceWei.gt(minimalGasCostWeiBN)) {
                        // We can send with minimal gas
                        const sendAmountWei = addrBalanceWei.sub(minimalGasCostWeiBN);
                        const sendAmountEth = freshWeb3.utils.fromWei(sendAmountWei.toString(), 'ether');
                        
                        console.log(`Using minimal gas price for dust amount. Sending ${sendAmountEth} ETH from ${addrInfo.address}`);
                        
                        // Get nonce for sender
                        const nonce = await getReliableNonce(freshWeb3, addrInfo.address);
                        console.log(`Nonce for ${addrInfo.address}: ${nonce}`);
                        
                        const txObject = {
                            from: addrInfo.address,
                            to: normalizedMerchantAddress,
                            value: sendAmountWei.toString(),
                            gas: gasLimit,
                            gasPrice: minimalGasPrice,
                            nonce: nonce,
                            // For dust, use legacy (type 0) transactions
                            type: '0x0'
                        };
                        
                        try {
                            console.log('Signing minimal gas dust transaction...');
                            const signedTx = await freshWeb3.eth.accounts.signTransaction(
                                txObject, 
                                addrInfo.wallet.privateKey
                            );
                            
                            console.log('Sending dust transaction...');
                            const txReceipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                            
                            console.log('Dust transaction sent, hash:', txReceipt.transactionHash);
                            
                            // Add to successful transactions list
                            transactions.push({
                                txHash: txReceipt.transactionHash,
                                from: addrInfo.address,
                                amount: sendAmountEth.toString(),
                                status: 'pending',
                                isDust: true
                            });
                            
                            totalAmountSent += parseFloat(sendAmountEth);
                            
                            // Log the transaction
                            const txLogEntry = {
                                txHash: txReceipt.transactionHash,
                                from: addrInfo.address,
                                to: normalizedMerchantAddress,
                                amount: sendAmountEth,
                                timestamp: new Date().toISOString(),
                                status: true,
                                type: 'release',
                                gasUsed: gasLimit,
                                gasPrice: `${parseFloat(freshWeb3.utils.fromWei(minimalGasPrice, 'gwei'))} gwei`,
                                completedAt: new Date().toISOString(),
                                lastUpdated: new Date().toISOString(),
                                txId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                                isDust: true
                            };
                            
                            // Write to transaction log
                            await logTransaction(txLogEntry);
                            
                            continue; // Skip the normal flow for this address
                        } catch (dustError) {
                            console.error(`Failed to send dust transaction: ${dustError.message}`);
                            // Fall through to standard approach as a backup
                        }
                    } else {
                        console.log(`Dust amount too small even for minimal gas price. Balance: ${addrInfo.ethBalance} ETH, Gas cost: ${freshWeb3.utils.fromWei(minimalGasCostWei.toString(), 'ether')} ETH`);
                    }
                    
                    // If the dust handling failed, try one more approach - send entire balance 
                    console.log(`Attempting to send entire balance for dust amount...`);
                    try {
                        const nonce = await getReliableNonce(freshWeb3, addrInfo.address);
                        
                        // Create a legacy transaction sending entire balance
                        // This will likely fail on the network but we try anyway
                        const txObject = {
                            from: addrInfo.address,
                            to: normalizedMerchantAddress,
                            value: addrBalanceWei.toString(),
                            gas: gasLimit,
                            gasPrice: freshWeb3.utils.toWei('0.1', 'gwei'),
                            nonce: nonce,
                            type: '0x0'
                        };
                        
                        console.log('Signing full balance dust transaction...');
                        const signedTx = await freshWeb3.eth.accounts.signTransaction(
                            txObject,
                            addrInfo.wallet.privateKey
                        );
                        
                        console.log('Sending full balance dust transaction...');
                        const txReceipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                        
                        console.log('Full balance dust transaction sent, hash:', txReceipt.transactionHash);
                        
                        // If we got here, the transaction somehow succeeded
                        transactions.push({
                            txHash: txReceipt.transactionHash,
                            from: addrInfo.address,
                            amount: addrInfo.ethBalance,
                            status: 'pending',
                            isDust: true,
                            fullBalance: true
                        });
                        
                        totalAmountSent += parseFloat(addrInfo.ethBalance);
                        
                        // Log the transaction
                        const txLogEntry = {
                            txHash: txReceipt.transactionHash,
                            from: addrInfo.address,
                            to: normalizedMerchantAddress,
                            amount: addrInfo.ethBalance,
                            timestamp: new Date().toISOString(),
                            status: true,
                            type: 'release',
                            gasUsed: gasLimit,
                            gasPrice: '0.1 gwei',
                            completedAt: new Date().toISOString(),
                            lastUpdated: new Date().toISOString(),
                            txId: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                            isDust: true,
                            fullBalance: true
                        };
                        
                        await logTransaction(txLogEntry);
                        continue;
                    } catch (fullDustError) {
                        console.error(`Failed to send full balance dust transaction: ${fullDustError.message}`);
                        console.log(`Will skip dust address ${addrInfo.address} as all approaches failed`);
                        continue; // Skip to next address
                    }
                }
                
                // Make sure we can cover the gas (for non-dust amounts)
                if (addrBalanceWei.lt(gasCostWeiBN)) {
                    console.log(`Address ${addrInfo.address} has insufficient balance for gas, skipping`);
                    continue;
                }
                
                // Calculate exact amount to send (all balance minus gas)
                const sendAmountWei = addrBalanceWei.sub(gasCostWeiBN);
                
                // Convert back to ETH for logging
                const sendAmountEth = freshWeb3.utils.fromWei(sendAmountWei.toString(), 'ether');
                console.log(`Sending ${sendAmountEth} ETH from ${addrInfo.address} to merchant address ${normalizedMerchantAddress}`);
        
        // Get nonce for sender
                const nonce = await getReliableNonce(freshWeb3, addrInfo.address);
                console.log(`Nonce for ${addrInfo.address}: ${nonce}`);
        
        // Create and sign transaction
        const txObject = {
                    from: addrInfo.address,
            to: normalizedMerchantAddress,
                    value: sendAmountWei.toString(),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce
        };
        
        console.log('Transaction object:', txObject);
        
        // Sign the transaction
        console.log('Signing transaction...');
                const signedTx = await freshWeb3.eth.accounts.signTransaction(txObject, addrInfo.wallet.privateKey);
        console.log('Transaction signed');
        
        // Send transaction with retry
        console.log('Sending transaction...');
        let txReceipt;
        try {
            txReceipt = await sendTransactionWithRetry(freshWeb3, signedTx);
            console.log('Transaction sent, hash:', txReceipt.transactionHash);
                    
                    // Add to successful transactions list
                    transactions.push({
                        txHash: txReceipt.transactionHash,
                        from: addrInfo.address,
                        amount: sendAmountEth.toString(),
                        status: 'pending'
                    });
                    
                    totalAmountSent += parseFloat(sendAmountEth);
        
        // Log the transaction
        const txLogEntry = {
            txHash: txReceipt.transactionHash,
                        from: addrInfo.address,
            to: normalizedMerchantAddress,
                        amount: sendAmountEth.toString(),
            timestamp: new Date().toISOString(),
            status: 'pending',
            type: 'release',
            gasUsed: txReceipt.gasUsed || gasLimit.toString(),
            gasPrice: freshWeb3.utils.fromWei(gasPrice, 'gwei') + ' gwei'
        };
        
        // Save to transaction log
        saveTxLog(txLogEntry);
        
                    // Start monitoring transaction for confirmation (in background)
                    setTimeout(async () => {
            try {
                const receipt = await checkTransactionReceipt(freshWeb3, txReceipt.transactionHash);
                if (receipt) {
                    const confirmations = receipt.confirmations || 0;
                                console.log(`Transaction ${txReceipt.transactionHash} confirmed with ${confirmations} confirmations`);
                    // Update transaction log with confirmed status
                    updateTransactionLog(txReceipt.transactionHash, {
                        status: true,
                        confirmations,
                        completedAt: new Date().toISOString()
                    });
                }
            } catch (error) {
                            console.error(`Error monitoring transaction ${txReceipt.transactionHash}:`, error);
                        }
                    }, 5000);
                    
                } catch (txError) {
                    console.error(`Failed to send transaction from ${addrInfo.address}:`, txError);
                    
                    // Add to failed transactions list
                    transactions.push({
                        from: addrInfo.address,
                        amount: sendAmountEth.toString(),
                        status: 'failed',
                        error: txError.message
                    });
                }
            } catch (addrError) {
                console.error(`Error processing address ${addrInfo.address}:`, addrError);
            }
        }
        
        // Check if we were able to send any transactions
        if (transactions.length === 0) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send any transactions'
            });
        }
        
        // Clean up zero balance addresses from activeAddresses
        await cleanupZeroBalanceAddresses();
        
        // Return success with all transaction info
        return res.json({
            success: true,
            message: `Successfully initiated release from ${transactions.length} addresses`,
            totalAmount: totalAmountSent.toString(),
            transactions: transactions,
            // For backward compatibility with client, also return the first transaction details
            txHash: transactions[0]?.txHash,
            amount: transactions[0]?.amount,
            from: transactions[0]?.from,
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

/**
 * Removes addresses with zero balance from activeAddresses in keys.json
 */
async function cleanupZeroBalanceAddresses() {
    try {
        // Read the keys file
        const keysPath = path.join(process.cwd(), 'Json', 'keys.json');
        const keysData = await secureReadFile(keysPath);
        
        if (!keysData || !keysData.activeAddresses) {
            console.log('No active addresses to clean up');
            return;
        }
        
        const web3 = getWeb3();
        const activeAddresses = { ...keysData.activeAddresses };
        const addressesToRemove = [];
        
        // Check each address balance
        for (const [address, info] of Object.entries(activeAddresses)) {
            try {
                const balance = await getBalanceWithRetry(web3, address);
                const balanceNum = parseFloat(balance);
                
                // If balance is zero or extremely close to zero, mark for removal
                if (balanceNum < 0.00000001) {
                    addressesToRemove.push(address);
                    console.log(`Marking address ${address} for removal - zero balance detected`);
                }
            } catch (err) {
                console.error(`Error checking balance for ${address}: ${err.message}`);
            }
        }
        
        // Remove the zero balance addresses
        if (addressesToRemove.length > 0) {
            for (const addr of addressesToRemove) {
                delete activeAddresses[addr];
                console.log(`Removed address ${addr} from activeAddresses`);
            }
            
            // Update the keys file
            keysData.activeAddresses = activeAddresses;
            await secureWriteFile(keysPath, keysData);
            console.log(`Cleaned up ${addressesToRemove.length} zero balance addresses`);
        } else {
            console.log('No zero balance addresses to clean up');
        }
    } catch (error) {
        console.error(`Error cleaning up zero balance addresses: ${error.message}`);
    }
}

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
                    
                    // If the difference is very small, we can adjust the send amount automatically
                    // instead of rejecting the transaction
                    const difference = requestedAmountWei - maxAmountWei;
                    const differenceEth = freshWeb3.utils.fromWei(difference.toString(), 'ether');
                    
                    // If the difference is under 0.0001 ETH, we can adjust automatically
                    if (difference < BigInt(freshWeb3.utils.toWei('0.0001', 'ether'))) {
                        console.log(`Difference is minimal (${differenceEth} ETH). Adjusting amount to send maximum possible.`);
                        
                        // Adjust requested amount to maximum sendable
                        const adjustedAmount = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                        console.log(`Adjusted amount to send: ${adjustedAmount} ETH`);
                        
                        // Prepare transaction data with adjusted amount
                        const txData = {
                            from: rootAddr,
                            to: normalizedMerchantAddress,
                            value: maxAmountWei.toString(),
                            gas: gasLimit,
                            gasPrice: gasPrice,
                            nonce: nonce
                        };
                        
                        console.log('Transaction data prepared with adjusted amount:', JSON.stringify(txData, null, 2));
                        
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
                            amount: adjustedAmount,
                            amountWei: maxAmountWei.toString(),
                            timestamp: new Date().toISOString(),
                            status: receipt.status,
                            blockNumber: receipt.blockNumber,
                            gasUsed: receipt.gasUsed,
                            type: 'release',
                            adjusted: true,
                            requestedAmount: amount,
                            note: `Amount adjusted from ${amount} ETH to ${adjustedAmount} ETH due to gas requirements`
                        };
                        
                        // Save transaction to log
                        saveTxLog(txLogEntry);
                        
                        // Clean up zero balance addresses
                        await cleanupZeroBalanceAddresses();
                        
                        // Return success response
                        return res.json({
                            success: true,
                            txHash: signedTx.transactionHash,
                            amount: adjustedAmount,
                            requestedAmount: amount,
                            adjusted: true,
                            timestamp: new Date().toISOString(),
                            blockNumber: receipt.blockNumber
                        });
                    } else {
                        // If the difference is not small, return an informative error as before
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance after gas fees. Available to send: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`
                    });
                    }
                }
                
                // If releasing all funds from the address, calculate exact amount minus gas
                if (Math.abs(rootBalance - requestedAmount) < 0.00001) {
                    console.log('Detected request to release all funds from address. Using precise calculation...');
                    
                    // Use the exact max amount that can be sent
                    const txData = {
                        from: rootAddr,
                        to: normalizedMerchantAddress,
                        value: maxAmountWei.toString(),
                        gas: gasLimit,
                        gasPrice: gasPrice,
                        nonce: nonce
                    };
                    
                    console.log('Transaction data prepared for full balance release:', JSON.stringify(txData, null, 2));
                    
                    // Sign transaction with exact amount
                    console.log('Signing full balance transaction...');
                    const signedTx = await freshWeb3.eth.accounts.signTransaction(txData, rootAddress.privateKey);
                    console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
                    
                    // Send transaction with retry mechanism
                    console.log('Sending transaction with retry...');
                    const receipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                    console.log('Transaction successfully sent and confirmed!');
                    console.log(`Transaction hash: ${receipt.transactionHash}`);
                    console.log(`Block number: ${receipt.blockNumber}`);
                    console.log(`Gas used: ${receipt.gasUsed}`);
                    
                    // Calculate actual amount sent (original minus gas)
                    const actualAmount = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                    
                    // Record the transaction
                    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const txLogEntry = {
                        txId: txId,
                        txHash: signedTx.transactionHash,
                        from: rootAddr,
                        to: normalizedMerchantAddress,
                        amount: actualAmount,
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
                    
                    // Clean up zero balance addresses
                    await cleanupZeroBalanceAddresses();
                    
                    // Return success response
                    return res.json({
                        success: true,
                        txHash: signedTx.transactionHash,
                        amount: actualAmount,
                        timestamp: new Date().toISOString(),
                        blockNumber: receipt.blockNumber,
                        fullBalance: true
                    });
                }
                
                // Standard release for exact amount
                // Prepare transaction data for standard amount-specified release
                const txData = {
                    from: rootAddr,
                    to: normalizedMerchantAddress,
                    value: freshWeb3.utils.toHex(requestedAmountWei.toString()),
                    gas: gasLimit,
                    gasPrice: gasPrice,
                    nonce: nonce
                };
                
                console.log('Transaction data prepared for standard amount-specified release:', JSON.stringify(txData, null, 2));
                
                // Sign transaction with exact amount
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
                
                // Calculate actual amount sent (original minus gas)
                const actualAmount = freshWeb3.utils.fromWei(requestedAmountWei.toString(), 'ether');
                
                // Record the transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const txLogEntry = {
                    txId: txId,
                    txHash: signedTx.transactionHash,
                    from: rootAddr,
                    to: normalizedMerchantAddress,
                    amount: actualAmount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    type: 'release',
                    requestedAmount: amount
                };
                
                // Save transaction to log
                saveTxLog(txLogEntry);
                
                // Clean up zero balance addresses
                await cleanupZeroBalanceAddresses();
                
                // Return success response
                return res.json({
                    success: true,
                    txHash: signedTx.transactionHash,
                    amount: actualAmount,
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
                    
                    // If the difference is very small, we can adjust the send amount automatically
                    // instead of rejecting the transaction
                    const difference = requestedAmountWei - maxAmountWei;
                    const differenceEth = freshWeb3.utils.fromWei(difference.toString(), 'ether');
                    
                    // If the difference is under 0.0001 ETH, we can adjust automatically
                    if (difference < BigInt(freshWeb3.utils.toWei('0.0001', 'ether'))) {
                        console.log(`Difference is minimal (${differenceEth} ETH). Adjusting amount to send maximum possible.`);
                        
                        // Adjust requested amount to maximum sendable
                        const adjustedAmount = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                        console.log(`Adjusted amount to send: ${adjustedAmount} ETH`);
                        
                        // Prepare transaction data with adjusted amount
                        const txData = {
                            from: highestBalanceAddr.address,
                            to: normalizedMerchantAddress,
                            value: maxAmountWei.toString(),
                            gas: gasLimit,
                            gasPrice: gasPrice,
                            nonce: nonce
                        };
                        
                        console.log('Transaction data prepared with adjusted amount:', JSON.stringify(txData, null, 2));
                        
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
                            amount: adjustedAmount,
                            amountWei: maxAmountWei.toString(),
                            timestamp: new Date().toISOString(),
                            status: receipt.status,
                            blockNumber: receipt.blockNumber,
                            gasUsed: receipt.gasUsed,
                            type: 'release',
                            adjusted: true,
                            requestedAmount: amount,
                            note: `Amount adjusted from ${amount} ETH to ${adjustedAmount} ETH due to gas requirements`
                        };
                        
                        // Save transaction to log
                        saveTxLog(txLogEntry);
                        
                        // Clean up zero balance addresses
                        await cleanupZeroBalanceAddresses();
                        
                        // Return success response
                        return res.json({
                            success: true,
                            txHash: signedTx.transactionHash,
                            amount: adjustedAmount,
                            requestedAmount: amount,
                            adjusted: true,
                            timestamp: new Date().toISOString(),
                            blockNumber: receipt.blockNumber
                        });
                    } else {
                        // If the difference is not small, return an informative error as before
                    return res.status(400).json({
                        success: false,
                        error: `Insufficient balance after gas fees. Available to send: ${freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether')} ETH`
                    });
                    }
                }
                
                // If releasing all funds from the address, calculate exact amount minus gas
                if (Math.abs(highestBalanceAddr.balance - requestedAmount) < 0.00001) {
                    console.log('Detected request to release all funds from address. Using precise calculation...');
                    
                    // Use the exact max amount that can be sent
                    const txData = {
                        from: highestBalanceAddr.address,
                        to: normalizedMerchantAddress,
                        value: maxAmountWei.toString(),
                        gas: gasLimit,
                        gasPrice: gasPrice,
                        nonce: nonce
                    };
                    
                    console.log('Transaction data prepared for full balance release:', JSON.stringify(txData, null, 2));
                    
                    // Sign transaction with exact amount
                    console.log('Signing full balance transaction...');
                    const signedTx = await freshWeb3.eth.accounts.signTransaction(txData, senderWallet.privateKey);
                    console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
                    
                    // Send transaction with retry mechanism
                    console.log('Sending transaction with retry...');
                    const receipt = await sendTransactionWithRetry(freshWeb3, signedTx);
                    console.log('Transaction successfully sent and confirmed!');
                    console.log(`Transaction hash: ${receipt.transactionHash}`);
                    console.log(`Block number: ${receipt.blockNumber}`);
                    console.log(`Gas used: ${receipt.gasUsed}`);
                    
                    // Calculate actual amount sent (original minus gas)
                    const actualAmount = freshWeb3.utils.fromWei(maxAmountWei.toString(), 'ether');
                    
                    // Record the transaction
                    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const txLogEntry = {
                        txId: txId,
                        txHash: signedTx.transactionHash,
                        from: highestBalanceAddr.address,
                        to: normalizedMerchantAddress,
                        amount: actualAmount,
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
                    
                    // Clean up zero balance addresses
                    await cleanupZeroBalanceAddresses();
                    
                    // Return success response
                    return res.json({
                        success: true,
                        txHash: signedTx.transactionHash,
                        amount: actualAmount,
                        timestamp: new Date().toISOString(),
                        blockNumber: receipt.blockNumber,
                        fullBalance: true
                    });
                }
                
                // Standard release for exact amount
                // Prepare transaction data for standard amount-specified release
                const txData = {
                    from: highestBalanceAddr.address,
                    to: normalizedMerchantAddress,
                    value: freshWeb3.utils.toHex(requestedAmountWei.toString()),
                    gas: gasLimit,
                    gasPrice: gasPrice,
                    nonce: nonce
                };
                
                console.log('Transaction data prepared for standard amount-specified release:', JSON.stringify(txData, null, 2));
                
                // Sign transaction with exact amount
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
                
                // Calculate actual amount sent (original minus gas)
                const actualAmount = freshWeb3.utils.fromWei(requestedAmountWei.toString(), 'ether');
                
                // Record the transaction
                const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                const txLogEntry = {
                    txId: txId,
                    txHash: signedTx.transactionHash,
                    from: highestBalanceAddr.address,
                    to: normalizedMerchantAddress,
                    amount: actualAmount,
                    amountWei: requestedAmountWei.toString(),
                    timestamp: new Date().toISOString(),
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed,
                    type: 'release',
                    requestedAmount: amount
                };
                
                // Save transaction to log
                saveTxLog(txLogEntry);
                
                // Clean up zero balance addresses
                await cleanupZeroBalanceAddresses();
                
                // Return success response
                return res.json({
                    success: true,
                    txHash: signedTx.transactionHash,
                    amount: actualAmount,
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
   
// Helper to create backup files with better organization and less duplication
function createDatabaseBackup(sourceFile, reason = 'corruption') {
    try {
        // Create backup directories if they don't exist
        const backupDir = path.join(process.cwd(), 'database_backups');
        const corruptionDir = path.join(process.cwd(), 'corruption_backups');
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        if (!fs.existsSync(corruptionDir)) {
            fs.mkdirSync(corruptionDir, { recursive: true });
        }
        
        // Choose directory based on reason
        const targetDir = reason === 'corruption' ? corruptionDir : backupDir;
        
        // Format timestamp in a file-friendly format: YYYY-MM-DD_HH-MM-SS
        const now = new Date();
        const timestamp = now.toISOString()
            .replace('T', '_')
            .replace(/:/g, '-')
            .split('.')[0];
        
        // Get source filename without path
        const sourceFileName = path.basename(sourceFile);
        const baseFileName = sourceFileName.split('.')[0]; // Get part before first dot
        
        // Create backup filename: {originalname}_{timestamp}.bak
        const backupFileName = `${baseFileName}_${timestamp}.bak`;
        const backupFilePath = path.join(targetDir, backupFileName);
        
        // Check if the source file exists
        if (!fs.existsSync(sourceFile)) {
            console.warn(`Source file ${sourceFile} does not exist, cannot create backup`);
            return null;
        }
        
        // Check if a backup with the exact same content already exists from the last minute
        // to avoid creating multiple identical backups during error loops
        const existingBackups = fs.readdirSync(targetDir)
            .filter(file => file.startsWith(baseFileName) && file.endsWith('.bak'))
            .map(file => path.join(targetDir, file));
        
        // Sort by creation time, most recent first
        existingBackups.sort((a, b) => {
            try {
                return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
            } catch (e) {
                return 0;
            }
        });
        
        // If we have recent backups (within the last minute), check if content is identical
        if (existingBackups.length > 0) {
            const mostRecentBackup = existingBackups[0];
            const backupStat = fs.statSync(mostRecentBackup);
            const backupAge = (now.getTime() - backupStat.mtime.getTime()) / 1000; // age in seconds
            
            if (backupAge < 60) { // Less than 1 minute old
                try {
                    const sourceContent = fs.readFileSync(sourceFile, 'utf8');
                    const backupContent = fs.readFileSync(mostRecentBackup, 'utf8');
                    
                    if (sourceContent === backupContent) {
                        console.log(`Identical backup created less than a minute ago (${mostRecentBackup}), skipping duplicate`);
                        return mostRecentBackup;
                    }
                } catch (e) {
                    console.error('Error comparing file contents:', e);
                    // Continue with creating a new backup if comparison fails
                }
            }
        }
        
        // Create the backup
        fs.copyFileSync(sourceFile, backupFilePath);
        console.log(`Created backup at ${backupFilePath}`);
        
        // Cleanup old backups if we have too many
        cleanupOldBackups(targetDir, baseFileName);
        
        return backupFilePath;
    } catch (error) {
        console.error('Error creating backup:', error);
        return null;
    }
}

// Helper to clean up old backups to prevent excessive disk usage
function cleanupOldBackups(backupDir, filePrefix, maxBackups = 50) {
    try {
        // Get all backup files for this file type
        const backups = fs.readdirSync(backupDir)
            .filter(file => file.startsWith(filePrefix) && file.endsWith('.bak'))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                mtime: fs.statSync(path.join(backupDir, file)).mtime.getTime()
            }));
        
        // If we have more than maxBackups, remove the oldest ones
        if (backups.length > maxBackups) {
            // Sort by modification time (oldest first)
            backups.sort((a, b) => a.mtime - b.mtime);
            
            // Get list of files to delete (keeping the newest maxBackups)
            const filesToDelete = backups.slice(0, backups.length - maxBackups);
            
            console.log(`Cleaning up ${filesToDelete.length} old backup files for ${filePrefix}`);
            
            // Delete the old backups
            filesToDelete.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`Deleted old backup: ${file.name}`);
                } catch (deleteError) {
                    console.error(`Failed to delete backup ${file.path}:`, deleteError);
                }
            });
        }
    } catch (error) {
        console.error(`Error cleaning up old backups for ${filePrefix}:`, error);
    }
}

// Helper function to find all backup files for a given base filename
function findAllBackupFiles(baseFilename) {
    try {
        const backupDir = path.join(process.cwd(), 'database_backups');
        const corruptionDir = path.join(process.cwd(), 'corruption_backups');
        let backupFiles = [];
        
        // Check new-style backups in dedicated backup directory
        if (fs.existsSync(backupDir)) {
            const dbBackups = fs.readdirSync(backupDir)
                .filter(file => file.startsWith(`${baseFilename}_`) && file.endsWith('.bak'))
                .map(file => path.join(backupDir, file));
            backupFiles = [...backupFiles, ...dbBackups];
        }
        
        // Check corruption backups in dedicated directory
        if (fs.existsSync(corruptionDir)) {
            const corruptionBackups = fs.readdirSync(corruptionDir)
                .filter(file => file.startsWith(`${baseFilename}_`) && file.endsWith('.bak'))
                .map(file => path.join(corruptionDir, file));
            backupFiles = [...backupFiles, ...corruptionBackups];
        }
        
        // Also check legacy backups in root directory
        // These have different naming patterns
        const legacyBackups = fs.readdirSync('.')
            .filter(file => {
                return (
                    (file.startsWith(`${baseFilename}.json.corrupted`) || 
                    file.startsWith(`${baseFilename}.json.bak`)) &&
                    fs.statSync(file).isFile()
                );
            })
            .map(file => path.join(process.cwd(), file));
        
        backupFiles = [...backupFiles, ...legacyBackups];
        
        // Sort by modification time, most recent first
        backupFiles.sort((a, b) => {
            try {
                return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
            } catch (e) {
                return 0;
            }
        });
        
        return backupFiles;
    } catch (error) {
        console.error(`Error finding backup files for ${baseFilename}:`, error);
        return [];
    }
}
   