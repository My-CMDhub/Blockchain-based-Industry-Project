# Blockchain Payment Gateway - Administrator Guide

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Installation & Setup](#installation--setup)
4. [Admin Dashboard](#admin-dashboard)
5. [Database Management](#database-management)
6. [Secret Manager Integration](#secret-manager-integration)
7. [Wallet Management](#wallet-management)
8. [Security Best Practices](#security-best-practices)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

## Introduction

This guide is intended for system administrators responsible for installing, configuring, and maintaining the Blockchain Payment Gateway system. The guide covers everything from initial setup to ongoing maintenance and troubleshooting.

### System Overview

The Blockchain Payment Gateway is a comprehensive solution for accepting cryptocurrency payments, with the following components:

- **Express.js Backend**: Core server handling API requests and blockchain interactions
- **Web Frontend**: User interfaces for customers, merchants, and administrators
- **SQLite Database**: Primary data storage with JSON file fallback
- **Google Cloud Secret Manager**: Secure storage for sensitive keys and credentials

## System Architecture

### Component Diagram

```
+------------------+      +--------------------+      +-------------------+
| Customer Browser |----->| Payment Processing |----->| Blockchain Network|
+------------------+      +--------------------+      +-------------------+
                               |          ^
                               v          |
+-----------------+      +---------------+      +-------------------+
| Merchant Portal |----->| Express.js    |----->| SQLite Database   |
+-----------------+      | Backend       |      +-------------------+
                         +---------------+
                               |          ^
                               v          |
+----------------+      +------------------+      +-------------------+
| Admin Dashboard|----->| Security Layer   |----->| GCP Secret Manager|
+----------------+      +------------------+      +-------------------+
```

### Directory Structure

```
Blockchain-PG/
├── server.js            # Main server entry point
├── package.json         # Node.js dependencies
├── .env                 # Environment variables
├── server/              # Server-side code
│   ├── controllers/     # API controllers
│   ├── routes/          # API routes
│   └── utils/           # Utility functions
├── db/                  # Database-related code
├── Public/              # Frontend assets
├── Json/                # JSON data storage (fallback)
├── secure/              # Secure storage (local fallback)
└── DOCS/               # Documentation
```

## Installation & Setup

### Prerequisites

- Node.js 16.x or higher
- NPM 8.x or higher
- Google Cloud account (for Secret Manager)
- Infura account (for Ethereum API access)

### Initial Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Blockchain-PG.git
   cd Blockchain-PG
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure the `.env` file with your settings:
   ```
   PORT=3000
   ENCRYPTION_KEY=your-secure-encryption-key
   INFURA_URL=https://sepolia.infura.io/v3/your-infura-key
   MERCHANT_ADDRESS=your-merchant-ethereum-address
   API_KEY=your-admin-api-key
   SECRETS_BACKEND=local  # or 'gcp' for Google Cloud Secret Manager
   ```

### Setting Up Google Cloud Secret Manager

1. Create a GCP project in the Google Cloud Console

2. Enable the Secret Manager API for your project

3. Create a service account with Secret Manager Admin role

4. Download service account JSON key

5. Place the key in `secure/blockchain-pg-secrets-d1180136801c.json`

6. Update your `.env` file:
   ```
   SECRETS_BACKEND=gcp
   GCP_PROJECT_ID=your-gcp-project-id
   ```

7. Start the server with GCP Secret Manager:
   ```bash
   ./start-with-gcp-secrets.sh
   ```

### Database Setup

The system will automatically:
- Create SQLite database tables on first run
- Synchronize data between JSON files and SQLite
- Create backups of any corrupted database files

## Admin Dashboard

The admin dashboard provides comprehensive management of the payment gateway system.

### Accessing Admin Dashboard

1. Start the server:
   ```bash
   node server.js
   ```

2. Navigate to http://localhost:3000/admin in your browser

3. Use admin credentials to log in

### Dashboard Sections

#### Overview Panel

Shows system health statistics:
- Transaction counts
- Active payment addresses
- System uptime
- Database status

#### User Management

Manage merchant accounts:
- Create, edit, or deactivate merchant accounts
- View merchant transaction history
- Reset merchant credentials

#### Transaction Monitoring

Monitor all system transactions:
- Filter by status, amount, or merchant
- View detailed transaction logs
- Export transaction history as CSV

## Database Management

The system uses SQLite for primary data storage with JSON file fallback for compatibility.

### Database Structure

The main tables include:
- `transactions`: Payment transaction records
- `addresses`: HD wallet derived addresses
- `merchants`: Merchant account information
- `payment_requests`: Customer payment requests

### Database Integrity Monitoring

The admin dashboard includes a database health section that:
- Monitors database integrity
- Detects corruption in JSON files
- Creates automatic backups when corruption is detected
- Provides recovery options

### Backup and Recovery

To create a manual backup:
1. Go to Admin Dashboard > Database Management
2. Click "Create Backup"
3. The system will create timestamped backups of all data files

To restore from backup:
1. Go to Admin Dashboard > Database Management > Available Backups
2. Select the backup file to restore
3. Click "Restore from Backup"
4. Confirm the restoration

## Secret Manager Integration

The system can store sensitive keys in Google Cloud Secret Manager or local files.

### Secrets Dashboard

The GCP Secrets Dashboard provides a visual interface to:
- View all secrets stored in Google Cloud
- Verify Google Cloud integration is working
- Access direct links to Google Cloud Console

### Toggling Between Backends

You can switch between storage backends:
1. Navigate to http://localhost:3000/secrets-demo.html
2. Click "Toggle Backend" to switch between local and GCP
3. Restart the server for changes to take effect

### Managing Secrets

Sensitive information stored includes:
- HD wallet mnemonic phrases
- Private keys
- API credentials

These can be managed through:
1. GCP Secret Manager Console
2. Admin Dashboard > Secure Keys
3. API endpoints with proper authentication

## Wallet Management

The system uses HD (Hierarchical Deterministic) wallets to generate unique payment addresses.

### Wallet Structure

- Master HD Wallet derived from seed phrase
- Unique child wallets for each payment
- Address indexing for transaction tracking

### Address Management

Through Admin Dashboard > HD Wallet, you can:
- View all active payment addresses
- Check address balances
- Release funds from multiple addresses
- Monitor address usage and expiration

### Key Recovery

If the system needs to recover keys:
1. Go to Admin Dashboard > Secure Keys
2. Use the "Recover Keys" function
3. Provide the backup mnemonic phrase
4. The system will regenerate addresses and check balances

## Security Best Practices

### Environment Security

1. **Encryption Key**: Keep your `ENCRYPTION_KEY` secure and never commit it to repositories
2. **API Keys**: Rotate API keys regularly
3. **Access Control**: Limit admin dashboard access to authorized IPs

### Server Hardening

1. **Firewall**: Configure firewall to allow only necessary traffic
2. **HTTPS**: Use SSL/TLS certificates for all traffic
3. **Rate Limiting**: Enable API rate limiting to prevent abuse

### Key Management

1. **Secret Manager**: Use Google Cloud Secret Manager for production environments
2. **Key Rotation**: Implement regular key rotation policies
3. **Principle of Least Privilege**: Restrict service account permissions

## Monitoring & Maintenance

### System Logs

Server logs are available at:
- Console output when running locally
- Log files in the `logs/` directory
- Structured logs for blockchain transactions

### Performance Monitoring

Key metrics to monitor:
- API response times
- Database query performance
- Blockchain transaction confirmation times
- Error rates and types

### Update Procedures

To update the system:
1. Back up all data files and the database
2. Pull the latest code from the repository
3. Install any new dependencies: `npm install`
4. Run database migrations if needed
5. Restart the server

## Troubleshooting

### Common Issues

#### Database Corruption

**Symptoms**: Error messages about invalid JSON or database integrity
**Solution**:
1. Check Admin Dashboard > Database Management for corruption alerts
2. Use the automatic recovery feature to restore from backup
3. If automatic recovery fails, manually restore from backup files

#### Payment Processing Issues

**Symptoms**: Payments not being detected on the blockchain
**Solution**:
1. Check blockchain provider status (Infura)
2. Verify network connectivity to blockchain APIs
3. Check logs for timeout errors
4. Consider increasing confirmation wait times during network congestion

#### Secret Manager Connection Failures

**Symptoms**: Errors accessing keys or falling back to local storage
**Solution**:
1. Verify service account credentials are correct
2. Check GCP project and Secret Manager API are enabled
3. Ensure service account has appropriate permissions
4. Check network connectivity to Google Cloud APIs

### Support Resources

- GitHub Issues: [https://github.com/yourusername/Blockchain-PG/issues](https://github.com/yourusername/Blockchain-PG/issues)
- Documentation: [https://yourdocumentation.example.com](https://yourdocumentation.example.com)
- Support Email: admin-support@blockchainpaymentgateway.com 