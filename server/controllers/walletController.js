// Wallet Controller: Stubs for address management endpoints

const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
const { logToFile } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { decrypt } = require('../../encryptionUtils');
const ethers = require('ethers');
const { getStoredKeys, recoverWallet } = require('../../recover.js');
const { getFreshProvider, getBalanceWithRetry } = require('../utils/web3Utils');
const web3 = require('web3');

// Helper function to get address balance with timeout
async function getAddressBalanceWithTimeout(address, info, timeoutMs) {
    try {
        console.log(`Checking balance for address ${address}`);
        const freshWeb3 = await getFreshProvider();
        if (!freshWeb3) {
            console.error('Failed to get fresh provider for balance check');
            return { address, balance: '0', info, error: 'Provider connection failed' };
        }
        
        const balancePromise = getBalanceWithRetry(freshWeb3, address, 2);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Balance check timed out')), timeoutMs)
        );
        
        const balance = await Promise.race([balancePromise, timeoutPromise]);
        console.log(`Balance for ${address}: ${balance} wei`);
        return { address, balance, info };
    } catch (error) {
        console.error(`Error checking balance for ${address}:`, error.message);
        return { address, balance: '0', info, error: error.message };
    }
}

// Helper function to determine if a value is already in ETH format
function isEthFormat(value) {
    // Check if it's a string containing a decimal point
    return typeof value === 'string' && value.includes('.');
}

// Helper function to safely convert any balance to ETH format
function safeConvertToEth(balance, web3Instance) {
    try {
        // If balance is already in ETH format (contains decimal point)
        if (isEthFormat(balance)) {
            return parseFloat(balance);
        }
        
        // If balance is a Wei value (no decimal), convert to ETH
        if (web3Instance && web3Instance.utils && web3Instance.utils.fromWei) {
            return parseFloat(web3Instance.utils.fromWei(balance.toString(), 'ether'));
        }
        
        // Fallback: manually convert from Wei to ETH
        return parseFloat(balance) / 1e18;
    } catch (error) {
        console.error(`Error converting balance to ETH: ${error.message}`, balance);
        return 0;
    }
}

exports.getAddresses = async (req, res) => {
    try {
        // Read the keys.json file
        const keysData = JSON.parse(require('../utils/fileUtils').secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        const now = new Date();
        const addresses = [];
        // Process each address
        for (const [address, data] of Object.entries(keysData.activeAddresses)) {
            const expiryDate = new Date(data.expiresAt);
            const createdDate = new Date(data.createdAt);
            // Check if expired
            const isExpired = expiryDate < now;
            // Consider addresses abandoned if they're older than 30 minutes and still pending
            const ageInMinutes = (now - createdDate) / (1000 * 60);
            const isAbandoned = ageInMinutes > 30 && data.status === 'pending';
            // Determine status
            let status = 'active';
            if (isExpired) status = 'expired';
            else if (isAbandoned) status = 'abandoned';
            // Add to addresses array
            addresses.push({
                address,
                data,
                status,
                isExpired,
                isAbandoned,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt
            });
        }
        // Return the addresses
        return res.json({
            success: true,
            addresses: addresses
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch addresses: ' + error.message
        });
    }
};

exports.cleanupAddresses = async (req, res) => {
    try {
        const { type } = req.body;
        if (!type || (type !== 'expired' && type !== 'abandoned')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid cleanup type. Must be "expired" or "abandoned".'
            });
        }
        // Read the keys.json file
        const keysData = JSON.parse(secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        const now = new Date();
        const activeAddresses = keysData.activeAddresses;
        const addressesToRemove = [];
        // Find addresses to remove
        for (const [address, data] of Object.entries(activeAddresses)) {
            const expiryDate = new Date(data.expiresAt);
            const createdDate = new Date(data.createdAt);
            // Check criteria based on type
            if (type === 'expired' && expiryDate < now) {
                addressesToRemove.push(address);
            } else if (type === 'abandoned') {
                const ageInMinutes = (now - createdDate) / (1000 * 60);
                if (ageInMinutes > 30 && data.status === 'pending') {
                    addressesToRemove.push(address);
                }
            }
        }
        if (addressesToRemove.length === 0) {
            return res.json({
                success: true,
                message: `No ${type} addresses found to clean up.`,
                count: 0
            });
        }
        // Remove addresses
        addressesToRemove.forEach(address => {
            delete activeAddresses[address];
        });
        // Save updated keys
        secureWriteFile('Json/keys.json', JSON.stringify(keysData, null, 2));
        logToFile(`Cleaned up ${addressesToRemove.length} ${type} addresses.`);
        return res.json({
            success: true,
            message: `Successfully cleaned up ${addressesToRemove.length} ${type} addresses.`,
            count: addressesToRemove.length
        });
    } catch (error) {
        console.error(`Error cleaning up addresses: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: `Failed to clean up addresses: ${error.message}`
        });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }
        // Read the keys.json file
        const keysData = JSON.parse(secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        if (!keysData.activeAddresses[address]) {
            return res.status(404).json({
                success: false,
                error: `Address ${address} not found`
            });
        }
        // Delete the address
        delete keysData.activeAddresses[address];
        // Save updated keys
        secureWriteFile('Json/keys.json', JSON.stringify(keysData, null, 2));
        logToFile(`Deleted address ${address}.`);
        return res.json({
            success: true,
            message: `Successfully deleted address ${address}.`
        });
    } catch (error) {
        console.error(`Error deleting address: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: `Failed to delete address: ${error.message}`
        });
    }
};

exports.discardPaymentAddress = async (req, res) => {
    try {
        const { address } = req.body;
        const { getStoredKeys } = require('../../recover.js');
        const { secureWriteFile } = require('../utils/fileUtils');
        const fs = require('fs');
        const logger = require('../utils/logger').logger;
        logger.info('Discarding payment address', { address });
        if (!address) {
            logger.warn('Discard payment address request missing address');
            return res.status(400).json({ success: false, error: 'Address is required' });
        }
        // Read the keys.json file
        const keys = getStoredKeys();
        if (!keys.activeAddresses || !keys.activeAddresses[address]) {
            logger.warn('Discard payment address: Address not found or already inactive', { address });
            return res.json({ success: true, message: 'Address not found or already inactive' });
        }
        // Remove the address from activeAddresses
        delete keys.activeAddresses[address];
        logger.info('Address removed from activeAddresses in memory', { address });
        // Save the updated keys.json file with atomic write
        try {
            const tempFile = './Json/keys_temp.json';
            const finalFile = './Json/keys.json';
            // Write to a temporary file first for atomicity
            secureWriteFile(tempFile, JSON.stringify(keys, null, 2));
            // Verify the temporary file before renaming
            const tempKeys = getStoredKeys(tempFile);  // Assume a variant of getStoredKeys for temp file
            if (!tempKeys.activeAddresses || !tempKeys.activeAddresses[address]) {
                // Temporary file is correct, rename it to the final file
                fs.renameSync(tempFile, finalFile);
                logger.info('Address successfully discarded and verified in keys.json');
                res.json({ success: true, message: 'Payment address discarded successfully' });
            } else {
                logger.error('Verification failed after writing to temporary file');
                fs.unlinkSync(tempFile);  // Clean up temp file
                res.status(500).json({ success: false, error: 'Failed to discard payment address - verification failed' });
            }
        } catch (updateError) {
            logger.error('Error updating keys.json', { error: updateError });
            res.status(500).json({ success: false, error: 'Failed to discard payment address' });
        }
    } catch (error) {
        logger.error('Error discarding payment address', { error });
        res.status(500).json({ success: false, error: 'Failed to discard payment address' });
    }
};

exports.verifyPaymentAddress = async (req, res) => {
    try {
        const { address } = req.body;
        const { getStoredKeys } = require('../../recover.js');
        const { updateStoredKeys } = require('../utils/fileUtils');
        const logger = require('../utils/logger').logger;
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
};

exports.updateKeys = async (req, res) => {
    try {
        const updatedKeys = req.body;
        const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
        const { logToFile } = require('../utils/logger');
        // Validate input data
        if (!updatedKeys || !updatedKeys.activeAddresses) {
            return res.status(400).json({
                success: false,
                error: 'Invalid keys data. Must contain activeAddresses object.'
            });
        }
        if (typeof updatedKeys.activeAddresses !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'activeAddresses must be an object'
            });
        }
        if (!updatedKeys.mnemonic || !updatedKeys.masterKey) {
            const existingKeys = JSON.parse(secureReadFile('Json/keys.json'));
            updatedKeys.mnemonic = existingKeys.mnemonic;
            updatedKeys.masterKey = existingKeys.masterKey;
        }
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
};

exports.getHDWalletBalance = async (req, res) => {
    try {
        // Load and parse keys.json
        const keys = JSON.parse(await secureReadFile(path.join(__dirname, '../../Json/keys.json')));
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
        const rootAddress = rootNode.address;
        
        // Initialize provider
        const provider = new ethers.providers.JsonRpcProvider(process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9');
        
        // Check balance of root address
        const rootBalanceWei = await provider.getBalance(rootAddress);
        let totalBalanceWei = rootBalanceWei;
        
        // Also check first 20 derived addresses
        const derivedAddresses = [];
        for (let i = 0; i < 20; i++) {
            const derivedNode = hdNode.derivePath(`m/44'/60'/0'/0/${i}`);
            const address = derivedNode.address;
            const balanceWei = await provider.getBalance(address);
            
            // Only add addresses with non-zero balance to the list
            if (balanceWei.gt(0)) {
                derivedAddresses.push({
                    index: i,
                    address: address,
                    balance: ethers.utils.formatEther(balanceWei)
                });
                
                // Add to total balance if not the root address (already counted)
                if (i > 0) {
                    totalBalanceWei = totalBalanceWei.add(balanceWei);
                }
            }
        }
        
        // Format total balance
        const ethBalance = ethers.utils.formatEther(totalBalanceWei);
        
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
        
        // Read merchant_transactions.json to get verified/wrong payment amounts
        const txFile = 'merchant_transactions.json';
        let verifiedBalance = "0";
        let wrongPaymentsBalance = "0";
        
        if (fs.existsSync(txFile)) {
            try {
                const fileContent = secureReadFile(txFile);
                if (fileContent && fileContent.trim()) {
                    const transactions = JSON.parse(fileContent);
                    if (Array.isArray(transactions)) {
                        // Calculate verified and wrong payment totals
                        let verifiedBalanceWei = BigInt(0);
                        let wrongPaymentsWei = BigInt(0);
                        
                        for (const tx of transactions) {
                            if (tx.type !== 'payment' || !tx.amount) continue;
                            
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
                                    console.error(`Could not convert transaction amount to BigInt: '${amountWei}'`);
                                    continue;
                                }
                                
                                if (tx.amountVerified === false || tx.isWrongPayment === true || 
                                    tx.wrongPayment === true || tx.status === 'wrong') {
                                    wrongPaymentsWei += amountBigInt;
                                } else if (tx.status === 'confirmed' || tx.status === 'verified') {
                                    verifiedBalanceWei += amountBigInt;
                                }
                            } catch (error) {
                                console.error('Error processing transaction for balance calculation:', error);
                            }
                        }
                        
                        // Convert BigInt totals to ETH strings
                        verifiedBalance = web3.utils.fromWei(verifiedBalanceWei.toString(), 'ether');
                        wrongPaymentsBalance = web3.utils.fromWei(wrongPaymentsWei.toString(), 'ether');
                    }
                }
            } catch (error) {
                console.error('Error parsing transaction file:', error);
            }
        }
        
        res.json({
            success: true,
            address: rootAddress,
            ethBalance,
            audBalance,
            verifiedBalance,
            wrongPaymentsBalance,
            lastUpdated: new Date().toISOString(),
            addresses: derivedAddresses
        });
    } catch (err) {
        console.error('Error in getHDWalletBalance:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.generateTestPayment = async (req, res) => {
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
        secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
        // Log the payment request
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
        secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
        // Return the payment details
        res.json({
            success: true,
            address: address,
            id: paymentId,
            expectedAmount: expectedAmount,
            expiresAt: expiryTime.toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate test payment: ' + error.message
        });
    }
};

exports.getWalletBalance = async (req, res) => {
    try {
        // Get active addresses from stored keys
        const keys = getStoredKeys();
        if (!keys.activeAddresses) {
            console.log('[DEBUG] No activeAddresses found in keys.json');
            return res.json({
                success: true,
                addresses: [],
                totalBalance: '0',
                pendingBalance: '0',
                verifiedBalance: '0',
                wrongPaymentAddresses: [],
                wrongPaymentsBalance: '0'
            });
        }
        const activeAddresses = keys.activeAddresses;
        // EXTREME DEBUG: Log all addresses and their flags
        console.log('[DEBUG] All activeAddresses from keys.json:');
        Object.entries(activeAddresses).forEach(([address, info]) => {
            console.log(`  ${address}:`, JSON.stringify(info, null, 2));
        });
        // Get all active payment address balances
        const checkAddressPromises = [];
        console.log(`[DEBUG] Found ${Object.keys(activeAddresses).length} active addresses to check balances for`);
        for (const [address, info] of Object.entries(activeAddresses)) {
            checkAddressPromises.push(getAddressBalanceWithTimeout(address, info, 3000));
        }
        // Wait for all promises to settle
        const addressResults = await Promise.allSettled(checkAddressPromises);
        console.log(`[DEBUG] Received balance results for ${addressResults.length} addresses`);
        // Strictly separate wrong and non-wrong addresses for balance calculation
        const hdWalletAddresses = []; // Regular payment addresses (non-wrong)
        const wrongPaymentAddresses = []; // Wrong payment addresses only
        let totalHdWalletBalance = 0; // Only for non-wrong payments
        let wrongPaymentsBalanceTotal = 0; // Only for wrong payments
        let pendingBalanceAddr = 0;
        let verifiedBalanceAddr = 0;
        // Track wrong payment statistics
        let wrongPaymentsCount = 0;
        // EXTREME DEBUG: Log all address results before processing
        console.log('[DEBUG] Address results before processing:');
        addressResults.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value) {
                const { address, balance, info } = result.value;
                console.log(`  [${idx}] ${address}: balance=${balance}, info=${JSON.stringify(info)}`);
            } else {
                console.log(`  [${idx}] ERROR:`, result.reason || 'Unknown error');
            }
        });
        // Process each address result
        for (const result of addressResults) {
            if (result.status !== 'fulfilled' || !result.value) {
                console.error('[DEBUG] Address balance check failed:', result.reason || 'Unknown error');
                continue;
            }
            const { address, balance, info } = result.value;
            // CRITICAL: Determine if this address is marked as a wrong payment
            const isWrongPaymentAddress = 
                info.isWrongPayment === true || 
                info.wrongPayment === true || 
                info.status === 'wrong';
            console.log(`[DEBUG] Processing address ${address}: isWrongPaymentAddress=${isWrongPaymentAddress}, status=${info.status}, balance=${balance}, wrongPayment=${info.wrongPayment}, isWrongPayment=${info.isWrongPayment}, amountVerified=${info.amountVerified}`);
            const addressData = {
                address,
                balance,
                rawBalance: balance,
                ...info
            };
            // IMPORTANT: Convert balance to Ether for consistent handling (for display if needed)
            let ethBalance = 0;
            try {
                // Check if balance is already in ETH format (contains decimal point)
                if (isEthFormat(balance)) {
                    // Balance is already in ETH format, just parse it
                    ethBalance = parseFloat(balance);
                    addressData.balanceInEth = balance;
                } else {
                    // Balance is in Wei, convert to ETH
                    const balanceInEth = web3.utils.fromWei(balance.toString(), 'ether');
                    addressData.balanceInEth = balanceInEth;
                    ethBalance = parseFloat(balanceInEth);
                }
            } catch (error) {
                console.error(`[DEBUG] Error converting balance for ${address}:`, error);
                // Fallback: try direct conversion using our helper function
                ethBalance = safeConvertToEth(balance, web3);
                addressData.balanceInEth = ethBalance.toString();
            }
            // Add to the appropriate list (addresses or wrongPaymentAddresses)
            if (isWrongPaymentAddress) {
                wrongPaymentAddresses.push(addressData);
                // NOTE: We no longer sum address balance for wrong payments here
            } else {
                hdWalletAddresses.push(addressData);
                totalHdWalletBalance += ethBalance; // Sum valid HD wallet address balances
                // Track verified/pending based on status for valid addresses
                if (info.status === 'verified' || info.status === 'confirmed') {
                    verifiedBalanceAddr += ethBalance;
                } else if (info.status === 'pending') {
                    pendingBalanceAddr += ethBalance;
                }
            }
        }
        // Read transaction history to calculate wrong payment total and pending/verified based on transactions
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
        let pendingBalanceTx = BigInt(0);
        let verifiedBalanceTx = BigInt(0);
        let wrongPaymentsAmountBigInt = BigInt(0);
        
        // Iterate through transactions to calculate balances
        for (const tx of transactions) {
            if (tx.type !== 'payment' || !tx.amount) continue; // Only process payment transactions with amount
            
            const isWrongPaymentTx = 
                 tx.amountVerified === false || 
                 tx.isWrongPayment === true || 
                 tx.wrongPayment === true || 
                 tx.status === 'wrong';
                 
            try {
                let amountWei;
                let amountStr = tx.amount ? tx.amount.toString() : "0";
                
                // Convert amount to Wei using the global web3 instance
                // Handle cases where amount might already be in Wei (less likely from UI input)
                if (amountStr.includes('.')) {
                     amountWei = web3.utils.toWei(amountStr, 'ether'); 
                } else {
                    // Assume it might be a Wei string if no decimal
                    amountWei = amountStr; // Use as is, BigInt will validate
                }
                
                let amountBigInt = BigInt(0);
                try {
                    amountBigInt = BigInt(amountWei); // Ensure it's a valid BigInt
                } catch (bigIntError) {
                    console.error(`[WARN] Could not convert transaction amount to BigInt: '${
                        amountWei}' for tx:`, tx, bigIntError.message);
                    continue; // Skip this transaction if amount is invalid
                }
                
                if (isWrongPaymentTx) {
                    // Sum wrong payment amounts from transactions
                    wrongPaymentsAmountBigInt += amountBigInt;
                    wrongPaymentsCount++; // Count wrong payment transactions
                } else {
                    // Sum pending/verified amounts from non-wrong transactions
                    if (tx.status === 'confirmed' || tx.status === 'verified') {
                        verifiedBalanceTx += amountBigInt;
                    } else if (tx.status === 'pending' || tx.status === 'processing') {
                        pendingBalanceTx += amountBigInt;
                    }
                }
            } catch (error) {
                console.error('[ERROR] Processing transaction for balance calculation:', error, tx);
            }
        }
        
        // Convert BigInt totals back to Ether strings for the response
        const pendingBalance = web3.utils.fromWei(pendingBalanceTx.toString(), 'ether');
        const verifiedBalance = web3.utils.fromWei(verifiedBalanceTx.toString(), 'ether');
        const wrongPaymentsAmount = web3.utils.fromWei(wrongPaymentsAmountBigInt.toString(), 'ether');
        
        // EXTREME DEBUG: Log the final response fields for debugging
        console.log('[DEBUG] Final wallet balance response fields:');
        console.log('  addresses count:', hdWalletAddresses.length);
        console.log('  wrongPaymentAddresses count:', wrongPaymentAddresses.length);
        console.log('  totalBalance:', totalHdWalletBalance); // This is sum of non-wrong address balances
        console.log('  wrongPaymentsBalance:', wrongPaymentsAmount); // This is sum of wrong transaction amounts
        console.log('  pendingBalance:', pendingBalance);
        console.log('  verifiedBalance:', verifiedBalance);
        console.log('  wrongPaymentsCount:', wrongPaymentsCount);
        
        // Log individual addresses for verification (using their calculated ETH balance)
        console.log('[DEBUG] Regular addresses:', hdWalletAddresses.map(a => `${a.address}: ${a.balanceInEth || 0} ETH`));
        console.log('[DEBUG] Wrong payment addresses:', wrongPaymentAddresses.map(a => `${a.address}: ${a.balanceInEth || 0} ETH`)); // Address balances are still relevant for display
        
        // Send the response with wrong payments total from transaction log
        const response = {
            success: true,
            addresses: hdWalletAddresses, // Only non-wrong addresses (with their current balance)
            totalBalance: totalHdWalletBalance.toFixed(8).toString(), // Format to 8 decimals for consistency
            pendingBalance: pendingBalance, // From transaction log
            verifiedBalance: verifiedBalance, // From transaction log
            wrongPaymentAddresses: wrongPaymentAddresses, // Only wrong addresses (with their current balance)
            wrongPaymentsBalance: wrongPaymentsAmount, // From transaction log
            wrongPaymentsCount: wrongPaymentsCount, // Count of wrong transactions
            // Add aliases for frontend compatibility
            wrongPayments: wrongPaymentsCount,
            wrongPaymentsAmount: wrongPaymentsAmount
        };
        console.log('[DEBUG] Full response object:', JSON.stringify(response, null, 2));
        
        // Update cache (optional, depending on desired caching strategy)
        // global[cachedBalanceKey] = response;
        // global[cachedBalanceTimestampKey] = Date.now();
        
        return res.json(response);
    } catch (error) {
        console.error('[FATAL] Error in getWalletBalance:', error);
        console.error('Stack trace:', error.stack);
        logToFile(`[FATAL] Error in getWalletBalance: ${error.message} ${error.stack}`);
        console.log('===========================================================');
        
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
        
        // Return error response if no cache is available
        return res.status(500).json({
            success: false,
            error: 'Failed to get wallet balance: ' + error.message
        });
    }
}; 