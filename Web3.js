// const Moralis = require('moralis').default;
// const Web3 = require('web3');
// const bip39 = require('bip39');
// const { BIP32Factory } = require('bip32');
// const ecc = require('tiny-secp256k1');
// const bip32 = BIP32Factory(ecc);

// const infuraUrl = 'https://site2.moralis-nodes.com/sepolia/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjU3MzE4Njc0LWNiNGYtNGIxMi04YWE5LTc5ZTZkZDcwZmEwMSIsIm9yZ0lkIjoiNDA3OTg3IiwidXNlcklkIjoiNDE5MjI2IiwidHlwZUlkIjoiY2M1NjdmNDktMjA0Ny00ZTVjLTliOGMtYzU2OWQ3Yjk3YjliIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjYwMjg2MzYsImV4cCI6NDg4MTc4ODYzNn0.TMa0sAyzX-dB7xVJmaLr0Kpko3CNe8ehLkafEeSHjso';
// const web3 = new Web3(new Web3.providers.WebsocketProvider(infuraUrl, {
//     clientConfig: {
//         keepalive: true,
//         keepaliveInterval: 30000 // Send a ping every 60 seconds
//     },
//     reconnect: {
//         auto: true,
//         delay: 10000, // ms
//         maxAttempts: 50,
//         onTimeout: true
//     }
// }));

// const generateAddress = () => {
//     let mnemonic, masterKey;

//     try {
//         mnemonic = bip39.generateMnemonic();
//         const seed = bip39.mnemonicToSeedSync(mnemonic);
//         masterKey = bip32.fromSeed(seed);

//         const path = "m/44'/60'/0'/0/0";
//         const child = masterKey.derivePath(path);
//         const privateKey = '0x' + child.privateKey.toString('hex');
//         const address = web3.eth.accounts.privateKeyToAccount(privateKey).address;

//         mnemonic = null;
//         masterKey = null;

//         return { address, privateKey };
//     } catch (error) {
//         console.error('Error generating address:', error);
//         throw error;
//     }
// };

// const transferFunds = async (fromAddress, privateKey, toAddress, amount) => {
//     try {
//         const nonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
//         const gasPrice = await web3.eth.getGasPrice();
//         const gasLimit = 21000;
//         const value = web3.utils.toWei(amount.toString(), 'ether');

//         const transaction = {
//             nonce: nonce,
//             gasPrice: gasPrice,
//             gasLimit: gasLimit,
//             to: toAddress,
//             value: value,
//             chainId: 11155111 // Sepolia testnet chain ID
//         };

//         const signedTx = await web3.eth.accounts.signTransaction(transaction, privateKey);
//         const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

//         console.log('Transaction hash:', receipt.transactionHash);
//         console.log('Transaction receipt:', receipt);
//     } catch (error) {
//         console.error('Error transferring funds:', error);
//     }
// };

// const main = async () => {
//     const { address, privateKey } = generateAddress();
//     const merchantAddress = '0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b'; // Replace with actual merchant wallet address
//     const amount = '0.002'; // Amount in ether

//     console.log('Generated Address:', address);
//     console.log('Transferring funds to merchant address:', merchantAddress);

//     await transferFunds(address, privateKey, merchantAddress, amount);
// };

// main();



const Moralis = require('moralis').default;
const { EvmChain } = require("@moralisweb3/common-evm-utils");


async function monitorAddress() {

Moralis.start({
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjU3MzE4Njc0LWNiNGYtNGIxMi04YWE5LTc5ZTZkZDcwZmEwMSIsIm9yZ0lkIjoiNDA3OTg3IiwidXNlcklkIjoiNDE5MjI2IiwidHlwZUlkIjoiY2M1NjdmNDktMjA0Ny00ZTVjLTliOGMtYzU2OWQ3Yjk3YjliIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjYwMjg2MzYsImV4cCI6NDg4MTc4ODYzNn0.TMa0sAyzX-dB7xVJmaLr0Kpko3CNe8ehLkafEeSHjso',
});

const stream = {
  chains: [EvmChain.ETHEREUM, EvmChain.POLYGON], // List of blockchains to monitor
  description: "monitor HD wallet", // Your description
  tag: "Moralis", // Give it a tag
  includeNativeTxs: true, // select the events to monitor
  webhookUrl: "https://webhook.site/a5c5667c-fc2f-42e8-9a18-05a10343433a", // Webhook URL to receive events
}

const newStream = await Moralis.Streams.add(stream);
const { id } = newStream.toJSON(); // { id: 'YOUR_STREAM_ID', ...newStream }

// Now we attach HD wallet's address to the stream
const address = "0x0eB8b81487A2998f4B4D1C0C04BaA0FbF89039c3";

await Moralis.Streams.addAddress({ address, id });

console.log("Monitoring HD wallet on Ethereum and sepolia chains...");
}

// Call the function
monitorAddress().catch((error) => console.error("Error: ", error));