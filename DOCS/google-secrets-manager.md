# Google Secret Manager Integration

This document explains how the Google Secret Manager integration works in the Blockchain Payment Gateway system.

## Overview

The payment gateway now supports storing sensitive keys and secrets in Google Cloud Secret Manager as an alternative to local file-based storage. This implementation is designed as a demonstration that can be easily switched between backends without affecting the existing functionality.

## Architecture

The integration is designed with a "pluggable backend" architecture that allows the system to use either local files or Google Secret Manager:

1. **secretsManager.js** - Main module that delegates to the appropriate backend
2. **gcpSecretsManager.js** - Google Cloud Secret Manager implementation
3. **secretsBackendRoutes.js** - Demo API endpoints for status and toggle functionality

![Architecture Diagram](https://i.imgur.com/6kGCyNr.png)

## Setup Requirements

To use Google Secret Manager, you need:

1. A Google Cloud Platform account
2. A GCP project with Secret Manager API enabled
3. A service account with Secret Manager Admin permissions
4. The service account JSON key stored in `secure/blockchain-pg-secrets-d1180136801c.json`

## Configuration

The system uses the `SECRETS_BACKEND` environment variable to choose which backend to use:

- `SECRETS_BACKEND=local` - Uses local file-based storage (default)
- `SECRETS_BACKEND=gcp` - Uses Google Cloud Secret Manager

You can set this environment variable in your `.env` file or use the provided scripts:

- `./start-with-local-secrets.sh` - Start server with local file storage
- `./start-with-gcp-secrets.sh` - Start server with Google Secret Manager

## Secret Mapping

The system maps between local file paths and GCP secret names as follows:

| Local Path | GCP Secret Name |
|------------|----------------|
| `secure/keys.json` | `blockchain-pg-keys` |
| `secure/privateKey.json` | `blockchain-pg-private-key` |
| Custom names | Same name in GCP |

## Demo Interface

A demonstration interface is available at `/secrets-demo.html` that allows you to:

1. View the current backend status
2. Toggle between backends
3. Create and retrieve demo secrets to test the functionality

## Implementation Details

### Key Features

- Seamless switching between backends
- Consistent API across backends
- Automatic secret creation in GCP if not exists
- Error handling with fallback to local storage if GCP fails
- Full compatibility with existing code

### Security Considerations

- Service account key is stored securely
- All communication with GCP is encrypted using HTTPS
- Secrets in GCP are encrypted at rest and in transit
- Access control via IAM policies

## Production Usage

For production use, we recommend:

1. Setting up proper IAM permissions for the service account
2. Using environment variables instead of the toggle feature
3. Setting up a separate GCP project for production secrets
4. Implementing secret rotation policies
5. Setting up proper monitoring and alerting

## Troubleshooting

Common issues:

1. **GCP access failing**: Ensure the service account key is correct and has proper permissions
2. **Secret not found**: Check if you need to create the secret first in GCP
3. **After toggling**: Remember that you need to restart the server for changes to take effect

## Code Example

This is a simplified example of how to use the secrets manager in your code:

```javascript
const secretsManager = require('./server/utils/secretsManager');

async function getWalletKeys() {
  // This will use either local storage or GCP based on configuration
  const keys = await secretsManager.getSecret('blockchain-pg-keys');
  return keys;
}
```

## Future Improvements

Planned enhancements:

1. Add secret versioning support
2. Implement automatic secret rotation
3. Add support for other cloud providers (AWS, Azure)
4. Add encryption before sending to GCP for extra security

## Conclusion

The Google Secret Manager integration provides a more secure way to store sensitive keys in production environments while maintaining compatibility with the existing system. The demonstration implementation allows you to test both backends seamlessly. 