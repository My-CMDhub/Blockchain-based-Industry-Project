
const express = require('express');
const cors = require('cors');
const Web3 = require('web3');
const fs = require('fs');
const { recoverWallet, getStoredKeys } = require('./recover.js');
const { decrypt } = require('./encryptionUtils');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('Public'));

const MERCHANT_ADDRESS = process.env.MERCHANT_ADDRESS;
const INFURA_URL = process.env.INFURA_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));

// Main e-commerce page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/Public/Product.html');
});

// Merchant dashboard
app.get('/merchant', (req, res) => {
    res.sendFile(__dirname + '/Public/merchant-dashboard.html');
});

// Get HD Wallet Balance
app.get('/api/wallet-balance', async (req, res) => {
    try {
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        const { address } = await recoverWallet(mnemonic);
        
        const balance = await web3.eth.getBalance(address);
        const balanceInEth = web3.utils.fromWei(balance, 'ether');
        
        res.json({
            success: true,
            balance: balanceInEth,
            address: address
        });
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get wallet balance'
        });
    }
});

// Generate new payment address
app.post('/api/generate-payment-address', async (req, res) => {
    try {
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        const { address } = await recoverWallet(mnemonic);

        res.json({
            success: true,
            address: address,
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString() // 30 minutes expiry
        });
    } catch (error) {
        console.error('Error generating payment address:', error); // Log the error
        res.status(500).json({
            success: false,
            error: 'Failed to generate payment address'
        });
    }
});

// Process payment
app.post('/api/process-payment', async (req, res) => {
    const { amount, cryptoType } = req.body;
    try {
        // Here you would implement actual payment processing
        // For demo, we'll simulate a successful payment
        const txHash = '0x' + Math.random().toString(36).substr(2, 40);
        
        res.json({
            success: true,
            txHash: txHash,
            message: 'Payment processed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Payment processing failed'
        });
    }
});

// Release funds to merchant
app.post('/api/release-funds', async (req, res) => {
    const { amount } = req.body;
    try {
        const keys = getStoredKeys();
        const mnemonic = decrypt(keys.mnemonic);
        const { address, privateKey } = await recoverWallet(mnemonic);
        
        // Implement actual fund transfer here
        try {
            const receipt = await transferFunds(address, privateKey);
            console.log('Transaction receipt:', receipt);
            res.json({
                success: true,
                txHash: receipt.transactionHash,
                message: 'Funds released successfully'
            });
        } catch (error) {
            console.error('Error releasing funds:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to release funds: ' + error.message
            });
        }
    } catch (error) {
        console.error('Error in release funds endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process release funds request'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access e-commerce store at http://localhost:${PORT}`);
    console.log(`Access merchant dashboard at http://localhost:${PORT}/merchant`);
});
