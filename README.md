# Ethereum Payment Gateway

A secure payment gateway implementation for processing Ethereum transactions using HD wallets.

## Features

- HD Wallet integration
- Payment simulation
- Funds release mechanism
- Web3 integration
- Secure key management

## Prerequisites

- Node.js (v16 or higher)
- npm
- Ethereum wallet (MetaMask)
- Infura account

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/payment-gateway.git
cd payment-gateway
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
INFURA_URL=your_infura_url
```

4. Start the server:
```bash
npm start
```

## Usage

Access the payment flow dashboard at `http://localhost:3000/flow`

## API Endpoints

- GET `/api/wallet-balance` - Get HD wallet balance
- POST `/api/simulate-payment` - Simulate payment to HD wallet
- POST `/api/release-funds` - Release funds to merchant

## Security

- Encrypted key storage
- Secure transaction signing
- Environment variable protection

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

