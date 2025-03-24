#!/bin/bash

# Check if Node.js and npm are installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js (v16 or higher) and npm."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
if (( ${NODE_VERSION%%.*} < 16 )); then
    echo "Node.js version 16 or higher is required. Current version: $NODE_VERSION"
    exit 1
fi

echo "Node.js version $NODE_VERSION detected."

# Create necessary directories
echo "Creating project directories..."
mkdir -p Json secure Public

# Install core dependencies
echo "Installing core dependencies..."
npm install \
    express@4.21.2 \
    cors@2.8.5 \
    web3@1.10.4 \
    bip32@4.0.0 \
    bip39@3.1.0 \
    moralis@2.27.2 \
    dotenv@16.0.0 \
    tiny-secp256k1@2.2.0

# Install security and encryption related dependencies
echo "Installing security dependencies..."
npm install \
    crypto@1.0.1 \
    @moralisweb3/common-evm-utils@2.27.2

# Install development dependencies
echo "Installing development dependencies..."
npm install --save-dev \
    nodemon@2.0.22

# Create .env template if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env template..."
    cat > .env << EOL
# Required Environment Variables
INFURA_URL=your_infura_url
ENCRYPTION_KEY=your_encryption_key  # 64 character hex key
MERCHANT_ADDRESS=your_merchant_address
PORT=3000
EOL
    echo ".env template created. Please update it with your actual values."
fi

# Add start script to package.json if it doesn't exist
if ! grep -q '"start"' package.json; then
    echo "Adding start script to package.json..."
    node -e "
        const fs = require('fs');
        const package = JSON.parse(fs.readFileSync('package.json'));
        if (!package.scripts) package.scripts = {};
        package.scripts.start = 'node server.js';
        package.scripts.dev = 'nodemon server.js';
        fs.writeFileSync('package.json', JSON.stringify(package, null, 2));
    "
fi

# Check if all required files exist
echo "Checking required files..."
REQUIRED_FILES=("server.js" "generateKeys.js" "encryptionUtils.js" "recover.js")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Warning: $file not found. Make sure to create it."
    fi
done

echo "Setup complete. Next steps:"
echo "1. Update the .env file with your credentials"
echo "2. Run 'node generateKeys.js' to generate your wallet keys"
echo "3. Start the server using 'npm start' or 'npm run dev' for development"
