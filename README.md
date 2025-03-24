# Ethereum Payment Gateway

A secure payment gateway implementation for processing Ethereum transactions using HD wallets.

## Features

- HD Wallet integration for secure key management
- Real-time payment simulation and verification
- Automated funds release mechanism
- Web3 integration with Ethereum network
- AES-256-CBC encryption for sensitive data
- Interactive merchant dashboard
- Real-time balance tracking
- Transaction history with Etherscan integration

## Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- Ethereum wallet (MetaMask recommended)
- Infura account (for Ethereum network access)
- Git

## Installation

1. **Clone the repository:**

    ```bash
    git clone [repository URL]
    cd payment-gateway
    ```

2. **Install dependencies:**

    Make the setup script executable and run it:
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```

    The setup script will:
    - Check Node.js version
    - Create necessary directories
    - Install all required dependencies
    - Create configuration templates
    - Set up npm scripts

3. **Configure environment variables:**

    Create a `.env` file in the root directory with the following variables:

    ```env
    INFURA_URL=your_infura_url
    ENCRYPTION_KEY=your_encryption_key  # Must be a 64-character hex string
    MERCHANT_ADDRESS=your_merchant_address
    PORT=3000
    ```

    Important notes:
    - Get your Infura URL by creating a project at [infura.io](https://infura.io)
    - Generate ENCRYPTION_KEY using: `openssl rand -hex 32`
    - MERCHANT_ADDRESS should be your Ethereum address (from MetaMask)

4. **Generate wallet keys:**

    ```bash
    node generateKeys.js
    ```

    This will:
    - Generate a new HD wallet mnemonic
    - Derive the private key
    - Encrypt sensitive data
    - Save to `Json/keys.json` and `secure/privateKey.json`

5. **Start the server:**

    Development mode (with auto-reload):
    ```bash
    npm run dev
    ```

    Production mode:
    ```bash
    npm start
    ```

## Directory Structure

```
payment-gateway/
├── Json/                 # Encrypted wallet data
├── secure/              # Private key storage
├── Public/              # Frontend files
│   ├── Product.html
│   ├── Cart.html
│   └── payment-flow.html
├── server.js            # Main server file
├── generateKeys.js      # Key generation utility
├── encryptionUtils.js   # Encryption functions
├── recover.js           # Wallet recovery functions
└── setup.sh            # Setup script
```

## Usage

1.  Access the e-commerce store at `http://localhost:3000/`.
2.  Add items to the cart and select the cryptocurrency payment option.
3.  Follow the on-screen instructions to generate a payment address and initiate the payment.
4.  The merchant dashboard can be accessed at `http://localhost:3000/merchant`.

## API Endpoints

### Wallet Operations
- `GET /api/wallet-balance`
  - Returns current HD wallet balance and address
  - Response: `{ success: true, balance: "0.1", address: "0x..." }`

- `POST /api/generate-payment-address`
  - Generates new payment address
  - Response: `{ success: true, address: "0x...", expiresAt: "ISO-date" }`

### Payment Operations
- `POST /api/process-payment`
  - Processes incoming payment
  - Body: `{ amount: "0.1", cryptoType: "ETH" }`
  - Response: `{ success: true, txHash: "0x..." }`

- `POST /api/release-funds`
  - Releases funds to merchant address
  - Body: `{ amount: "0.1" }`
  - Response: `{ success: true, txHash: "0x..." }`

## Security Best Practices

1. **Environment Variables:**
   - Never commit `.env` file
   - Use strong ENCRYPTION_KEY
   - Rotate keys periodically

2. **Wallet Security:**
   - Backup mnemonic phrase securely
   - Use hardware wallet for production
   - Regular security audits

3. **Server Security:**
   - Use HTTPS in production
   - Implement rate limiting
   - Regular dependency updates

## Troubleshooting

### Common Issues

1. **"Unable to generate crypto address"**
   - Check INFURA_URL in `.env`
   - Verify `Json/keys.json` exists
   - Ensure ENCRYPTION_KEY is correct

2. **Transaction Verification Failed**
   - Check Sepolia network status
   - Verify sufficient gas funds
   - Check transaction on Etherscan

3. **Server Won't Start**
   - Verify Node.js version (v16+)
   - Check port availability
   - Confirm all dependencies installed

### Debug Commands

```bash
# Check Node.js version
node -v

# Verify environment
node -e "console.log(require('dotenv').config())"

# Test wallet recovery
node -e "require('./recover.js').testRecovery()"
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## License

MIT License - See LICENSE file for details

## Support

For support, email [support@example.com](mailto:support@example.com) or open an issue.
