# Blockchain Payment Gateway - User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Setting Up Your Account](#setting-up-your-account)
4. [Receiving Cryptocurrency Payments](#receiving-cryptocurrency-payments)
5. [Managing Payments](#managing-payments)
6. [Releasing Funds](#releasing-funds)
7. [Stripe Integration](#stripe-integration)
8. [Security](#security)
9. [Troubleshooting](#troubleshooting)
10. [FAQs](#faqs)

## Introduction

The Blockchain Payment Gateway allows merchants to accept cryptocurrency payments (currently Ethereum) alongside traditional payment methods via Stripe. This guide will help you understand how to use the system effectively.

### Key Features

- **Cryptocurrency Acceptance**: Accept ETH payments on the Sepolia testnet (Ethereum)
- **HD Wallet Technology**: Secure hierarchical deterministic wallet generation for each payment
- **Stripe Integration**: Accept credit card payments via Stripe
- **Merchant Dashboard**: Monitor transactions, balances, and payment status
- **Fund Release**: Easily transfer received cryptocurrency to your merchant wallet
- **Security**: Keys stored securely using Google Cloud Secret Manager

## Getting Started

### System Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Merchant account credentials

### Accessing the System

1. Navigate to the payment gateway URL provided by your administrator
2. Log in using your merchant credentials
3. You'll be redirected to the merchant dashboard

## Setting Up Your Account

Before you can accept payments, you need to configure your account:

1. **Merchant Wallet**: Set up your merchant wallet address where you'll receive released funds
   - From the dashboard, click on "Settings"
   - Enter your Ethereum wallet address in the "Merchant Wallet" field
   - Click "Save Changes"

2. **API Credentials**: If you plan to integrate with your own systems
   - Navigate to "API Settings"
   - Generate a new API key
   - Store this key securely – it will only be shown once

3. **Notification Settings**: Configure how you want to be notified of payments
   - Go to "Notification Settings"
   - Enter your email for payment notifications
   - Choose notification frequency (instant, hourly digest, daily digest)

## Receiving Cryptocurrency Payments

### Creating a Payment Request

1. From the merchant dashboard, click "New Payment Request"
2. Enter the payment amount in your preferred currency
3. The system will calculate the equivalent amount in ETH
4. Click "Generate Payment Address"
5. The system will generate a unique payment address and QR code

### Sharing with Customers

You can share the payment request with customers in several ways:

1. **Direct Link**: Share the generated payment URL
2. **QR Code**: Display the QR code for customers to scan
3. **Email**: Send the payment details via email
4. **Embed in Website**: Use our JavaScript widget to embed a payment button

### Payment Flow for Customers

When a customer receives your payment request:

1. They'll see the amount due in ETH and a countdown timer
2. They can pay directly from their cryptocurrency wallet by:
   - Scanning the QR code with their mobile wallet app
   - Copying the payment address to their wallet
3. The page will automatically update once payment is detected
4. A confirmation receipt will be shown upon successful payment

## Managing Payments

### Merchant Dashboard

The dashboard provides an overview of your payment activity:

- **Recent Transactions**: Shows the most recent payments
- **Transaction Status**: Pending, Confirmed, Failed
- **Balance Overview**: Total funds received and available for release
- **Analytics**: Payment trends and statistics

### Transaction Details

Click on any transaction to see detailed information:

- Transaction hash (viewable on block explorer)
- Amount received
- Timestamp
- Status (including confirmation count)
- Customer details (if available)
- Payment address

### Handling Wrong Payments

Sometimes customers may send incorrect amounts:

1. Navigate to "Wrong Payments" in the dashboard
2. Review the list of payments that don't match expected amounts
3. For each payment, you can:
   - Mark as resolved (if you've handled it offline)
   - Refund the payment (requires manual processing)
   - Apply to a different order (if applicable)

## Releasing Funds

When you're ready to transfer received cryptocurrency to your merchant wallet:

### Single Release

1. From the dashboard, click "Release Funds"
2. Enter the amount you wish to release
3. Review the transaction fee estimate
4. Click "Confirm Release"
5. Enter your authentication code if prompted
6. The system will execute the transaction and provide a transaction hash

### Release All Funds

To release all available funds:

1. Click "Release All Funds" from the dashboard
2. Review the total amount and transaction fee
3. Confirm the release
4. Monitor the transaction status in the "Recent Releases" section

### Automatic Releases

You can configure automatic releases based on:

- Threshold amount (e.g., release when balance exceeds 1 ETH)
- Schedule (daily, weekly, monthly)
- Configure these settings in the "Release Settings" section

## Stripe Integration

In addition to cryptocurrency, you can accept credit card payments via Stripe:

### Enabling Stripe

1. Go to "Payment Methods" in settings
2. Toggle "Enable Stripe Payments"
3. Connect your Stripe account or enter your API keys
4. Configure payment options (accepted cards, etc.)

### Customer Experience

When Stripe is enabled, customers will see two payment options:

1. Cryptocurrency (ETH)
2. Credit Card

If they choose credit card, they'll be directed to a secure Stripe payment form.

### Stripe Dashboard

All Stripe transactions will appear in:

1. Your payment gateway merchant dashboard
2. Your Stripe dashboard (manage refunds and disputes there)

## Security

### Key Security

- All sensitive keys are encrypted and stored securely
- Wallet keys are managed using a hierarchical deterministic (HD) wallet system
- Google Cloud Secret Manager is used for the highest level of security

### Best Practices

1. **Never share your login credentials**
2. **Enable two-factor authentication** for your merchant account
3. **Regularly rotate your API keys** if you use the API
4. **Monitor your transactions** for any suspicious activity
5. **Set up email alerts** for large transactions

## Troubleshooting

### Common Issues

#### Payment Not Detected

If a customer reports they've sent payment but it's not showing up:

1. Check the transaction hash on a block explorer
2. Verify they sent to the correct address
3. Ensure they sent the correct amount
4. Allow 2-3 minutes for network confirmation
5. Check the "Pending Transactions" section in your dashboard

#### Failed Release

If a fund release fails:

1. Check your network connection
2. Verify your merchant wallet address is correct
3. Ensure there are sufficient funds (including for transaction fees)
4. Try again with a smaller amount (network conditions may require lower gas)
5. Contact support if the issue persists

#### Dashboard Not Loading

If you encounter issues with the dashboard:

1. Clear your browser cache
2. Try a different browser
3. Check your internet connection
4. Ensure you're using a supported browser
5. Contact support if the issue persists

## FAQs

### General Questions

**Q: What cryptocurrencies do you support?**  
A: Currently, we support Ethereum (ETH) on the Sepolia testnet. Support for Binance Smart Chain (BNB) is planned for future releases.

**Q: How long do payments take to process?**  
A: Payments are typically detected within 30 seconds of being broadcast to the network. Full confirmation may take 2-5 minutes depending on network conditions.

**Q: Are there any fees?**  
A: The payment gateway charges a small processing fee on each transaction. Additionally, network transaction fees apply when releasing funds to your merchant wallet.

**Q: How secure is the system?**  
A: We use industry-standard security practices, including encrypted storage of sensitive keys in Google Cloud Secret Manager, HD wallet technology, and secure API endpoints.

### Technical Questions

**Q: Can I integrate this with my existing website?**  
A: Yes, we provide API endpoints and JavaScript widgets for easy integration with your website or application.

**Q: What happens if a customer sends the wrong amount?**  
A: The system will detect this as a "wrong payment" and notify you. You can then decide how to handle it (refund, apply to a different order, etc.).

**Q: Can I get notified for each payment?**  
A: Yes, you can configure email notifications for each payment or receive summary notifications at your preferred frequency.

**Q: Is there an API available?**  
A: Yes, we provide a comprehensive API for merchants to integrate with their systems. API documentation is available in the developer section.

## Contact Support

If you need further assistance, you can contact support:

- Email: support@blockchainpaymentgateway.com
- Phone: +1-800-CRYPTO-PAY
- Live Chat: Available on the merchant dashboard during business hours 