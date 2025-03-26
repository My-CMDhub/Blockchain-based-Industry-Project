/**
 * Fund Recovery and Release Test Script
 * This script verifies wallet recovery and tests fund release
 */

require('dotenv').config();
const Web3 = require('web3');
const fs = require('fs');
const path = require('path');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const { decrypt } = require('./encryptionUtils');

// Constants
const MERCHANT_ADDRESS = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b';

// Get RPC URLs from environment or use defaults
const INFURA_URL = process.env.INFURA_URL || 'https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9';
const ALCHEMY_URL = process.env.ALCHEMY_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo';

// Initialize Web3 with multiple provider options
async function getWeb3Provider() {
    const providerUrls = [
        'https://ethereum-sepolia.publicnode.com',
        INFURA_URL,
        ALCHEMY_URL,
        'https://rpc.sepolia.org',
        'https://sepolia.gateway.tenderly.co'
    ];
    
    for (const url of providerUrls) {
        try {
            console.log(`Trying provider: ${url}`);
            const provider = new Web3.providers.HttpProvider(url, {
                timeout: 30000
            });
            const web3 = new Web3(provider);
            const isConnected = await web3.eth.net.isListening();
            const blockNumber = await web3.eth.getBlockNumber();
            if (isConnected) {
                console.log(`Connected to provider. Current block: ${blockNumber}`);
                return web3;
            }
        } catch (error) {
            console.error(`Failed to connect to ${url}: ${error.message}`);
        }
    }
    throw new Error('Could not connect to any provider');
}

// Function to recover wallet from mnemonic
async function recoverWallet(mnemonic, index = 0) {
    try {
        console.log(`Recovering wallet for index ${index}...`);
        const bip32 = BIP32Factory(ecc);
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const masterKey = bip32.fromSeed(seed);
        
        // Derive path with index
        const safeIndex = Number(index) >>> 0;
        const path = `m/44'/60'/0'/0/${safeIndex}`;
        console.log(`Using derivation path: ${path}`);
        
        const child = masterKey.derivePath(path);
        const privateKey = child.privateKey.toString('hex');
        const account = new Web3().eth.accounts.privateKeyToAccount('0x' + privateKey);
        
        return { 
            address: account.address,
            privateKey: '0x' + privateKey,
            index
        };
    } catch (error) {
        console.error('Error recovering wallet:', error);
        throw error;
    }
}

// Function to get keys from storage
function getStoredKeys() {
    try {
        const keysPath = path.join(__dirname, 'Json', 'keys.json');
        if (!fs.existsSync(keysPath)) {
            throw new Error('Keys file not found');
        }
        
        const keysData = fs.readFileSync(keysPath, 'utf8');
        return JSON.parse(keysData);
    } catch (error) {
        console.error('Error reading keys:', error);
        throw error;
    }
}

// Function to estimate gas price
async function getGasPrice(web3) {
    try {
        // Get the network gas price
        const networkGasPrice = await web3.eth.getGasPrice();
        console.log(`Network gas price: ${web3.utils.fromWei(networkGasPrice, 'gwei')} gwei`);
        
        // Ensure minimum gas price of 1 gwei
        const minGasPrice = web3.utils.toWei('1', 'gwei');
        let gasPrice = BigInt(networkGasPrice) > BigInt(minGasPrice) ? 
            networkGasPrice : minGasPrice;
            
        // Add 20% to ensure it gets mined quickly
        const increasedGasPrice = (BigInt(gasPrice) * BigInt(120) / BigInt(100)).toString();
        console.log(`Using gas price: ${web3.utils.fromWei(increasedGasPrice, 'gwei')} gwei`);
        
        return increasedGasPrice;
    } catch (error) {
        console.error('Error estimating gas price:', error);
        // Fallback to 1.5 gwei
        const fallbackPrice = web3.utils.toWei('1.5', 'gwei');
        console.log(`Using fallback gas price: 1.5 gwei`);
        return fallbackPrice;
    }
}

// Function to check and send a transaction
async function checkAndSendTransaction(web3, fromAddress, privateKey, amount = "all") {
    try {
        // Get account balance
        const balanceWei = await web3.eth.getBalance(fromAddress);
        const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
        console.log(`Address ${fromAddress} has balance: ${balanceEth} ETH`);
        
        if (balanceWei === '0') {
            console.error('This address has zero balance, cannot send transaction');
            return null;
        }
        
        // Get gas price and estimate gas cost
        const gasPrice = await getGasPrice(web3);
        const gasLimit = 21000; // Standard ETH transfer
        const gasCost = BigInt(gasPrice) * BigInt(gasLimit);
        
        console.log(`Estimated gas cost: ${web3.utils.fromWei(gasCost.toString(), 'ether')} ETH`);
        
        // Determine amount to send
        let valueToSend;
        if (amount === "all") {
            // Send all funds minus gas
            if (BigInt(balanceWei) <= gasCost) {
                console.error('Insufficient funds to cover gas costs');
                return null;
            }
            valueToSend = BigInt(balanceWei) - gasCost;
            console.log(`Sending all available funds: ${web3.utils.fromWei(valueToSend.toString(), 'ether')} ETH`);
        } else {
            // Send specific amount
            valueToSend = web3.utils.toWei(amount, 'ether');
            const totalNeeded = BigInt(valueToSend) + gasCost;
            
            if (BigInt(balanceWei) < totalNeeded) {
                console.error(`Insufficient funds. Have ${balanceEth} ETH, need ${web3.utils.fromWei(totalNeeded.toString(), 'ether')} ETH`);
                return null;
            }
            console.log(`Sending specific amount: ${amount} ETH`);
        }
        
        // Get nonce
        const nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
        console.log(`Using nonce: ${nonce}`);
        
        // Prepare transaction
        const txData = {
            from: fromAddress,
            to: MERCHANT_ADDRESS,
            value: '0x' + valueToSend.toString(16),
            gas: gasLimit,
            gasPrice: gasPrice,
            nonce: nonce
        };
        
        console.log('Transaction data:', txData);
        
        // Sign transaction
        console.log('Signing transaction...');
        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        console.log(`Transaction signed. Hash: ${signedTx.transactionHash}`);
        
        // Send transaction
        console.log('Sending transaction...');
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        console.log('Transaction confirmed!');
        console.log(`Transaction hash: ${receipt.transactionHash}`);
        console.log(`Block number: ${receipt.blockNumber}`);
        console.log(`Gas used: ${receipt.gasUsed}`);
        
        return receipt;
    } catch (error) {
        console.error('Error sending transaction:', error.message);
        return null;
    }
}

// Main function
async function main() {
    try {
        // Initialize Web3
        const web3 = await getWeb3Provider();
        
        // Get stored keys
        const keys = getStoredKeys();
        console.log('Keys retrieved successfully');
        
        // Decrypt mnemonic
        const mnemonic = decrypt(keys.mnemonic);
        console.log('Mnemonic decrypted successfully');
        
        // Check all active addresses
        console.log('\n=== CHECKING ACTIVE ADDRESSES ===');
        const addresses = [];
        
        // First check root address (index 0)
        const rootWallet = await recoverWallet(mnemonic, 0);
        addresses.push(rootWallet);
        
        // Check balance of root address
        const rootBalance = await web3.eth.getBalance(rootWallet.address);
        console.log(`Root address: ${rootWallet.address}`);
        console.log(`Root balance: ${web3.utils.fromWei(rootBalance, 'ether')} ETH`);
        
        // Check other addresses if available
        if (keys.activeAddresses) {
            console.log('\n=== CHECKING ADDITIONAL ADDRESSES ===');
            const additionalAddresses = Object.keys(keys.activeAddresses);
            
            for (const addr of additionalAddresses) {
                const index = keys.activeAddresses[addr].index || 0;
                console.log(`Checking address ${addr} (index: ${index})`);
                
                // Recover this wallet to confirm address matches
                const wallet = await recoverWallet(mnemonic, index);
                
                // Verify the address matches
                if (wallet.address.toLowerCase() !== addr.toLowerCase()) {
                    console.error(`WARNING: Address mismatch! Stored: ${addr}, Derived: ${wallet.address}`);
                    console.log('This indicates a possible issue with address derivation paths');
                } else {
                    console.log(`Address verified correctly: ${wallet.address}`);
                    addresses.push(wallet);
                }
                
                // Check balance
                const balance = await web3.eth.getBalance(addr);
                console.log(`Balance: ${web3.utils.fromWei(balance, 'ether')} ETH`);
            }
        }
        
        // Find address with highest balance
        let highestBalanceAddr = null;
        let highestBalance = BigInt(0);
        
        for (const wallet of addresses) {
            const balance = BigInt(await web3.eth.getBalance(wallet.address));
            if (balance > highestBalance) {
                highestBalance = balance;
                highestBalanceAddr = wallet;
            }
        }
        
        if (!highestBalanceAddr || highestBalance === BigInt(0)) {
            console.error('No addresses with balance found');
            return;
        }
        
        console.log('\n=== FOUND HIGHEST BALANCE ADDRESS ===');
        console.log(`Address: ${highestBalanceAddr.address}`);
        console.log(`Balance: ${web3.utils.fromWei(highestBalance.toString(), 'ether')} ETH`);
        console.log(`Index: ${highestBalanceAddr.index}`);
        
        // Ask for confirmation before sending
        console.log('\n⚠️ Ready to release funds to merchant address ⚠️');
        console.log(`From: ${highestBalanceAddr.address}`);
        console.log(`To: ${MERCHANT_ADDRESS}`);
        console.log(`Amount: All available funds (gas cost will be deducted)`);
        
        // Send the transaction
        console.log('\nSending transaction...');
        const receipt = await checkAndSendTransaction(
            web3, 
            highestBalanceAddr.address, 
            highestBalanceAddr.privateKey,
            "all" // Send all available funds
        );
        
        if (receipt) {
            console.log('\n✅ TRANSACTION SUCCESSFUL ✅');
            console.log(`Transaction hash: ${receipt.transactionHash}`);
            console.log(`Block number: ${receipt.blockNumber}`);
            console.log(`Gas used: ${receipt.gasUsed}`);
        } else {
            console.log('\n❌ TRANSACTION FAILED ❌');
        }
        
    } catch (error) {
        console.error('Error in main function:', error);
    }
}

// Run the main function
main().catch(console.error); 