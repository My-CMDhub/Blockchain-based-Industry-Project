// Etherscan API utility functions
const axios = require('axios');
const { logBlockchain } = require('./logger');

// Get the Etherscan API key from environment variables or use default
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '29f19992ba7f4f08b1c391ae0bab9b44';
const ETHERSCAN_BASE_URL = 'https://api-sepolia.etherscan.io/api';

/**
 * Get transaction details from Etherscan API
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} - Transaction details
 */
async function getTransactionDetails(txHash) {
    try {
        console.log(`Fetching transaction details from Etherscan for ${txHash} using API key: ${ETHERSCAN_API_KEY.substring(0, 5)}...`);
        
        // Make request to Etherscan API
        const response = await axios.get(ETHERSCAN_BASE_URL, {
            params: {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: txHash,
                apikey: ETHERSCAN_API_KEY
            },
            timeout: 10000 // 10 second timeout
        });
        
        if (response.data && response.data.result) {
            console.log(`Successfully fetched transaction details for ${txHash}`);
            return response.data.result;
        } else if (response.data && typeof response.data === 'string' && response.data.includes('Invalid API Key')) {
            console.error(`Error fetching transaction from Etherscan: Invalid API key`);
            throw new Error('Invalid Etherscan API key');
        } else if (response.data && response.data.error) {
            console.error(`Error from Etherscan API: ${response.data.error}`);
            throw new Error(`Etherscan API error: ${response.data.error}`);
        } else {
            console.error(`Error fetching transaction from Etherscan: No result returned for ${txHash}`);
            throw new Error(`No transaction details found for hash ${txHash}`);
        }
    } catch (error) {
        console.error(`Error fetching transaction from Etherscan:`, error.message);
        throw error;
    }
}

/**
 * Get transaction receipt from Etherscan API
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} - Transaction receipt
 */
async function getTransactionReceipt(txHash) {
    try {
        console.log(`Fetching transaction receipt from Etherscan for ${txHash}`);
        
        // Make request to Etherscan API
        const response = await axios.get(ETHERSCAN_BASE_URL, {
            params: {
                module: 'proxy',
                action: 'eth_getTransactionReceipt',
                txhash: txHash,
                apikey: ETHERSCAN_API_KEY
            },
            timeout: 10000 // 10 second timeout
        });
        
        if (response.data && response.data.result) {
            console.log(`Successfully fetched transaction receipt for ${txHash}`);
            return response.data.result;
        } else {
            console.error(`Error fetching transaction receipt: No result returned for ${txHash}`);
            throw new Error(`No transaction receipt found for hash ${txHash}`);
        }
    } catch (error) {
        console.error(`Error fetching transaction receipt from Etherscan:`, error.message);
        throw error;
    }
}

/**
 * Get block details from Etherscan API
 * @param {string} blockNumber - Block number (in hex or decimal)
 * @returns {Promise<Object>} - Block details
 */
async function getBlockDetails(blockNumber) {
    try {
        console.log(`Fetching block details from Etherscan for block ${blockNumber}`);
        
        // Convert decimal to hex if needed
        const blockNumberHex = typeof blockNumber === 'number' || /^\d+$/.test(blockNumber)
            ? `0x${parseInt(blockNumber).toString(16)}`
            : blockNumber;
        
        // Make request to Etherscan API
        const response = await axios.get(ETHERSCAN_BASE_URL, {
            params: {
                module: 'proxy',
                action: 'eth_getBlockByNumber',
                tag: blockNumberHex,
                boolean: 'true', // Include transaction details
                apikey: ETHERSCAN_API_KEY
            },
            timeout: 10000 // 10 second timeout
        });
        
        if (response.data && response.data.result) {
            console.log(`Successfully fetched block details for block ${blockNumber}`);
            return response.data.result;
        } else {
            console.error(`Error fetching block details: No result returned for block ${blockNumber}`);
            throw new Error(`No block details found for block ${blockNumber}`);
        }
    } catch (error) {
        console.error(`Error fetching block details from Etherscan:`, error.message);
        throw error;
    }
}

/**
 * Get complete transaction information combining transaction details and receipt
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} - Complete transaction information
 */
async function getCompleteTransactionInfo(txHash) {
    try {
        // Make both requests in parallel
        const [txDetails, txReceipt] = await Promise.all([
            getTransactionDetails(txHash),
            getTransactionReceipt(txHash)
        ]);
        
        console.log('Raw transaction details:', JSON.stringify(txDetails, null, 2));
        console.log('Raw transaction receipt:', JSON.stringify(txReceipt, null, 2));
        
        // Get block details if we have blockNumber
        let blockDetails = null;
        if (txDetails.blockNumber) {
            try {
                blockDetails = await getBlockDetails(txDetails.blockNumber);
            } catch (blockError) {
                console.warn(`Failed to get block details for block ${txDetails.blockNumber}:`, blockError.message);
                // Continue without block details
            }
        }
        
        // Combine the results - be more explicit about extracting fields from txDetails and txReceipt
        return {
            transaction: txDetails,
            receipt: txReceipt,
            block: blockDetails,
            // Add derived fields that are useful for display
            from: txDetails.from || txReceipt.from,
            to: txDetails.to || txReceipt.to,
            value: txDetails.value || '0x0',
            gasUsed: txReceipt.gasUsed || '0x0',
            gasPrice: txDetails.gasPrice || '0x0',
            blockNumber: txDetails.blockNumber || txReceipt.blockNumber || '0x0',
            timestamp: blockDetails ? blockDetails.timestamp : null,
            status: txReceipt.status === '0x1', // true if successful
            confirmations: null, // Need current block number to calculate this
            hash: txHash
        };
    } catch (error) {
        console.error(`Error getting complete transaction info:`, error.message);
        throw error;
    }
}

module.exports = {
    getTransactionDetails,
    getTransactionReceipt,
    getBlockDetails,
    getCompleteTransactionInfo
}; 