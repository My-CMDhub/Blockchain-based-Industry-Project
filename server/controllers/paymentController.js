// Payment Controller: Stubs for payment endpoints

const { getStoredKeys } = require('../../recover.js');
const { decrypt } = require('../../encryptionUtils');
const { recoverWallet } = require('../../recover.js');
const { secureWriteFile } = require('../utils/fileUtils');
const ethers = require('ethers');
const logger = require('../utils/logger').logger;
const { logBlockchain, logToFile } = require('../utils/logger');
const { updateStoredKeys } = require('../utils/fileUtils');
const { secureReadFile } = require('../utils/fileUtils');
const { isPaymentAmountCorrect } = require('../utils/web3Utils');
const fs = require('fs');

// Move recordWrongPayment from server.js or import if modularized
const { recordWrongPayment } = require('../utils/web3Utils');
const { getFreshProvider } = require('../utils/web3Utils');

exports.generatePaymentAddress = async (req, res) => {
    try {
        logger.info('Generating payment address', { body: req.body });
        const { amount, cryptoType, fiatAmount, fiatCurrency, orderId } = req.body;
        if (!amount || !cryptoType) {
            logger.error('Missing required parameters', { amount, cryptoType });
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required parameters' 
            });
        }
        let formattedAmount;
        try {
            const floatAmount = parseFloat(amount);
            if (isNaN(floatAmount)) {
                throw new Error('Invalid amount format');
            }
            formattedAmount = floatAmount.toFixed(8);
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
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        let nextIndex = 1;
        if (!keys.activeAddresses) {
            keys.activeAddresses = {};
        } else {
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
        const PROVIDERS = {
            INFURA: process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9',
            BACKUP: process.env.BACKUP_RPC || 'https://rpc.sepolia.org'
        };
        for (const [name, url] of Object.entries(PROVIDERS)) {
            try {
                provider = new ethers.providers.JsonRpcProvider(url);
                logger.info(`Trying provider: ${name}`);
                const networkPromise = provider.getNetwork();
                networkInfo = await Promise.race([
                    networkPromise,
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Provider timeout')), 5000)
                    )
                ]);
                logger.info(`Successfully connected to ${name}`, { network: networkInfo });
                break;
            } catch (error) {
                logger.warn(`Provider ${name} failed`, { error: error.message });
                continue;
            }
        }
        // Scan ahead for a zero-balance address (up to 1000 indices)
        const scanLimit = 1000;
        let found = false;
        let zeroBalanceAddress = null;
        let zeroBalanceIndex = null;
        let zeroBalancePrivateKey = null;
        for (let i = 0; i < scanLimit; i++) {
            const candidateIndex = nextIndex + i;
            const { address: candidateAddress, privateKey: candidatePrivateKey } = await recoverWallet(mnemonic, candidateIndex);
            let candidateBalance = '0';
            try {
                candidateBalance = await provider.getBalance(candidateAddress);
            } catch (err) {
                logger.warn(`Failed to get balance for ${candidateAddress} at index ${candidateIndex}: ${err.message}`);
                continue;
            }
            if (ethers.BigNumber.from(candidateBalance).isZero()) {
                found = true;
                zeroBalanceAddress = candidateAddress;
                zeroBalanceIndex = candidateIndex;
                zeroBalancePrivateKey = candidatePrivateKey;
                logger.info(`Found zero-balance address: ${candidateAddress} at index ${candidateIndex}`);
                break;
            } else {
                logger.info(`Address ${candidateAddress} at index ${candidateIndex} has nonzero balance, skipping.`);
            }
        }
        if (!found) {
            logger.error('No zero-balance address found in scan-ahead range (1000 indices).');
            return res.status(500).json({
                success: false,
                error: 'No zero-balance address available in the first 1000 indices. Please clean up used addresses or increase the scan limit.'
            });
        }
        const address = zeroBalanceAddress;
        const privateKey = zeroBalancePrivateKey;
        logger.info('Generated HD wallet address (zero-balance)', { address, index: zeroBalanceIndex });
        keys.activeAddresses[address] = {
            index: zeroBalanceIndex,
            ethAmount: formattedAmount,
            expectedAmount: formattedAmount,
            cryptoType: cryptoType,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
            status: 'pending',
            orderId: orderId || null
        };
        if (fiatAmount) {
            keys.activeAddresses[address].fiatAmount = fiatAmount;
            keys.activeAddresses[address].fiatCurrency = fiatCurrency || 'AUD';
        }
        secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
        const response = {
            success: true,
            address: address,
            amount: formattedAmount,
            networkId: networkInfo ? networkInfo.chainId : 11155111,
            networkType: networkInfo ? networkInfo.name : 'sepolia',
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString()
        };
        logger.info('Sending response', { response });
        res.json(response);
    } catch (error) {
        logger.error('Error generating payment address', { error });
        try {
            const keys = getStoredKeys();
            const mnemonic = decrypt(keys.mnemonic);
            const emergencyIndex = 999;
            const { address } = await recoverWallet(mnemonic, emergencyIndex);
            const formattedAmount = parseFloat(req.body.amount || '0').toFixed(8);
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
            if (req.body.fiatAmount) {
                keys.activeAddresses[address].fiatAmount = req.body.fiatAmount;
                keys.activeAddresses[address].fiatCurrency = req.body.fiatCurrency || 'AUD';
            }
            secureWriteFile('./Json/keys.json', JSON.stringify(keys, null, 2));
            res.json({
                success: true,
                address: address,
                networkId: 11155111,
                networkType: 'sepolia',
                expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
                note: 'Emergency address generated'
            });
        } catch (recoveryError) {
            logger.error('Failed to recover with HD wallet, falling back to random wallet', { error: recoveryError });
            const wallet = ethers.Wallet.createRandom();
            res.status(500).json({
                success: false,
                error: 'Failed to generate payment address and emergency fallback failed.' + recoveryError.message
            });
        }
    }
};

exports.processPayment = async (req, res, web3) => {
    console.log('DEBUG: typeof web3:', typeof web3);
    console.log('DEBUG: web3.eth:', web3 && web3.eth);
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
                    } else if (txReceipt.blockNumber && !txReceipt.status) {
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
                    } else {
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
                } else {
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
};

exports.recordPayment = async (req, res) => {
    try {
        const { address, amount, cryptoType } = req.body;
        console.log(`[DEBUG] /api/record-payment called: address=${address}, amount=${amount}, cryptoType=${cryptoType}`);
        if (!address || !amount) {
            console.log('[DEBUG] Missing address or amount in /api/record-payment');
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
            console.log(`[DEBUG] Rejecting payment to expired address ${address}`);
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
            console.log(`[DEBUG] Checking payment amount: expected=${ethAmount}, actual=${formattedAmount}`);
            // Check if the payment amount is correct
            const isCorrect = isPaymentAmountCorrect(paymentObj);
            console.log(`[DEBUG] isPaymentAmountCorrect result: ${isCorrect}`);
            // If not correct, it's a wrong payment
            isWrong = !isCorrect;
            // Set the reason for wrong payment
            if (isWrong) {
                wrongReason = `Please submit ${ethAmount} ETH. You sent ${formattedAmount} ETH which is incorrect.`;
                console.log(`[DEBUG] Wrong payment detected: ${wrongReason}`);
                console.log('[DEBUG] Full payment object:', JSON.stringify(paymentObj));
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
        console.log(`[DEBUG] Payment accepted as correct for address=${address}, amount=${formattedAmount}`);
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
};

exports.verifyTransaction = async (req, res) => {
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
            txReceipt = await global.web3.eth.getTransactionReceipt(txHash);
            // If no receipt, try with a fresh provider
            if (!txReceipt) {
                console.log('Transaction receipt not found with primary provider, trying alternative');
                const altWeb3 = await getFreshProvider();
                txReceipt = await altWeb3.eth.getTransactionReceipt(txHash);
            }
            // Get full transaction details if we have a receipt
            if (txReceipt) {
                txDetails = await global.web3.eth.getTransaction(txHash);
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
                    value: txDetails.value ? global.web3.utils.fromWei(txDetails.value, 'ether') + ' ETH' : '0 ETH',
                    gasPrice: txDetails.gasPrice ? global.web3.utils.fromWei(txDetails.gasPrice, 'gwei') + ' gwei' : 'unknown',
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
            const currentBlock = await global.web3.eth.getBlockNumber();
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
}; 