# Active Development Context

## Current Focus
The current development focus is on implementing BSC network support, Stripe integration, and updating currency from USD to AUD as outlined in the improvement document.

## Primary Objectives
1. **BSC Network Integration**: 
   - Implement Binance Smart Chain network connectivity
   - Support BNB cryptocurrency transactions
   - Mirror existing ETH functionality for BSC

2. **Stripe Integration**:
   - Add traditional payment processing alongside cryptocurrency
   - Create unified payment flow for both crypto and fiat options
   - Implement necessary backend APIs for Stripe processing

3. **Currency Update**:
   - Change pricing display from USD to AUD
   - Implement necessary conversion logic
   - Update UI to reflect AUD currency

## Technical Considerations
- BSC integration requires additional Web3 provider configuration
- Stripe integration needs server-side API endpoints and frontend components
- Currency updates may affect existing transaction records and UI elements

## Active Resources
- [Binance Smart Chain Documentation](https://docs.binance.org/)
- [Stripe API Documentation](https://stripe.com/docs/api)
- Existing codebase, particularly server.js and Web3.js files

## Current Limitations
- Limited test coverage for existing functionality
- Potential security concerns with API endpoints
- Address management system needing optimization

## Next Steps
1. Review server.js to understand current ETH implementation
2. Analyze Web3.js to identify necessary modifications for BSC
3. Explore Stripe API requirements for integration planning
4. Create implementation plan for each feature

## Metrics for Success
- Successful BSC transaction processing
- Functional Stripe payment flow
- Accurate currency display in AUD
- Maintaining existing functionality during updates 