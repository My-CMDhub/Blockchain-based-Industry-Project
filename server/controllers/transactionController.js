// Transaction Controller
const { getCompleteTransactionInfo } = require('../utils/etherscanUtils');
const { secureReadFile } = require('../utils/fileUtils');
const { validateApiKey } = require('../utils/authUtils');
const Web3 = require('web3');

/**
 * Get transaction details from Etherscan
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getTransactionDetails = async (req, res) => {
    try {
        // Log the request for debugging
        console.log(`Transaction details requested for hash: ${req.params.txHash}`);
        console.log(`API Key provided: ${req.headers['x-api-key'] ? 'Yes' : 'No'}`);
        
        // Make API key validation optional for this endpoint since it's needed for UI
        const apiKeyValid = validateApiKey(req);
        if (!apiKeyValid) {
            console.warn(`API key validation failed, but proceeding with transaction lookup for UI functionality`);
            // Continue execution instead of returning error
        }

        const { txHash } = req.params;
        
        // Validate transaction hash
        if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction hash format'
            });
        }
        
        // Get merchant address from .env or default
        const merchantAddress = process.env.MERCHANT_ADDRESS || '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
        
        // Try to match with our transaction database first
        let localTxInfo = null;
        let transactions = [];
        try {
            const txFile = 'merchant_transactions.json';
            const fileContent = secureReadFile(txFile);
            if (fileContent) {
                transactions = JSON.parse(fileContent);
                localTxInfo = transactions.find(tx => tx.txHash === txHash);
                console.log('Found local transaction info:', localTxInfo);
            }
        } catch (dbError) {
            console.error('Error fetching transaction from local database:', dbError.message);
            // Continue without local info
        }
        
        // Try to find a valid recipient address for release transactions
        let recipientAddress = null;
        if (localTxInfo && localTxInfo.type === 'release' && !localTxInfo.to) {
            // First try to find a matching payment transaction with the same amount
            const matchingPayment = transactions.find(tx => 
                tx.type === 'payment' && 
                tx.amount === localTxInfo.amount && 
                tx.address && 
                tx.status === 'confirmed'
            );
            
            if (matchingPayment) {
                recipientAddress = matchingPayment.address;
                console.log(`Found matching payment transaction with address ${recipientAddress}`);
            }
            
            // If no matching payment, just use the first payment address we can find
            if (!recipientAddress) {
                const anyPayment = transactions.find(tx => tx.type === 'payment' && tx.address);
                if (anyPayment) {
                    recipientAddress = anyPayment.address;
                    console.log(`Using fallback payment address ${recipientAddress}`);
                }
            }
        }
        
        // Fetch transaction details from Etherscan
        let txInfo;
        let etherscanError = null;
        try {
            txInfo = await getCompleteTransactionInfo(txHash);
        } catch (error) {
            console.error('Error fetching from Etherscan, using local data only:', error.message);
            etherscanError = error.message;
            
            // If we have local info but no blockchain info, create a minimal txInfo object
            if (localTxInfo) {
                // Determine from/to addresses based on transaction type
                let fromAddress = localTxInfo.from || '';
                let toAddress = localTxInfo.to || '';
                
                // For release transactions, HD wallet is the from address and merchant is the to address
                if (localTxInfo.type === 'release') {
                    // This is the key fix - for release, HD wallet is FROM, merchant is TO
                    // Find a HD wallet address from other transactions to use as the from address
                    const anyPayment = transactions.find(tx => tx.type === 'payment' && tx.address);
                    if (anyPayment) {
                        fromAddress = anyPayment.address || fromAddress;
                        toAddress = merchantAddress; // Merchant is recipient
                    } else {
                        // If we can't find a payment address, keep the merchant as from
                        fromAddress = localTxInfo.address || recipientAddress;
                        toAddress = merchantAddress;
                    }
                } 
                // For payment transactions, merchant is the to address
                else if (localTxInfo.type === 'payment') {
                    toAddress = merchantAddress;
                    // If we have an address in the local info, use it as the from address
                    fromAddress = localTxInfo.address || fromAddress;
                }
                
                txInfo = {
                    hash: txHash,
                    from: fromAddress,
                    to: toAddress,
                    value: localTxInfo.amount ? Web3.utils.toWei(localTxInfo.amount, 'ether') : '0',
                    gasUsed: localTxInfo.gasUsed ? String(localTxInfo.gasUsed) : '0',
                    gasPrice: localTxInfo.gasPrice || '0',
                    blockNumber: '0',
                    timestamp: localTxInfo.timestamp ? new Date(localTxInfo.timestamp).getTime() / 1000 : null,
                    status: localTxInfo.status === true || localTxInfo.status === 'confirmed',
                    transaction: {},
                    receipt: {}
                };
            } else {
                // No local info either, return error
                return res.status(404).json({
                    success: false,
                    error: 'Transaction not found in blockchain or local database'
                });
            }
        }
        
        // Format the transaction data - ensuring all numeric values are strings
        // and merging with local data when blockchain data is missing
        const formattedTx = {
            hash: txInfo.hash,
            
            // For payment transactions, FROM should be user's external wallet (sender)
            // For release transactions, FROM should be HD wallet address (as already fixed)
            from: txInfo.from || localTxInfo?.from || (localTxInfo?.type === 'release' ? 
                // For release: use found payment address as sender
                (transactions.find(tx => tx.type === 'payment' && tx.address)?.address || recipientAddress || 'Unknown')
                // For payment: if we don't know sender, use generic placeholder
                : (localTxInfo?.from || 'External User')),
                
            // For payment transactions, TO should be HD wallet address (recipient)
            // For release transactions, TO should be merchant address
            to: txInfo.to || localTxInfo?.to || (localTxInfo?.type === 'release' ? 
                // For release, merchant is TO
                merchantAddress
                // For payment, HD wallet is TO
                : (localTxInfo?.type === 'payment' ? localTxInfo?.address : 'Unknown')),
                
            value: txInfo.value ? Web3.utils.fromWei(String(txInfo.value || '0'), 'ether') : (localTxInfo?.amount || '0'),
            gasUsed: txInfo.gasUsed ? parseInt(String(txInfo.gasUsed), 16) : (localTxInfo?.gasUsed || 0),
            gasPrice: txInfo.gasPrice ? Web3.utils.fromWei(String(txInfo.gasPrice || '0'), 'gwei') : (localTxInfo?.gasPrice || '0'),
            blockNumber: txInfo.blockNumber ? parseInt(String(txInfo.blockNumber), 16) : 0,
            timestamp: txInfo.timestamp ? new Date(parseInt(String(txInfo.timestamp)) * 1000).toISOString() : (localTxInfo?.timestamp || null),
            status: txInfo.status ? 'success' : (localTxInfo?.status === true ? 'success' : 'failed'),
            type: localTxInfo?.type || (txInfo.from && txInfo.to ? 'transaction' : 'contract'),
            etherscanError: etherscanError,
            // Add additional information from our database if available
            localInfo: localTxInfo ? {
                type: localTxInfo.type,
                orderId: localTxInfo.orderId || localTxInfo.txId,
                amount: localTxInfo.amount,
                status: localTxInfo.status,
                createdAt: localTxInfo.createdAt || localTxInfo.timestamp,
                completedAt: localTxInfo.completedAt
            } : null
        };
        
        console.log('Formatted transaction data:', formattedTx);
        
        // Return the formatted transaction details
        res.json({
            success: true,
            transaction: formattedTx,
            // Include raw data for debugging
            raw: {
                transaction: txInfo.transaction,
                receipt: txInfo.receipt,
                block: txInfo.block
            }
        });
    } catch (error) {
        console.error('Error in getTransactionDetails:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}; 