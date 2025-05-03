// Merchant Controller

const fs = require('fs');
const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
const Web3 = require('web3');
const web3 = global.web3 || new Web3();

exports.getMerchantTransactions = async (req, res) => {
    const cachedWrongPaymentsKey = 'wrong_payments_cache';
    const cachedWrongPaymentsTimestampKey = 'wrong_payments_timestamp';
    try {
        res.set('Cache-Control', 'private, max-age=30');
        const cachedTxKey = 'tx_history_cache';
        const cachedTxTimestampKey = 'tx_history_timestamp';
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
        wrongPayments.sort((a, b) => {
            if (!a.timestamp) return 1;
            if (!b.timestamp) return -1;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        let wrongPaymentsAmount = "0";
        try {
            if (wrongPayments.length > 0) {
                let totalWei = BigInt(0);
                for (const tx of wrongPayments) {
                    try {
                        let amountWei;
                        if (tx.amountWei) {
                            amountWei = tx.amountWei.toString();
                        } else if (typeof tx.amount === 'string' && tx.amount.includes('.')) {
                            amountWei = web3.utils.toWei(tx.amount, 'ether');
                        } else {
                            amountWei = tx.amount.toString();
                        }
                        totalWei = totalWei + BigInt(amountWei);
                    } catch (e) {
                        console.error('Error processing wrong payment amount:', e, tx);
                    }
                }
                wrongPaymentsAmount = web3.utils.fromWei(totalWei.toString(), 'ether');
            }
        } catch (countError) {
            console.error('Error calculating wrong payments total:', countError);
        }
        const responseData = {
            success: true,
            wrongPayments: wrongPayments,
            total: wrongPayments.length,
            wrongPaymentsAmount: wrongPaymentsAmount,
            timestamp: Date.now()
        };
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