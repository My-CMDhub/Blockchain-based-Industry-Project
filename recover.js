require('dotenv').config();
const Web3 = require('web3');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);
const fs = require('fs');
const { decrypt } = require('./encryptionUtils');

const MERCHANT_ADDRESS = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';
const INFURA_URL = process.env.INFURA_URL;
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
const recoverWallet = async (mnemonic, index = 0) => {
    try {
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const masterKey = bip32.fromSeed(seed);
        
        // Ensure index is UInt32
        const safeIndex = Number(index) >>> 0;
        const path = `m/44'/60'/0'/0/${safeIndex}`;
        console.log(`Deriving address with path: ${path}`);
        
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
        if (BigInt(balance) <= 0) {
            throw new Error('No balance to transfer');
        }

        const gasPrice = await web3.eth.getGasPrice();
        const gasLimit = '21000';
        const maxGasCost = BigInt(gasLimit) * BigInt(gasPrice);
        const valueToSend = BigInt(balance) - maxGasCost;

        const tx = {
            from: fromAddress,
            to: MERCHANT_ADDRESS,
            value: '0x' + valueToSend.toString(16),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: await web3.eth.getTransactionCount(fromAddress, 'latest')
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        return receipt;
    } catch (error) {
        console.error('Error transferring funds:', error);
        throw error;
    }
};

module.exports = {
    getStoredKeys,
    recoverWallet,
    transferFunds
};
