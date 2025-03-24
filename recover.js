require('dotenv').config();
const Web3 = require('web3');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);
const fs = require('fs');
const { decrypt } = require('./encryptionUtils');

const MERCHANT_ADDRESS = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
const INFURA_URL = 'https://sepolia.infura.io/v3/29f19992ba7f4f08b1c391ae0bab9b44';
const web3 = new Web3(new Web3.providers.HttpProvider(INFURA_URL));

// Function to get the stored keys
const getStoredKeys = () => {
    try {
        const keysContent = fs.readFileSync('./Json/keys.json', 'utf8');
        return JSON.parse(keysContent);
    } catch (error) {
        console.error('Error reading keys file:', error);
        throw error;
    }
};

// Function to recover wallet from mnemonic
const recoverWallet = async (mnemonic) => {
    try {
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const masterKey = bip32.fromSeed(seed);
        const path = "m/44'/60'/0'/0/0";
        const child = masterKey.derivePath(path);
        const privateKey = '0x' + child.privateKey.toString('hex');
        const address = web3.eth.accounts.privateKeyToAccount(privateKey).address;

        return { address, privateKey };
    } catch (error) {
        console.error('Error recovering wallet:', error);
        throw error;
    }
};

// Function to transfer funds
const transferFunds = async (fromAddress, privateKey) => {
    try {
        const balance = await web3.eth.getBalance(fromAddress);
        console.log('Current balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');

        if (BigInt(balance) <= 0) {
            throw new Error('No balance to transfer');
        }

        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = '21000';
        const maxGasCost = BigInt(gasLimit) * BigInt(gasPrice);
        const valueToSend = BigInt(balance) - maxGasCost;

        console.log('Gas cost:', web3.utils.fromWei(maxGasCost.toString(), 'ether'), 'ETH');
        console.log('Amount to send:', web3.utils.fromWei(valueToSend.toString(), 'ether'), 'ETH');

        const tx = {
            from: fromAddress,
            to: MERCHANT_ADDRESS,
            value: '0x' + valueToSend.toString(16),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: await web3.eth.getTransactionCount(fromAddress, 'latest')
        };

        console.log('Signing transaction...');
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        
        console.log('Sending transaction...');
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        console.log('Transaction successful!');
        console.log('Transaction hash:', receipt.transactionHash);
        return receipt;
    } catch (error) {
        console.error('Error transferring funds:', error);
        throw error;
    }
};

// Main recovery function
const recover = async () => {
    try {
        console.log('Reading stored keys...');
        const keys = getStoredKeys();

        console.log('Decrypting mnemonic...');
        const mnemonic = decrypt(keys.mnemonic);
        
        console.log('Recovering wallet...');
        const { address, privateKey } = await recoverWallet(mnemonic);
        console.log('Recovered address:', address);
        
        console.log('Transferring funds...');
        const receipt = await transferFunds(address, privateKey);
        
        console.log('Recovery complete!');
        console.log('Check transaction on Etherscan:', `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`);
    } catch (error) {
        console.error('Recovery failed:', error);
    }
};

// Run the recovery process
recover();
