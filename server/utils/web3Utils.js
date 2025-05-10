const Web3 = require('web3');
const fs = require('fs');
const { secureReadFile, secureWriteFile, updateStoredKeys } = require('./fileUtils');
const { recoverWallet, getStoredKeys } = require('../../recover.js');
const { logBlockchain } = require('./logger');
const path = require('path');


// Helper to get a fresh provider (robust, multi-endpoint)
async function getFreshProvider() {
    console.log('Getting fresh provider with prioritized endpoints...');
    // Use multiple RPC endpoints with priority order
    const rpcEndpoints = [
        // Primary options
        process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
        process.env.ALCHEMY_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
        // Fallback options
        'https://ethereum-sepolia.publicnode.com',
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
                timeout: 30000 // 30 second timeout
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
    console.error('ALL_PROVIDERS_FAILED', { errors });
    throw new Error('Failed to connect to any RPC provider. Please check your internet connection and try again later.');
}

// Helper to get a reliable nonce
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

// Helper to get a reliable gas price
async function getReliableGasPrice(web3) {
    try {
        console.log("Getting reliable gas price...");
        // Try to get the gas price from the network
        const standardGasPrice = await web3.eth.getGasPrice();
        
        // For Sepolia testnet, ensure a minimum gas price of 1 gwei
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
            
            // Default to 1.5 gwei if all else fails
            const fallbackGasPrice = web3.utils.toWei('1.5', 'gwei');
            console.log(`Using fallback gas price: 1.5 gwei`);
            return fallbackGasPrice;
        }
    }
}

// Helper to send transaction with retry
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

// Helper to wait for transaction receipt
async function waitForTransactionReceipt(web3, txHash, timeout = 120000) {
    console.log(`Waiting for transaction receipt for ${txHash} (timeout: ${timeout}ms)...`);
    
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

// Helper to check transaction receipt with polling
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

// Helper to get balance with retry
async function getBalanceWithRetry(web3, address, retryCount = 3) {
    let lastError;
    for (let i = 0; i < retryCount; i++) {
        try {
            // Get the raw balance in wei
            const balanceWei = await web3.eth.getBalance(address);
            
            // Convert to ETH string with full precision
            // This ensures we don't lose any decimal precision
            const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
            
            // Log the exact balance values for debugging
            console.log(`Balance for ${address}: ${balanceEth} wei`);
            
            return balanceEth;
        } catch (error) {
            lastError = error;
            console.warn(`Balance fetch attempt ${i+1} failed for ${address}:`, error.message);
            // Wait a bit before retrying
            await new Promise(res => setTimeout(res, 500 * (i + 1))); // Increasing backoff
        }
    }
    console.error(`getBalanceWithRetry failed for ${address} after ${retryCount} attempts:`, lastError ? lastError.message : 'Unknown error');
    return '0';
}

// Helper to determine if we should retry a transaction based on error type
function shouldRetryTransaction(error) {
    const retryableErrors = [
        'connection error', 'timeout', 'timed out', 'CONNECTION ERROR',
        'nonce too low', 'known transaction', 'replacement transaction underpriced',
        'already known', 'invalid json response', 'invalid response'
    ];
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

// Function to check if a payment amount is correct with high precision
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
            
            // Convert both to strings then to floats for consistent handling
            if (typeof expectedAmount !== 'string') {
                expectedAmount = expectedAmount.toString();
            }
            if (typeof actualAmount !== 'string') {
                actualAmount = actualAmount.toString();
            }
            
            // Use fixed-precision comparison for higher accuracy
            return compareAmountsWithPrecision(expectedAmount, actualAmount);
            
        } else if (payment.expectedAmount && payment.amount) {
            // Direct comparison if addrInfo is not available but expectedAmount is
            // First try to use ethAmount if it exists
            let expectedAmount = payment.ethAmount || 
                               payment.displayAmount || 
                               payment.expectedAmount;
            let actualAmount = payment.amount;
            
            // Convert both to strings for consistent handling
            if (typeof expectedAmount !== 'string') {
                expectedAmount = expectedAmount.toString();
            }
            if (typeof actualAmount !== 'string') {
                actualAmount = actualAmount.toString();
            }
            
            // Use fixed-precision comparison
            return compareAmountsWithPrecision(expectedAmount, actualAmount);
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

// Helper function to compare cryptocurrency amounts with high precision
// Focuses on first 6 digits after decimal point for accuracy
function compareAmountsWithPrecision(expectedStr, actualStr) {
    try {
        // Convert to numeric values for initial checks
        const expected = parseFloat(expectedStr);
        const actual = parseFloat(actualStr);
        
        // Handle NaN values
        if (isNaN(expected) || isNaN(actual)) {
            console.warn(`Invalid amount values for comparison: expected=${expectedStr}, actual=${actualStr}`);
            return false;
        }
        
        // Multiple approaches for different scenarios:
        
        // 1. Exact string match at 6 decimal places (handles most cases)
        const expectedFormatted = expected.toFixed(6);
        const actualFormatted = actual.toFixed(6);
        const exactMatch = expectedFormatted === actualFormatted;
        
        // 2. Allow a very tiny variance with percentage-based approach
        // Calculate acceptable difference based on amount scale
        // For very small amounts (<0.001), be extremely precise
        // For larger amounts, allow a slightly higher tolerance
        let allowedPercentage;
        if (expected < 0.001) {
            allowedPercentage = 0.001; // 0.1% for tiny amounts
        } else if (expected < 0.01) {
            allowedPercentage = 0.002; // 0.2% for small amounts
        } else {
            allowedPercentage = 0.003; // 0.3% for normal amounts
        }
        
        // Absolute difference in value
        const differenceInValue = Math.abs(expected - actual);
        
        // Calculate the difference as a percentage of the expected amount
        const differencePercentage = (differenceInValue / expected) * 100;
        
        // Define the acceptable absolute difference (whichever is smaller)
        const maxFixedDiff = 0.000002; // 0.000002 ETH (absolute tolerance)
        const maxPercentDiff = expected * (allowedPercentage / 100); // Percentage-based tolerance
        
        // Use the smaller of the two tolerances
        const effectiveMaxDiff = Math.min(maxFixedDiff, maxPercentDiff);
        
        // Check if the difference is within our acceptable range
        const isWithinAcceptableRange = differenceInValue <= effectiveMaxDiff;
        
        // 3. For rounding errors, check if they're off by just 1 in the last decimal
        // This handles cases where exchanges may round slightly differently
        const expectedInWei = Math.round(expected * 1000000);
        const actualInWei = Math.round(actual * 1000000);
        const offByOneInLastPlace = Math.abs(expectedInWei - actualInWei) <= 1;
        
        // Log the detailed comparison for transparency
        console.log(`Payment amount check (enhanced precision):\n` +
                   `Expected: ${expected} (${expectedFormatted})\n` +
                   `Actual: ${actual} (${actualFormatted})\n` +
                   `Exact match at 6 decimals: ${exactMatch}\n` +
                   `Difference: ${differenceInValue} ETH (${differencePercentage.toFixed(6)}%)\n` +
                   `Max allowed difference: ${effectiveMaxDiff} ETH\n` +
                   `Within allowed range: ${isWithinAcceptableRange}\n` +
                   `Off by ≤1 in last decimal place: ${offByOneInLastPlace}`);
        
        // Consider a payment correct if any of our conditions are met
        return exactMatch || isWithinAcceptableRange || offByOneInLastPlace;
    } catch (e) {
        console.error('Error in precision comparison:', e);
        return false;
    }
}

// Helper function to scan for addresses and map them to derivation indices
async function scanForAddressIndices(mnemonic, maxIndex = 50) {
    console.log(`Scanning for HD wallet addresses up to index ${maxIndex}...`);
    const addressMap = {};
    try {
        for (let i = 0; i <= maxIndex; i++) {
            try {
                const wallet = await recoverWallet(mnemonic, i);
                if (wallet && wallet.address) {
                    addressMap[wallet.address.toLowerCase()] = i;
                }
            } catch (error) {
                console.error('Error deriving address at index ' + i + ':', error.message);
            }
        }
    } catch (error) {
        console.error('Error scanning for addresses:', error.message);
    }
    return addressMap;
}

function saveAddressMap(addressMap) {
    const mapFile = 'address_index_map.json';
    let existingMap = {};
    if (fs.existsSync(mapFile)) {
        try {
            const fileContent = secureReadFile(mapFile);
            existingMap = JSON.parse(fileContent);
        } catch (error) {
            console.error('Error reading existing address map:', error.message);
        }
    }
    const mergedMap = { ...existingMap, ...addressMap };
    secureWriteFile(mapFile, JSON.stringify(mergedMap, null, 2));
    console.log(`Saved ${Object.keys(mergedMap).length} address-to-index mappings`);
}

function updateAddressIndex(address, index) {
    const mapFile = 'address_index_map.json';
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
    existingMap[address] = index;
    secureWriteFile(mapFile, JSON.stringify(existingMap, null, 2));
    console.log(`Updated index mapping for ${address}`);
    return true;
}

async function findWalletForAddress(mnemonic, targetAddress, maxIndex = 200) {
    console.log(`Searching for wallet matching address ${targetAddress} (scanning up to index ${maxIndex})...`);
    const normalizedTarget = targetAddress.toLowerCase();
    const mapFile = 'address_index_map.json';
    if (fs.existsSync(mapFile)) {
        try {
            const fileContent = secureReadFile(mapFile);
            const addressMap = JSON.parse(fileContent);
            if (addressMap[normalizedTarget] !== undefined) {
                const index = addressMap[normalizedTarget];
                console.log(`Found cached index ${index} for address ${targetAddress}`);
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
    for (let i = 0; i <= maxIndex; i++) {
        try {
            const wallet = await recoverWallet(mnemonic, i);
            if (wallet && wallet.address && wallet.address.toLowerCase() === normalizedTarget) {
                console.log(`Found matching wallet at index ${i}`);
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
    console.error(`Could not find wallet for address ${targetAddress} after scanning ${maxIndex + 1} indices`);
    return null;
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
            const pendingTx = txLogs.find(tx => 
                tx.from && tx.from.toLowerCase() === fromAddress.toLowerCase() &&
                tx.to && tx.to.toLowerCase() === toAddress.toLowerCase() &&
                tx.status !== false &&
                (tx.confirmations === undefined || tx.confirmations === 0 || tx.confirmations === null) &&
                !tx.blockNumber
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

// Update recordWrongPayment function for robust handling
async function recordWrongPayment(payment) {
    try {
        console.log(`Recording wrong payment for ${payment.address} with amount ${payment.amount || 'unknown'}`);
        
        // Get stored keys
        const keys = getStoredKeys();
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        }
        
        if (!payment.address) {
            console.error('Cannot record wrong payment without an address');
            return false;
        }
        
        // Get the existing entry or create a new one
        let addrInfo = keys.activeAddresses[payment.address] || {};
        
        // Get the ETH amount that was shown to the user on the payment page
        const correctEthAmount = payment.ethAmount || addrInfo.ethAmount || addrInfo.displayAmount || addrInfo.expectedAmount || payment.expectedAmount;
        
        // Determine the reason for wrong payment
        let wrongReason = '';
        if (correctEthAmount && payment.amount) {
            wrongReason = `Please submit ${correctEthAmount} ETH. You sent ${payment.amount} ETH which is incorrect.`;
        } else {
            wrongReason = 'Amount verification failed. Please check the expected payment amount and try again.';
        }
        
        console.log(`Wrong payment reason: ${wrongReason}`);
        
        // Mark as wrong payment and expired
        addrInfo = {
            ...addrInfo,
            isWrongPayment: true,
            wrongPayment: true,
            amountVerified: false,
            amount: payment.amount || addrInfo.amount,
            ethAmount: correctEthAmount || addrInfo.ethAmount,
            expectedAmount: correctEthAmount || addrInfo.expectedAmount,
            timestamp: payment.timestamp || addrInfo.timestamp || new Date().toISOString(),
            status: 'wrong',
            cryptoType: payment.cryptoType || addrInfo.cryptoType || 'ETH',
            wrongReason: wrongReason,
            isExpired: true,
            expiredAt: new Date().toISOString(),
            expiredReason: 'Address expired due to wrong payment detection'
        };
        
        // Add to active addresses with the wrong payment flag
        keys.activeAddresses[payment.address] = addrInfo;
        
        // Remove from payment sessions if it exists there
        try {
            const sessionsFile = 'payment_sessions.json';
            if (fs.existsSync(sessionsFile)) {
                const sessionsData = JSON.parse(secureReadFile(sessionsFile) || '{}');
                if (sessionsData[payment.address]) {
                    console.log(`Removing address ${payment.address} from payment sessions due to wrong payment`);
                    delete sessionsData[payment.address];
                    secureWriteFile(sessionsFile, JSON.stringify(sessionsData, null, 2));
                }
            }
        } catch (sessionsError) {
            console.error('Error handling payment sessions during wrong payment:', sessionsError);
        }
        
        // Save updated keys
        console.log(`Updating stored keys with wrong payment flag for ${payment.address}`);
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
        
        if (payment.txHash) {
            txLog.txHash = payment.txHash;
        }
        
        if (!txLog.txId) {
            const timestamp = new Date().getTime();
            const randomStr = Math.random().toString(36).substring(2, 9);
            txLog.txId = `tx_${timestamp}_${randomStr}`;
        }
        
        // Add to transaction log
        const txFile = 'merchant_transactions.json';
        try {
            let txLogs = [];
            if (fs.existsSync(txFile)) {
                const fileContent = secureReadFile(txFile);
                try {
                    txLogs = JSON.parse(fileContent || '[]');
                    if (!Array.isArray(txLogs)) {
                        txLogs = [];
                    }
                } catch (parseError) {
                    console.error('Error parsing transaction logs:', parseError);
                    txLogs = [];
                }
            }
            
            const existingIndex = txLogs.findIndex(tx =>
                (tx.txHash && payment.txHash && tx.txHash === payment.txHash) ||
                (tx.address === payment.address && tx.amount === payment.amount && tx.timestamp === payment.timestamp)
            );
            
            if (existingIndex >= 0) {
                console.log(`Updating existing transaction log entry for wrong payment at index ${existingIndex}`);
                txLogs[existingIndex] = {
                    ...txLogs[existingIndex],
                    ...txLog,
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
                console.log(`Adding new transaction log entry for wrong payment`);
                txLogs.push(txLog);
            }
            
            secureWriteFile(txFile, JSON.stringify(txLogs, null, 2));
            console.log(`Successfully recorded wrong payment for ${payment.address}`);
            return true;
        } catch (fileError) {
            console.error('Error updating transaction log file:', fileError);
            try {
                console.log('Attempting to create new transaction log file with wrong payment');
                secureWriteFile(txFile, JSON.stringify([txLog], null, 2));
                return true;
            } catch (recoveryError) {
                console.error('Recovery attempt for transaction log failed:', recoveryError);
                return false;
            }
        }
    } catch (error) {
        console.error('Error recording wrong payment:', error);
        return false;
    }
}

module.exports = {
    getFreshProvider,
    getReliableNonce,
    getReliableGasPrice,
    sendTransactionWithRetry,
    waitForTransactionReceipt,
    checkTransactionReceipt,
    getBalanceWithRetry,
    shouldRetryTransaction,
    isProviderError,
    isPaymentAmountCorrect,
    scanForAddressIndices,
    saveAddressMap,
    updateAddressIndex,
    findWalletForAddress,
    checkPendingTransactions,
    recordWrongPayment
};
