#!/bin/bash

# Script to start the server with local file-based secrets

# Set environment variables
export SECRETS_BACKEND=local

# Show configuration
echo "Starting server with SECRETS_BACKEND=$SECRETS_BACKEND"
echo "Local file-based storage will be used for secrets"

# Start the server
node server.js 