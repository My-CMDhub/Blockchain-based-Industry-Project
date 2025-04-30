# HD Wallet Payment Gateway Project Brief

## Project Overview
This project is a secure and reliable payment gateway that allows merchants to accept cryptocurrency payments using Hierarchical Deterministic (HD) wallets. It provides a complete solution from onboarding to transaction management and fund release.

## Core Functionality
- Generate or use pre-made HD wallet keys for cryptocurrency transactions
- Accept and monitor testnet crypto payments
- Provide a merchant dashboard for transaction monitoring and fund management
- Support admin features for system maintenance and address management

## Technology Stack
- **Backend**: Node.js, Express
- **Frontend**: HTML/CSS/JavaScript
- **Blockchain**: Web3.js, Ethereum (Sepolia testnet)
- **External Services**: Infura, Moralis
- **Security**: Encryption utilities for sensitive key management

## Current State
The application has a functional core system for:
- HD wallet generation and management
- Payment acceptance and processing
- Merchant dashboard
- Admin tools for address management

## Improvement Areas (from DOCS/What_to_improve.md)
- Implement BSC network support for BNB cryptocurrency transactions
- Add Stripe integration for traditional payment methods
- Update pricing from USD to AUD
- Create sensitive keys recovery system for admin page
- Implement open-source smart contract for USDT transactions
- Set API endpoint limitations to prevent misuse and system crashes

## Development Priorities
1. BSC network integration
2. Stripe payment gateway integration
3. Currency conversion (USD to AUD)
4. Security enhancements
5. Performance optimizations

## Project Structure Overview
- **Public/**: Frontend assets and HTML pages
- **Json/**: Data storage for encrypted keys and transaction data
- **Keys/**: Sample keys for testing
- **Server.js**: Main application backend
- **Utility scripts**: For key generation, encryption, and recovery 