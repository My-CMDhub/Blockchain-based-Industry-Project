const Web3 = require('web3');

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
    // ... function body from server.js ...
}

// Helper to get a reliable gas price
async function getReliableGasPrice(web3) {
    // ... function body from server.js ...
}

// Helper to send transaction with retry
async function sendTransactionWithRetry(web3, signedTx, retries = 5, timeout = 180000) {
    // ... function body from server.js ...
}

// Helper to wait for transaction receipt
async function waitForTransactionReceipt(web3, txHash, timeout = 120000) {
    // ... function body from server.js ...
}

// Helper to check transaction receipt with polling
async function checkTransactionReceipt(web3, txHash, maxAttempts = 10) {
    // ... function body from server.js ...
}

// Helper to get balance with retry
async function getBalanceWithRetry(web3, address, retryCount = 3) {
    // ... function body from server.js ...
}

// Helper to determine if we should retry a transaction based on error type
function shouldRetryTransaction(error) {
    // ... function body from server.js ...
}

// Helper to identify provider errors
function isProviderError(error) {
    // ... function body from server.js ...
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
    isPaymentAmountCorrect
}; 