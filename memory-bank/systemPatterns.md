# System Patterns

## Architectural Patterns

### Server Architecture
- Single Node.js Express server handling both API requests and serving static content
- File-based data storage using JSON files instead of traditional databases
- Single-threaded execution model with event-driven design

### Payment Processing Flow
1. **Address Generation**: HD wallet-based unique address generation for each transaction
2. **Payment Monitoring**: Blockchain polling through Infura for transaction verification
3. **Status Updates**: Real-time status updates via Socket.io
4. **Fund Management**: Merchant dashboard for transaction monitoring and fund release

### Security Patterns
1. **Environment Variable Configuration**: Sensitive configuration stored in .env files
2. **Encryption Utilities**: Custom encryption for HD wallet keys
3. **Private Key Isolation**: Separation of merchant keys from HD wallet keys

## Code Organization Patterns

### File Structure
- **Public/**: Frontend assets organized by page (product, cart, dashboard)
- **Json/**: Data storage for keys and transactions
- **Utility Scripts**: Specialized scripts for key generation, recovery, and management

### Communication Patterns
- **REST API**: Traditional HTTP endpoints for merchant operations
- **WebSockets**: Real-time transaction updates
- **Blockchain Events**: Monitoring transactions via polling

## Development Patterns

### Setup and Deployment
- Bash scripts for environment setup and application startup
- Manual key generation and environment configuration
- Developer-focused documentation

### Testing Approach
- Jest configured but limited test coverage evident
- Manual testing flow documented in README.md

## Recurring Design Elements

### Frontend Components
- Consistent dashboard design across merchant and admin interfaces
- Transaction status visualization patterns
- Product catalog and cart interface

### Backend Components
- Encryption/decryption utility functions
- Blockchain transaction handling
- Address derivation and management
- Logging and error handling

## Improvement Patterns
- **Network Expansion**: Pattern for adding additional blockchain networks
- **Payment Method Integration**: Framework for incorporating traditional payment methods
- **Security Hardening**: Progressive enhancement of security measures
- **Performance Optimization**: Systematic approach to performance bottlenecks 