# HD Wallet Troubleshooting Guide

This document covers common issues and solutions for the HD Wallet payment gateway, focusing particularly on the fund release functionality.

## Fund Release Issues

### Problem: Funds Not Being Released

The main issue was that when merchants attempted to release funds from the HD wallet to their own addresses, the transactions would fail with errors like:

```
Error sending transaction: insufficient funds for gas * price + value: balance 0, tx cost 1025200000000000, overshot 1025200000000000
```

Despite the wallet showing a sufficient balance, the transaction would fail with "balance 0" errors.

### Root Cause Analysis

After thorough investigation, we identified multiple issues causing the fund release failures:

1. **HD Wallet Derivation Path Mismatch**: The system was trying to use index 0 (the root address) to access funds stored at index 8. This resulted in attempting to sign transactions with the wrong private key.

2. **Unreliable RPC Providers**: Connection timeouts to the Ethereum RPC nodes were causing transaction failures and inconsistent nonce calculations.

3. **Insufficient Gas Price**: The gas price used was too low for Sepolia testnet miners to pick up the transactions.

4. **Inadequate Transaction Retry Logic**: The system wasn't properly handling failed transactions or checking for pending transactions before sending new ones.

### Solutions Implemented

#### 1. HD Wallet Derivation Path Verification

We created a verification system that checks if the address being used matches the expected derived address for the given index. If a mismatch is detected, the system:

- Searches for the correct derivation index by checking indexes 0-20
- Updates the stored index in the keys.json file 
- Uses the correct private key for transaction signing

This was implemented in the `server.js` file around line 1800:

```javascript
// Verify the derived address matches the expected address
if (derivedAddress.toLowerCase() !== highestBalanceAddr.address.toLowerCase()) {
    console.error(`ERROR: Address mismatch!`);
    // Search for the correct derivation index...
}
```

Additionally, we created a standalone utility `fix-derivation-indexes.js` that can be run to check and fix all address indexes in the storage.

#### 2. Improved RPC Provider Management

We enhanced the `getFreshProvider()` function to use multiple RPC endpoints with fallbacks:

```javascript
async function getFreshProvider() {
    // Use multiple RPC endpoints with priority order
    const rpcEndpoints = [
        'https://ethereum-sepolia.publicnode.com',
        'https://sepolia.infura.io/v3/your-key',
        'https://eth-sepolia.g.alchemy.com/v2/demo',
        // Additional fallbacks...
    ];
    
    // Try each provider until one works...
}
```

This ensures that the system can always connect to an Ethereum node even if one provider is down.

#### 3. Reliable Gas Price Estimation

We implemented a `getReliableGasPrice()` function to:

- Set a minimum gas price of 1 gwei for Sepolia testnet
- Increase the gas price by 20% to prioritize transactions
- Provide fallback gas prices if the RPC call fails

```javascript
async function getReliableGasPrice(web3) {
    // Get the network gas price with minimum floor
    const minGasPrice = web3.utils.toWei('1', 'gwei');
    // Use the higher value and increase by 20%...
}
```

#### 4. Robust Transaction Sending

We improved the transaction sending logic with:

- Better error handling and detailed logging
- Multiple retry attempts with fresh providers
- Checking for transaction receipts between retries
- Exponential backoff between retry attempts

The `sendTransactionWithRetry()` function now properly handles various error conditions including:
- "Known transaction" errors when the transaction is already in the mempool
- Provider connection issues
- Nonce conflicts

#### 5. Pending Transaction Checks

Before sending new transactions, the system now checks for any existing pending transactions between the same addresses:

```javascript
const pendingTx = await checkPendingTransactions(fromAddress, toAddress);
if (pendingTx && pendingTx.txHash) {
    console.log(`Found existing pending transaction ${pendingTx.txHash}`);
    // Check receipt and handle appropriately...
}
```

This prevents duplicate transactions and provides better feedback to the user.

## Verification and Testing

We've implemented a test script `recover-and-release.js` that can be used to verify wallet recovery and test fund releases. This script:

1. Loads and decrypts the wallet from storage 
2. Checks all active addresses and their balances
3. Verifies the derivation paths match the expected addresses
4. Identifies the address with the highest balance
5. Can release funds with proper gas price calculation

After implementing these fixes, we successfully released funds from the HD wallet to the merchant address as demonstrated by the transaction hash: `0xff4749304baaee9ccc8a1b2149ad744ef05df9f792e85bafcc60bdccfa4b9d80`.

## Prevention of Future Issues

To prevent similar issues in the future:

1. **Periodic Address Verification**: Run `node fix-derivation-indexes.js` to verify all address derivation paths are correct.

2. **Use Reliable Gas Prices**: The system now ensures gas prices are appropriate for the network.

3. **Transaction Monitoring**: The merchant dashboard now actively polls for pending transaction status updates.

4. **Detailed Logging**: All blockchain operations are logged to `blockchain_tx.log` for troubleshooting.

## Quick Troubleshooting Steps

If fund releases fail:

1. Check that the address indexes in `Json/keys.json` are correct by running `node fix-derivation-indexes.js`
2. Verify the wallet has sufficient balance with `curl http://localhost:3000/api/wallet-balance`
3. Check the blockchain logs with `cat blockchain_tx.log | tail -n 50`
4. If a transaction is pending, check its status via the merchant dashboard
5. For persistent issues, try releasing all available funds using `node recover-and-release.js` 