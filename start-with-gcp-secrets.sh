#!/bin/bash

# Script to start the server with Google Secret Manager enabled

# Set environment variables
export SECRETS_BACKEND=gcp

# Show configuration
echo "Starting server with SECRETS_BACKEND=$SECRETS_BACKEND"
echo "Google Secret Manager will be used for secrets storage"

# Start the server
node server.js 