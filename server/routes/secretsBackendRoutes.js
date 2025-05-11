/**
 * Routes for secrets backend management and toggling
 * (For demonstration purposes only)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const secretsManager = require('../utils/secretsManager');
const { logToFile } = require('../utils/logger');

// Get current secrets backend status
router.get('/backend-status', (req, res) => {
  try {
    // Get backend info from the secrets manager
    const backendInfo = secretsManager.getBackendInfo();

    res.json({
      success: true,
      backendInfo: {
        current: backendInfo.backend,
        isGcpActive: backendInfo.useGcp,
        localPath: backendInfo.localPath,
        testMode: backendInfo.testMode
      }
    });
  } catch (error) {
    logToFile(`ERROR: Failed to get secrets backend status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to get secrets backend status: ${error.message}`
    });
  }
});

// Toggle secrets backend (demo purposes only)
router.post('/toggle-backend', (req, res) => {
  try {
    // Get current backend from .env
    const envFilePath = path.join(__dirname, '../../.env');
    let envContent = '';
    
    if (fs.existsSync(envFilePath)) {
      envContent = fs.readFileSync(envFilePath, 'utf8');
    }

    // Parse current backend from env content
    const currentBackend = process.env.SECRETS_BACKEND || 'local';
    
    // Determine new backend
    const newBackend = currentBackend === 'gcp' ? 'local' : 'gcp';
    
    // Update .env file
    let newEnvContent = '';
    if (envContent.includes('SECRETS_BACKEND=')) {
      // Replace existing setting
      newEnvContent = envContent.replace(
        /SECRETS_BACKEND=.*/,
        `SECRETS_BACKEND=${newBackend}`
      );
    } else {
      // Add new setting
      newEnvContent = envContent + `\nSECRETS_BACKEND=${newBackend}\n`;
    }
    
    // Write updated .env file
    fs.writeFileSync(envFilePath, newEnvContent);
    
    // Note: This won't take effect until server restart
    res.json({
      success: true,
      message: `Secrets backend toggled from '${currentBackend}' to '${newBackend}'. Please restart the server for changes to take effect.`,
      newBackend,
      requiresRestart: true
    });
  } catch (error) {
    logToFile(`ERROR: Failed to toggle secrets backend: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to toggle secrets backend: ${error.message}`
    });
  }
});

// Create demo secret (test GCP integration)
router.post('/create-demo-secret', async (req, res) => {
  try {
    const { secretName, secretValue } = req.body;
    
    if (!secretName || !secretValue) {
      return res.status(400).json({
        success: false,
        error: 'Secret name and value are required'
      });
    }
    
    // Store the secret
    const success = await secretsManager.updateSecret(secretName, { value: secretValue });
    
    if (success) {
      res.json({
        success: true,
        message: `Demo secret '${secretName}' created successfully`,
        backend: secretsManager.getBackendInfo().backend
      });
    } else {
      throw new Error('Failed to store secret');
    }
  } catch (error) {
    logToFile(`ERROR: Failed to create demo secret: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to create demo secret: ${error.message}`
    });
  }
});

// Get demo secret (test GCP integration)
router.get('/get-demo-secret/:name', async (req, res) => {
  try {
    const secretName = req.params.name;
    
    if (!secretName) {
      return res.status(400).json({
        success: false,
        error: 'Secret name is required'
      });
    }
    
    // Get the secret
    const secret = await secretsManager.getSecret(secretName);
    
    if (Object.keys(secret).length > 0) {
      res.json({
        success: true,
        secretValue: secret.value || secret,
        backend: secretsManager.getBackendInfo().backend
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Secret '${secretName}' not found`,
        backend: secretsManager.getBackendInfo().backend
      });
    }
  } catch (error) {
    logToFile(`ERROR: Failed to get demo secret: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to get demo secret: ${error.message}`
    });
  }
});

// List all secrets stored in GCP
router.get('/gcp-secrets-list', async (req, res) => {
  try {
    // Make sure we're using GCP backend
    const backendInfo = secretsManager.getBackendInfo();
    if (backendInfo.backend !== 'gcp' || !backendInfo.useGcp) {
      return res.status(400).json({
        success: false,
        error: "Not currently using GCP Secret Manager",
        currentBackend: backendInfo.backend
      });
    }
    
    // Get GCP Secret Manager client
    const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
    const PROJECT_ID = process.env.GCP_PROJECT_ID || 'blockchain-pg-secrets';
    
    // Initialize the client with service account file if available
    const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../../secure/blockchain-pg-secrets-d1180136801c.json');
    let client;
    
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      client = new SecretManagerServiceClient({
        keyFilename: SERVICE_ACCOUNT_PATH
      });
    } else {
      client = new SecretManagerServiceClient();
    }
    
    // List all secrets in the project
    const [secrets] = await client.listSecrets({
      parent: `projects/${PROJECT_ID}`
    });
    
    // Format the results for display
    const secretsList = await Promise.all(secrets.map(async (secret) => {
      const name = secret.name.split('/').pop();
      
      // Get the latest version
      try {
        const [versions] = await client.listSecretVersions({
          parent: secret.name
        });
        
        const latestVersion = versions.find(v => v.state === 'ENABLED');
        const versionId = latestVersion ? latestVersion.name.split('/').pop() : 'none';
        const createTime = latestVersion ? latestVersion.createTime : null;
        
        return {
          name,
          fullPath: secret.name,
          latestVersion: versionId,
          createTime: createTime ? new Date(createTime.seconds * 1000).toISOString() : null,
          gcpConsoleUrl: `https://console.cloud.google.com/security/secret-manager/secret/${name}?project=${PROJECT_ID}`
        };
      } catch (error) {
        return {
          name,
          fullPath: secret.name,
          error: `Failed to get versions: ${error.message}`
        };
      }
    }));
    
    res.json({
      success: true,
      gcpProjectId: PROJECT_ID,
      gcpConsoleUrl: `https://console.cloud.google.com/security/secret-manager?project=${PROJECT_ID}`,
      secretsCount: secretsList.length,
      secrets: secretsList
    });
  } catch (error) {
    console.error('Error listing GCP secrets:', error);
    logToFile(`ERROR: Failed to list GCP secrets: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `Failed to list GCP secrets: ${error.message}`
    });
  }
});

module.exports = router; 