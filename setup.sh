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

# Prompt for or use default values for critical environment variables
read -p "Enter INFURA_URL (leave blank for default): " INFURA_URL
INFURA_URL=${INFURA_URL:-"https://sepolia.infura.io/v3/d9e866f4ac7a495f9534eb1e8fbffbb9"}

read -p "Enter MORALIS_API_KEY (leave blank for default): " MORALIS_API_KEY
MORALIS_API_KEY=${MORALIS_API_KEY:-"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjU3MzE4Njc0LWNiNGYtNGIxMi04YWE5LTc5ZTZkZDcwZmEwMSIsIm9yZ0lkIjoiNDA3OTg3IiwidXNlcklkIjoiNDE5MjI2IiwidHlwZUlkIjoiY2M1NjdmNDktMjA0Ny00ZTVjLTliOGMtYzU2OWQ3Yjk3YjliIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3MjYwMjg2MzYsImV4cCI6NDg4MTc4ODYzNn0.TMa0sAyzX-dB7xVJmaLr0Kpko3CNe8ehLkafEeSHjso"}

echo -e "${YELLOW}For the MERCHANT_ADDRESS, please enter your personal MetaMask wallet address.${NC}"
read -p "Enter MERCHANT_ADDRESS: " MERCHANT_ADDRESS
MERCHANT_ADDRESS=${MERCHANT_ADDRESS:-"0xE94401C68F1652cBF8dA2D275a18a1CdF74b9C5b"}

read -p "Enter HD_WALLET_ADDRESS (leave blank for default): " HD_WALLET_ADDRESS
HD_WALLET_ADDRESS=${HD_WALLET_ADDRESS:-"0x0eB8b81487A2998f4B4D1C0C04BaA0FbF89039c3"}

read -p "Enter WEBHOOK_URL (leave blank for default): " WEBHOOK_URL
WEBHOOK_URL=${WEBHOOK_URL:-"https://webhook.site/a5c5667c-fc2f-42e8-9a18-05a10343433a"}

read -p "Enter PORT (leave blank for default 3000): " PORT
PORT=${PORT:-"3000"}

# Generate encryption key if not provided
read -p "Enter ENCRYPTION_KEY (leave blank to generate new): " ENCRYPTION_KEY
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo -e "${YELLOW}Generated new encryption key.${NC}"
fi

echo -e "${YELLOW}For the MERCHANT_PRIVATE_KEY, please enter your personal MetaMask wallet private key.${NC}"
echo -e "${RED}WARNING: Keep your private key secure and never share it with anyone!${NC}"
read -p "Enter MERCHANT_PRIVATE_KEY: " MERCHANT_PRIVATE_KEY
MERCHANT_PRIVATE_KEY=${MERCHANT_PRIVATE_KEY:-"617a90a6821209ae00edee11ed0d025d32d0cf07f1a9c5accda31bc775a1aa58"}

read -p "Enter CHAIN_ID (leave blank for default Sepolia 11155111): " CHAIN_ID
CHAIN_ID=${CHAIN_ID:-"11155111"}

read -p "Enter ETHERSCAN_API_KEY (leave blank for default): " ETHERSCAN_API_KEY
ETHERSCAN_API_KEY=${ETHERSCAN_API_KEY:-"29f19992ba7f4f08b1c391ae0bab9b44"}

# Create .env file with required keys
cat > .env << EOF
# Blockchain Network Configuration
INFURA_URL=$INFURA_URL

# Moralis Configuration
MORALIS_API_KEY=$MORALIS_API_KEY

# Merchant Configuration
MERCHANT_ADDRESS=$MERCHANT_ADDRESS
HD_WALLET_ADDRESS=$HD_WALLET_ADDRESS

# Webhook Configuration
WEBHOOK_URL=$WEBHOOK_URL

# Server Configuration
PORT=$PORT

# Security
ENCRYPTION_KEY=$ENCRYPTION_KEY
MERCHANT_PRIVATE_KEY=$MERCHANT_PRIVATE_KEY

# Network
CHAIN_ID=$CHAIN_ID  # Sepolia testnet

# Etherscan
ETHERSCAN_API_KEY=$ETHERSCAN_API_KEY
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
echo -e "${BLUE}=================================================${NC}"

# Make the script executable
chmod +x ./setup.sh

echo -e "\n${YELLOW}Setup script is now executable. You can run it again anytime with ./setup.sh${NC}"
