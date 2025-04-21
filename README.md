# HD Wallet Payment Gateway

A secure and reliable payment gateway that allows merchants to accept cryptocurrency payments using Hierarchical Deterministic (HD) wallets. This guide will help anyone—from non-technical users to developers—set up, run, and test the application from scratch.

---

## 🏁 What You'll Achieve
- Set up your own crypto payment gateway on your computer
- Generate or use pre-made wallet keys
- Accept and monitor testnet crypto payments
- Use a simple web UI to guide you through onboarding

---

## 1. Prerequisites

**You'll need:**
- **Node.js (v14 or higher):** [Download & Install](https://nodejs.org/)
- **npm** (comes with Node.js)
- **MetaMask browser extension:** [Install MetaMask](https://metamask.io/)
- **A modern web browser**
- **Internet connection**

**Third-party services:**
- **Infura:** For Ethereum blockchain access ([Sign up here](https://infura.io/))
- **Moralis:** For blockchain data ([Sign up here](https://moralis.io/))
- **Sepolia testnet ETH:** For testing ([Get free ETH here](https://cloud.google.com/application/web3/faucet))

---

## 2. Cloning the Repository

Open your terminal and run:
```bash
git clone <your-repo-url>
cd Blockchain-PG
```

---

## 3. Make Bash Scripts Executable (Mac/Linux)

Before running any setup or start scripts, make sure they are executable:
```bash
chmod +x setup.sh start-all.sh
```
- **Windows users:** You can run these scripts in Git Bash, WSL, or use the commands manually in your terminal. If you have issues, right-click and open with your terminal or use `bash setup.sh` and `bash start-all.sh`.

---

## 4. Installing Dependencies & Initial Setup

Run the setup script to install all dependencies and prepare your environment:
```bash
bash setup.sh
```
- This will:
  - Install all Node.js packages (npm install)
  - Create necessary directories (Public, Json, secure)
  - Guide you through .env setup (with prompts for all required keys)
  - Generate your HD wallet and store encrypted keys in `Json/keys.json`
  - **If you want to use pre-generated keys, see the next section.**
- **Windows users:** Use a Bash terminal (e.g., Git Bash, VS Code terminal).

---

## 5. Setting Up Keys & Environment

### Option 1: Generate Your Own Keys (Recommended)
1. **MetaMask Setup:**
   - Install MetaMask and create a new wallet.
   - Create one more account as a Merchant to receive the payment from your one default account as a user to another created account as a Merchant.
   - Save your **mnemonic phrase** (12/24 words) and **private key** (This will be your new created Merchant's account key) securely.
   - Copy your **wallet address** (this will be your MERCHANT_ADDRESS).
2. **Get Sepolia Testnet ETH:**
   - Go to [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet).
   - Paste your MetaMask address and select Sepolia to receive test ETH.
3. **Sign Up for Infura & Moralis:**
   - **Infura:** Create a new Ethereum project and copy the HTTPS endpoint (your INFURA_URL).
   - **Moralis:** Get your API key from the dashboard.
4. **Generate an ENCRYPTION_KEY:**
   - In your terminal, run:
     ```bash
     openssl rand -hex 32
     ```
   - Copy the output for your .env file.
5. **Run the setup script:**
   - The script will prompt you to enter your keys and configuration values.
   - Enter the values you collected above.
   - The script will generate your HD wallet and store encrypted keys in `Json/keys.json`.
   - **Backup your mnemonic phrase and encrypted keys!**

### Option 2: Use Pre-Generated Keys (Quick Start)
- If you have trouble generating your own keys, you can use the sample keys in `Keys/Keys.txt`.
- **Copy the contents of `Keys/Keys.txt` into your `.env` file** when prompted by the setup script.
- **You must still set up your own MetaMask wallet** and provide your own MERCHANT_ADDRESS and MERCHANT_PRIVATE_KEY for transactions.
- **Warning:** Never use these sample keys for real funds—test only!

---

## 6. Environment Variables (.env)

Your `.env` file should look like this (example):
```
ENCRYPTION_KEY=your_generated_encryption_key
MERCHANT_ADDRESS=your_metamask_wallet_address
MERCHANT_PRIVATE_KEY=your_metamask_private_key
HD_WALLET_ADDRESS=auto_generated_or_from_keys
INFURA_URL=your_infura_project_url
MORALIS_API_KEY=your_moralis_api_key
... (other keys as needed)
```
- The setup script will help you create this file.
- **Never share your private key or mnemonic phrase!**

---

## 7. Starting the Application (Order Matters!)

**Step 1: Run the setup script (if you haven't already):**
```bash
bash setup.sh
```
- This installs dependencies, sets up your .env, and generates wallet keys.

**Step 2: Start both servers (Node.js backend and React landing page):**
```bash
bash start-all.sh
```
- This will:
  - Start the Node.js backend on **http://localhost:3001**
  - Start the React landing page on **http://localhost:5001**
  - Print clear instructions in your terminal

**If you get a permission error, make sure you ran:**
```bash
chmod +x setup.sh start-all.sh
```

---

## 8. Accessing the Application

- **Start at the React Landing Page:** [http://localhost:5001](http://localhost:5001)
  - This is the main entry point for new users and clients.
  - Use the "View Demo" or "Get Started" button to access the Node.js onboarding page.
- **Onboarding/Demo Page:** [http://localhost:3001/onboarding.html](http://localhost:3001/onboarding.html)
  - This page checks your setup, provides quick links, and helps you test the app.
- **E-commerce Store:** [http://localhost:3001/Product.html](http://localhost:3001/Product.html)
- **Merchant Dashboard:** [http://localhost:3001/merchant-dashboard.html](http://localhost:3001/merchant-dashboard.html)

---

## 9. How the System Works

- **HD Wallet Keys:**
  - Generated during setup and stored encrypted in `Json/keys.json`.
  - Backup your mnemonic phrase and encrypted keys for recovery.
- **Transaction History:**
  - Stored in files such as `merchant_transactions.json` and logs in the project root.
- **Configuration:**
  - All sensitive settings are in `.env` (never commit this file!).

---

## 10. Using the Application

### As a Customer
- Visit the e-commerce store, add products to your cart, and proceed to checkout.
- Choose a cryptocurrency (**Ethereum is only supporting at the moment**) and complete the payment using the generated address.
- Submit the payment with exact displayed amount via your Metamask wallet.

### As a Merchant
- Go to the merchant dashboard [http://localhost:3001/merchant-dashboard.html](http://localhost:3001/merchant-dashboard.html) to view transactions and balances.
- Release funds to your MetaMask wallet with one click.
- Monitor all payment activity in real time.

---

## 11. Troubleshooting & Support

- If you encounter issues, check `TROUBLESHOOTING.md` for solutions.
- Common issues:
  - **Fund Release Issues:** Run `node fix-derivation-indexes.js`.
  - **Transaction Monitoring:** Check `blockchain_tx.log`.
  - **Server Crashes:** Double-check your `.env` file.
- **Windows users:** If you have trouble running bash scripts, use Git Bash or WSL, or run the commands manually in your terminal.

---

## 12. Security & Best Practices

- **Never share your private key or mnemonic phrase.**
- **Backup your keys and mnemonic in a safe place.**
- **Do not use test keys for real funds.**
- **Store your `.env` file securely and never commit it to version control.**

---

## 13. FAQ

**Q: I'm not a developer. Can I still use this?**
A: Yes! Just follow the step-by-step guide above and use the Getting Started web UI for help.

**Q: What if I lose my keys or mnemonic?**
A: You will lose access to your funds. Always back up your keys and mnemonic phrase.

**Q: Where can I get help?**
A: See `TROUBLESHOOTING.md` or open an issue on the project repository.

---

## 14. About the Getting Started Web UI

A new landing page (`/getting-started.html` or default route) will:
- Guide you through the setup process
- Check for missing keys or configuration
- Provide links to setup scripts and documentation
- Help you get started even if you're not technical

---

## 15. Project Structure (Reference)

```
├── Public/                  # Frontend assets
│   ├── merchant-dashboard.html  # Merchant interface
│   ├── Product.html         # Sample e-commerce store
│   └── Cart.html            # Shopping cart with payment
├── Json/                    # Stored data
│   └── keys.json            # Encrypted wallet keys
├── Keys/                    # Pre-generated sample keys
│   └── Keys.txt             # Use for quick start
├── server.js                # Main server code
├── encryptionUtils.js       # Encryption/decryption utilities
├── recover.js               # Wallet recovery tools
├── generateKeys.js          # HD wallet generation
├── fix-derivation-indexes.js  # Utility to fix wallet derivation paths
├── recover-and-release.js   # Fund release testing tool
├── TROUBLESHOOTING.md       # Detailed troubleshooting guide
├── setup.sh                 # Setup script (run first)
├── start-all.sh             # Start both servers (run after setup)
└── .env                     # Environment configuration
```

---


## 16. Support

For additional support or questions contact to group members.
