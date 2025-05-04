#!/bin/bash

# Set ports
NODE_PORT=3000
REACT_PORT=5001

# Start Node.js backend on port 3001
cd "$(dirname "$0")"
echo "Starting Node.js backend (http://localhost:$NODE_PORT) ..."
PORT=$NODE_PORT npm start &
NODE_PID=$!

# Start React landing page on port 5001
cd Landing_page/crypto-payment-gateway

echo "Starting React landing page (http://localhost:$REACT_PORT) ..."
PORT=$REACT_PORT npm run dev &
REACT_PID=$!

cd ../../

# Print clear instructions
cat <<EOM

============================================
HD Wallet Payment Gateway - Local Test Setup
============================================

1. Visit the React Landing Page first:
   👉 http://localhost:$REACT_PORT
   (This is the main entry point for new users and clients)

2. From there, use the "View Demo" or "Get Started" button to access the Node.js onboarding page:
   👉 http://localhost:$NODE_PORT/onboarding.html

3. You can also directly access:
   - E-commerce Store:        http://localhost:$NODE_PORT/Product.html
   - Merchant Dashboard:      http://localhost:$NODE_PORT/merchant-dashboard.html

Press Ctrl+C in this terminal to stop both servers.

EOM

# Wait for React server to be ready before opening the browser
URL="http://localhost:$REACT_PORT"
echo "Waiting for React landing page to be available on port $REACT_PORT ..."
until curl -s "$URL" > /dev/null; do
  sleep 1
done
echo "React landing page is up!"

# Open the React landing page in the default browser
if which xdg-open > /dev/null; then
  xdg-open "$URL"
elif which open > /dev/null; then
  open "$URL"
elif which start > /dev/null; then
  start "$URL"
else
  echo "Please open $URL in your browser."
fi

# Wait for both processes
wait $NODE_PID $REACT_PID 