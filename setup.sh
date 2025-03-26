#!/bin/bash

# HD Wallet Payment Gateway Setup Script
# This script sets up the entire HD wallet payment gateway project

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}=================================================${NC}"
echo -e "${GREEN}   HD Wallet Payment Gateway Setup Script${NC}"
echo -e "${BLUE}=================================================${NC}"

# Check if Node.js is installed
echo -e "\n${YELLOW}Checking for Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Please install Node.js (v14 or later).${NC}"
    echo -e "Visit: https://nodejs.org/en/download/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)
if [ "$NODE_MAJOR" -lt 14 ]; then
    echo -e "${RED}Node.js version v$NODE_VERSION detected. This project requires v14 or later.${NC}"
    echo -e "Please upgrade your Node.js installation."
    exit 1
fi
echo -e "${GREEN}Node.js v$NODE_VERSION detected ✅${NC}"

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install dependencies. Please check the error messages above.${NC}"
    exit 1
fi
echo -e "${GREEN}Dependencies installed successfully ✅${NC}"

# Create project directories if they don't exist
echo -e "\n${YELLOW}Creating project directories...${NC}"
mkdir -p Public Json secure
echo -e "${GREEN}Project directories created ✅${NC}"

# Setup .env file
echo -e "\n${YELLOW}Setting up environment variables...${NC}"
if [ -f .env ]; then
    echo -e "${YELLOW}Existing .env file found. Creating backup...${NC}"
    cp .env .env.backup.$(date +%Y%m%d%H%M%S)
    echo -e "${GREEN}Backup created ✅${NC}"
fi

# Generate encryption key if not provided
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated new encryption key.${NC}"
fi

# Prompt for or use default values for critical environment variables
read -p "Enter RPC URL for Sepolia (leave blank for default Infura URL): " INFURA_URL
INFURA_URL=${INFURA_URL:-"https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9"}

read -p "Enter Alchemy API URL (leave blank for default): " ALCHEMY_URL
ALCHEMY_URL=${ALCHEMY_URL:-"https://eth-sepolia.g.alchemy.com/v2/demo"}

read -p "Enter Merchant Address (leave blank for default test address): " MERCHANT_ADDRESS
MERCHANT_ADDRESS=${MERCHANT_ADDRESS:-"0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b"}

read -p "Enter Port Number (leave blank for default 3000): " PORT
PORT=${PORT:-"3000"}

# Generate a unique salt value
ENCRYPTION_SALT="hd_wallet_salt_$(openssl rand -hex 8)"

# Set up .env file with comprehensive configuration
cat > .env << EOF
# ===============================================================
# HD Wallet Payment Gateway Environment Configuration
# ===============================================================
# This file contains all environment variables for the application
# Generated on: $(date)
# ===============================================================

# ------------------- Server Configuration ----------------------
# Port for the Express server to listen on
PORT=$PORT

# Development/Production mode
NODE_ENV=development

# CORS configuration (for production deployments)
ALLOW_ORIGINS=http://localhost:$PORT,http://127.0.0.1:$PORT

# ------------------- Blockchain Configuration ------------------
# Primary RPC endpoint (Infura)
INFURA_URL=$INFURA_URL

# Secondary RPC endpoint (Alchemy)
ALCHEMY_URL=$ALCHEMY_URL

# Fallback RPC endpoints
BACKUP_RPC=https://rpc.sepolia.org
SECONDARY_BACKUP_RPC=https://ethereum-sepolia.publicnode.com

# Target blockchain network
BLOCKCHAIN_NETWORK=sepolia

# Merchant wallet address to receive funds
MERCHANT_ADDRESS=$MERCHANT_ADDRESS

# Gas price configuration (values in gwei)
MIN_GAS_PRICE=1.0
GAS_PRICE_BUFFER=20

# Transaction confirmation settings
MIN_CONFIRMATIONS=1
CONFIRMATION_TIMEOUT=120000

# ------------------- Security Configuration --------------------
# Encryption key for sensitive data
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Salt for encryption
ENCRYPTION_SALT=$ENCRYPTION_SALT

# API rate limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# ------------------- Webhook Configuration (optional) ----------
# Webhook URL for transaction notifications
WEBHOOK_URL=

# Webhook authentication secret
WEBHOOK_SECRET=

# ------------------- Logging Configuration ---------------------
# Log level (debug, info, warn, error)
LOG_LEVEL=info

# Enable file logging (true/false)
ENABLE_FILE_LOGGING=true

# ===============================================================
# For a production environment, replace the above values with your 
# own API keys and addresses. Ensure you're using secure and 
# private RPC endpoints with your own API keys.
# ===============================================================
EOF

echo -e "${GREEN}.env file created successfully ✅${NC}"

# Check if wallet keys already exist
echo -e "\n${YELLOW}Checking for wallet keys...${NC}"
if [ -f "./Json/keys.json" ]; then
    echo -e "${YELLOW}Wallet keys already exist. Skipping wallet generation.${NC}"
    echo -e "${YELLOW}If you want to regenerate the wallet, delete ./Json/keys.json first.${NC}"
else
    # Generate HD wallet
    echo -e "\n${YELLOW}Generating HD wallet...${NC}"
    node generateKeys.js
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate wallet keys. Please check the error messages above.${NC}"
        exit 1
    fi
    echo -e "${GREEN}HD wallet generated successfully ✅${NC}"
    
    # Verify wallet keys
    if [ -f "./Json/keys.json" ]; then
        echo -e "${GREEN}Wallet keys verified ✅${NC}"
    else
        echo -e "${RED}Wallet keys file not found. Generation may have failed.${NC}"
        exit 1
    fi
fi

# Create a default configuration file if it doesn't exist
if [ ! -f "./Json/config.json" ]; then
    echo -e "\n${YELLOW}Creating default configuration file...${NC}"
    cat > ./Json/config.json << EOF
{
    "merchantName": "Test Merchant",
    "merchantAddress": "$MERCHANT_ADDRESS",
    "paymentTimeoutMinutes": 60,
    "minConfirmations": 1,
    "networkName": "Sepolia Testnet",
    "autoRelease": false,
    "notifyEmail": "",
    "notifyWebhook": "",
    "lastBackup": null
}
EOF
    echo -e "${GREEN}Default configuration created ✅${NC}"
fi

# Final setup steps
echo -e "\n${YELLOW}Performing final setup steps...${NC}"

# Create a simple README if it doesn't exist
if [ ! -f "README.md" ]; then
    echo -e "${YELLOW}Creating README file...${NC}"
    cat > README.md << EOF
# HD Wallet Payment Gateway

A complete payment gateway system using hierarchical deterministic (HD) wallets on Ethereum.

## Quick Start

1. Run \`npm install\` to install dependencies
2. Run \`node server.js\` to start the server
3. Access the merchant dashboard at http://localhost:$PORT/merchant
4. Access the e-commerce store at http://localhost:$PORT

## Features

- HD wallet generation and management
- Payment address generation for each customer
- Real-time transaction monitoring
- Merchant dashboard with fund management
- Testnet (Sepolia) support

## Configuration

Edit the \`.env\` file to customize your configuration.

## License

MIT
EOF
    echo -e "${GREEN}README created ✅${NC}"
fi

echo -e "${GREEN}HD Wallet Payment Gateway is now set up! ✅${NC}"
echo -e "\n${BLUE}=================================================${NC}"
echo -e "${GREEN}   Setup Complete${NC}"
echo -e "${BLUE}=================================================${NC}"
echo -e "\n${YELLOW}To start the server, run:${NC}"
echo -e "  ${GREEN}node server.js${NC}"
echo -e "\n${YELLOW}Access the merchant dashboard at:${NC}"
echo -e "  ${GREEN}http://localhost:$PORT/merchant${NC}"
echo -e "\n${YELLOW}Access the e-commerce store at:${NC}"
echo -e "  ${GREEN}http://localhost:$PORT${NC}"
echo -e "\n${YELLOW}For troubleshooting:${NC}"
echo -e "  ${GREEN}1. Check logs in ./payment_gateway.log and ./blockchain_tx.log${NC}"
echo -e "  ${GREEN}2. Verify your RPC endpoints are working${NC}"
echo -e "  ${GREEN}3. Ensure you have funds in your Sepolia testnet wallet${NC}"
echo -e "${BLUE}=================================================${NC}"

# Make the script executable
chmod +x ./setup.sh

echo -e "\n${YELLOW}Setup script is now executable. You can run it again anytime with ./setup.sh${NC}"
