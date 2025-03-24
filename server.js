require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Web3 = require('web3');
const { recoverWallet } = require('./recover.js');
const { decrypt } = require('./encryptionUtils');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('Public'));

const MERCHANT_ADDRESS = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
const INFURA_URL = process.env.INFURA_URL || 'https://sepolia.infura.io/v3/29f19992ba7f4f08b1c391ae0bab9b44';
const web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));

// Get HD Wallet Balance
app.get('/api/wallet-balance', async (req, res) => {
    try {
        const keys = JSON.parse(fs.readFileSync('./Json/keys.json', 'utf8'));
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

// Simulate payment to HD Wallet
app.post('/api/simulate-payment', async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount) {
            return res.status(400).json({
                success: false,
                error: 'Amount is required'
            });
        }

        // Get user's MetaMask address
        const accounts = await web3.eth.getAccounts();
        if (!accounts || accounts.length === 0) {
            throw new Error('No MetaMask account found');
        }
        const userAddress = accounts[0];

        // Get HD wallet address
        const keys = JSON.parse(fs.readFileSync('./Json/keys.json', 'utf8'));
        const mnemonic = decrypt(keys.mnemonic);
        const { address: hdWalletAddress } = await recoverWallet(mnemonic);

        // Create transaction
        const amountInWei = web3.utils.toWei(amount.toString(), 'ether');
        const tx = {
            from: userAddress,
            to: hdWalletAddress,
            value: amountInWei,
            gas: '21000'
        };

        // Send transaction
        const receipt = await web3.eth.sendTransaction(tx);

        res.json({
            success: true,
            txHash: receipt.transactionHash,
            from: userAddress,
            to: hdWalletAddress,
            amount: amount
        });

    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process payment: ' + error.message
        });
    }
});

// Release funds from HD Wallet to merchant
app.post('/api/release-funds', async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount) {
            return res.status(400).json({
                success: false,
                error: 'Amount is required'
            });
        }

        // Recover wallet
        const keys = JSON.parse(fs.readFileSync('./Json/keys.json', 'utf8'));
        const mnemonic = decrypt(keys.mnemonic);
        const { address, privateKey } = await recoverWallet(mnemonic);

        // Check balance
        const balance = await web3.eth.getBalance(address);
        const amountInWei = web3.utils.toWei(amount.toString(), 'ether');
        
        if (BigInt(balance) < BigInt(amountInWei)) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient funds in HD wallet'
            });
        }

        // Prepare transaction
        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = '21000';
        const nonce = await web3.eth.getTransactionCount(address, 'latest');

        const tx = {
            from: address,
            to: MERCHANT_ADDRESS,
            value: amountInWei,
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce
        };

        // Sign and send transaction
        console.log('Signing transaction...');
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        
        console.log('Sending transaction...');
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        console.log('Transaction successful:', receipt.transactionHash);
        
        res.json({
            success: true,
            txHash: receipt.transactionHash,
            amount: amount
        });

    } catch (error) {
        console.error('Error releasing funds:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to release funds: ' + error.message
        });
    }
});

// Serve payment flow dashboard
app.get('/flow', (req, res) => {
    res.sendFile(__dirname + '/Public/payment-flow.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access payment flow dashboard at http://localhost:${PORT}/flow`);
});
