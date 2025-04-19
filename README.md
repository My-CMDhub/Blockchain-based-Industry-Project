# HD Wallet Payment Gateway

A secure and reliable HD wallet-based payment gateway that allows merchants to accept cryptocurrency payments with automated transaction monitoring and fund management.

## 📋 Features

- **Hierarchical Deterministic Wallet**: Generates unique payment addresses for each transaction
- **Secure Key Management**: All keys are stored encrypted
- **Real-time Transaction Monitoring**: Track payment status in real-time
- **Merchant Dashboard**: View and manage transactions
- **One-click Fund Release**: Transfer received funds to merchant wallet
- **Multiple RPC Providers**: Fault-tolerant connections to Ethereum network

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- An Ethereum RPC provider (Infura, Alchemy, etc.)
- Sepolia testnet ETH for testing (get from a faucet)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://....... (Opened github's project link from web browser)
 
   ```

2. **Run the setup script**

   This will install dependencies, create necessary files, and generate the HD wallet keys.

   **Note - :** For windows users , open bash terminal in your IDE (VS code, Pycharm, etc..) then run the script.
   
   ```bash
   bash setup.sh
   ```
   
   - Skip all keys just by pressing enter or enter the keys if you got any.
     
   or copy and paste the keys from Keys folder into your .env file and then replace the keys with your keys or use same keys.

   **Keys 🔑**:
   - To get your own **ENCRYPTION_KEY** then run this command in terminal : ``` openssl rand -hex 32 ```
   - To get your own **MERCHANT_ADDRESS** and **MERCHANT_PRIVATE_KEY** , you require to set up metamask wallet by downloading the metamask app.
   - Keep **HD_WALLET_ADDRESS** same.
   - To get your own **INFURA_URL** and **MORALIS_API_KEY** , you require to sign up to this providers **'Infura'** and **'Moralis'**. 
   - Webhook will be provided by Infura once the account is set up.
   - Keep same rest of all.

4. **Start the server**

   ```bash
   node server.js or npm start
   ```

5. **Access the application**

   - E-commerce store: http://localhost:3000
   - Merchant dashboard: http://localhost:3000/merchant

## 🔍 Project Structure

```
├── Public/                  # Frontend assets
│   ├── merchant-dashboard.html  # Merchant interface
│   ├── Product.html         # Sample e-commerce store
│   └── Cart.html            # Shopping cart with payment
├── Json/                    # Stored data
│   └── keys.json            # Encrypted wallet keys
├── server.js                # Main server code
├── encryptionUtils.js       # Encryption/decryption utilities
├── recover.js               # Wallet recovery tools
├── generateKeys.js          # HD wallet generation
├── fix-derivation-indexes.js  # Utility to fix wallet derivation paths
├── recover-and-release.js   # Fund release testing tool
├── TROUBLESHOOTING.md       # Detailed troubleshooting guide
└── .env                     # Environment configuration
```

## 💼 Usage

### Setting Up a Merchant Account

1. Run the setup script to generate your HD wallet
2. Configure your merchant address in the `.env` file
3. Start the server and access the merchant dashboard

### Managing Payments

1. **Viewing Transactions**: All transactions can be viewed on the merchant dashboard
2. **Checking Balances**: View your HD wallet balance from the dashboard
3. **Releasing Funds**: Click the "Release Funds" button on the dashboard to transfer funds to your merchant wallet

### Testing the Payment Flow

1. Browse to http://localhost:3000 to access the demo store
2. Add products to your cart and proceed to checkout
3. Choose a cryptocurrency and complete the payment
4. Monitor the transaction in real-time on the dashboard
5. Release funds when ready

## 🛠 Maintenance and Troubleshooting

### Common Issues

If you encounter issues, please check the `TROUBLESHOOTING.md` file for detailed guidance.

**Quick Fixes:**

- **Fund Release Issues**: Run `node fix-derivation-indexes.js` to correct address derivation paths
- **Transaction Monitoring Problems**: Check the blockchain_tx.log for details
- **Server Crashes**: Ensure your environment variables are correctly set in .env

## 🧪 Testing

### Testing Fund Release

The `recover-and-release.js` script provides a direct way to test fund releases:

```bash
node recover-and-release.js
```

This will check all addresses, verify derivation paths, and attempt to release all available funds.

## 🔒 Security Considerations

- Store your `.env` file securely and never commit it to version control
- Use a strong ENCRYPTION_KEY (generated automatically by setup.sh)
- For production, use dedicated and secure RPC providers
- Regularly back up your keys.json file

## 📝 Development and Extension

### Adding New Features

1. **Custom Notification System**: Edit webhook.js to integrate with your notification service
2. **New Cryptocurrencies**: Extend the server.js payment processing logic
3. **User Authentication**: Add authentication middleware to secure the merchant dashboard

## 📚 API Documentation

The payment gateway provides several API endpoints:

- `GET /api/wallet-balance` - Get current wallet balance
- `GET /api/merchant-transactions` - List all transactions
- `POST /api/release-funds` - Release funds to merchant address
- `POST /api/generate-payment-address` - Create new payment address

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ❓ Support

For additional help or questions, please refer to the TROUBLESHOOTING.md file or open an issue.
