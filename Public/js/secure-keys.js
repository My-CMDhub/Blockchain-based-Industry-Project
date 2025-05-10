// Secure Key Management System
// Handles authentication, key viewing, updating and management

// Global state
const secureKeyState = {
    isAuthenticated: false,
    sessionToken: null,
    recoveryPhrase: '',
    secretPassword: '',
    phraseVerified: false,
    keys: null,
    testMode: false,
    apiKey: null
};

// Initialize on document load
document.addEventListener('DOMContentLoaded', () => {
    // Check for session token in localStorage
    const token = localStorage.getItem('secureKeySessionToken');
    if (token) {
        secureKeyState.sessionToken = token;
        // Verify token is valid
        verifySession(token);
    } else {
        // Show login form
        showLoginForm();
    }

    // Set up event handlers
    setupEventHandlers();
    
    // Get API key for secure requests
    fetchApiKey();
});

// Fetch API key from server
async function fetchApiKey() {
    try {
        const response = await fetch('/api/config/api-key');
        const data = await response.json();
        
        if (data.success && data.apiKey) {
            secureKeyState.apiKey = data.apiKey;
            console.log('API key retrieved successfully');
        } else {
            console.warn('Failed to retrieve API key from server');
        }
    } catch (error) {
        console.error('Error fetching API key:', error);
    }
}

// Helper function to make authenticated API requests with both JWT token and API key
async function fetchSecure(url, options = {}) {
    try {
        // Set up headers with authorization token
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        
        // Add authorization token if available
        if (secureKeyState.sessionToken) {
            headers['Authorization'] = `Bearer ${secureKeyState.sessionToken}`;
        }
        
        // Add API key if available
        if (secureKeyState.apiKey) {
            headers['X-API-Key'] = secureKeyState.apiKey;
        }
        
        // Return fetch with merged options
        return fetch(url, {
            ...options,
            headers
        });
    } catch (error) {
        console.error('Error in fetchSecure:', error);
        throw new Error(`Request error: ${error.message}`);
    }
}

// Set up event handlers for forms and buttons
function setupEventHandlers() {
    // Login form submit
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    // Recovery phrase form submit
    document.getElementById('recovery-phrase-form')?.addEventListener('submit', handleRecoveryPhrase);
    
    // Update keys form submit
    document.getElementById('update-keys-form')?.addEventListener('submit', handleUpdateKeys);
    
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // Reveal key buttons
    document.querySelectorAll('.reveal-key-btn').forEach(btn => {
        btn.addEventListener('click', handleRevealKey);
    });

    // Handle the key type selection to update form guidance
    document.getElementById('key-type-select')?.addEventListener('change', function() {
        const selectedType = this.value;
        const instructionsElement = document.getElementById('key-format-instructions');
        
        if (!instructionsElement) return;
        
        if (selectedType === 'mnemonicPhrase') {
            instructionsElement.innerHTML = `
                <strong class="text-danger">IMPORTANT:</strong> For security reasons, mnemonic phrases must be updated using 
                encrypted format only. You must provide a complete JSON object with both "iv" and "encryptedData" fields:
                <code>{"iv":"value","encryptedData":"value"}</code>
            `;
        } else {
            instructionsElement.innerHTML = `
                For encrypted keys, enter <strong>only the encryptedData value</strong> to preserve the existing encryption format.
                The system will automatically maintain the current IV and encryption structure.
                <br>
                <small class="text-danger">Advanced: If you need to update both IV and encryptedData, provide a complete JSON object: {"iv":"value","encryptedData":"value"}</small>
            `;
        }
    });
}

// Show login form
function showLoginForm() {
    const mainContent = document.getElementById('secure-keys-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="row justify-content-center mt-5">
            <div class="col-md-6">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0"><i class="fas fa-lock me-2"></i>Admin Authentication Required</h5>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-info mb-4">
                            <i class="fas fa-info-circle me-2"></i>
                            This area is for authorized administrators only. Please enter your admin password to continue.
                        </div>
                        
                        <form id="login-form">
                            <div class="mb-3">
                                <label for="admin-password" class="form-label">Admin Password</label>
                                <div class="input-group">
                                    <input type="password" class="form-control" id="admin-password" required>
                                    <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('admin-password')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="d-grid">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-sign-in-alt me-2"></i>Authenticate
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Re-attach event handler after DOM update
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();
    
    const password = document.getElementById('admin-password').value;
    
    if (!password) {
        showAlert('Please enter the admin password', 'danger');
        return;
    }
    
    try {
        // Show loading
        showLoading('Authenticating...');
        
        // Call API to verify admin password
        const response = await fetchSecure('/api/secure-keys/verify-password', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        // Hide loading
        hideLoading();
        
        if (data.success) {
            // Store session token and test mode status
            secureKeyState.isAuthenticated = true;
            secureKeyState.sessionToken = data.token;
            secureKeyState.testMode = !!data.testMode;
            localStorage.setItem('secureKeySessionToken', data.token);
            
            // Show recovery phrase form
            showRecoveryPhraseForm();
        } else {
            showAlert(data.error || 'Authentication failed. Please try again.', 'danger');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

// Show recovery phrase form
function showRecoveryPhraseForm() {
    const mainContent = document.getElementById('secure-keys-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="row justify-content-center mt-5">
            <div class="col-md-8">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-key me-2"></i>Recovery Phrase Verification</h5>
                        <button id="logout-btn" class="btn btn-sm btn-light">
                            <i class="fas fa-sign-out-alt me-1"></i>Logout
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-warning mb-4">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Security Verification:</strong> To access sensitive key information, please enter your recovery phrase and secret password.
                        </div>
                        
                        <form id="recovery-phrase-form">
                            <div class="mb-3">
                                <label for="recovery-phrase" class="form-label">Recovery Phrase</label>
                                <textarea class="form-control" id="recovery-phrase" rows="3" required></textarea>
                                <div class="form-text">
                                    Enter the recovery phrase exactly as provided in your .env file (RECOVERY_PHRASE).
                                    <br>
                                    <em>Example: "test wallet recovery phrase please do not use in production environment"</em>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label for="secret-password" class="form-label">Secret Password</label>
                                <div class="input-group">
                                    <input type="password" class="form-control" id="secret-password" required>
                                    <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('secret-password')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                                <div class="form-text">This is your personal secret password set in the .env file (SECRET_KEY_PASSWORD).</div>
                            </div>
                            
                            <div class="d-grid">
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-unlock-alt me-2"></i>Verify & Access Keys
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Re-attach event handlers after DOM update
    document.getElementById('recovery-phrase-form').addEventListener('submit', handleRecoveryPhrase);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

// Handle recovery phrase form submission
async function handleRecoveryPhrase(event) {
    event.preventDefault();
    
    const phrase = document.getElementById('recovery-phrase').value.trim();
    const password = document.getElementById('secret-password').value;
    
    if (!phrase || !password) {
        showAlert('Please enter both the recovery phrase and secret password', 'danger');
        return;
    }
    
    // Validate recovery phrase format - allow the specific test phrase
    const wordCount = phrase.split(/\s+/).length;
    const testPhraseText = "test wallet recovery phrase please do not use in production environment";
    const isTestPhrase = phrase.toLowerCase().indexOf(testPhraseText.toLowerCase()) !== -1;
    
    if (!isTestPhrase && (wordCount < 12 || wordCount > 14)) {
        showAlert('Recovery phrase should contain 12-14 words', 'warning');
        return;
    }
    
    try {
        // Show loading
        showLoading('Verifying recovery phrase...');
        
        // Call API to verify recovery phrase and secret password using the fetchSecure helper
        const response = await fetchSecure('/api/secure-keys/verify-recovery-phrase', {
            method: 'POST',
            body: JSON.stringify({ phrase, password })
        });
        
        const data = await response.json();
        
        // Hide loading
        hideLoading();
        
        if (data.success) {
            // Store recovery phrase and password in memory (not localStorage)
            secureKeyState.recoveryPhrase = phrase;
            secureKeyState.secretPassword = password;
            secureKeyState.phraseVerified = true;
            secureKeyState.keys = data.keys || {};
            
            // Show key management interface
            showKeyManagementInterface(data.keys);
        } else {
            showAlert(data.error || 'Verification failed. Please check your recovery phrase and secret password.', 'danger');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

// Show key management interface
function showKeyManagementInterface(keys) {
    const mainContent = document.getElementById('secure-keys-content');
    if (!mainContent) return;
    
    // Format keys for display
    const formattedKeys = {
        hdWalletKey: keys?.hdWalletKey || '[Not Available]',
        mnemonicPhrase: keys?.mnemonicPhrase || '[Not Available]',
        masterKey: keys?.masterKey || '[Not Available]',
        privateKey: keys?.privateKey || '[Not Available]'
    };
    
    mainContent.innerHTML = `
        <div class="row mb-4">
            <div class="col-md-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-shield-alt me-2"></i>Secure Key Management</h5>
                        <button id="logout-btn" class="btn btn-sm btn-light">
                            <i class="fas fa-sign-out-alt me-1"></i>Logout
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-success mb-4">
                            <i class="fas fa-check-circle me-2"></i>
                            <strong>Access Granted:</strong> You now have access to view and manage secure wallet keys.
                        </div>
                        
                        <p class="text-danger mb-4">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>IMPORTANT:</strong> These keys control your funds. Never share them with anyone.
                            Keys are displayed in encrypted format by default. Use the reveal functions with extreme caution.
                        </p>
                        
                        <!-- HD Wallet Key -->
                        <div class="key-section mb-4">
                            <h5 class="mb-3">HD Wallet Key</h5>
                            <div class="input-group mb-2">
                                <input type="text" id="hdWalletKey" class="form-control" value="${maskString(formattedKeys.hdWalletKey)}" readonly>
                                <button class="btn btn-outline-primary reveal-key-btn" data-key-type="hdWalletKey">
                                    <i class="fas fa-eye me-1"></i>Reveal
                                </button>
                                <button class="btn btn-outline-secondary" onclick="copyToClipboard('hdWalletKey')">
                                    <i class="fas fa-copy me-1"></i>Copy
                                </button>
                            </div>
                            <div class="form-text">
                                The root HD wallet key used to derive addresses.
                            </div>
                        </div>
                        
                        <!-- Mnemonic Phrase -->
                        <div class="key-section mb-4">
                            <h5 class="mb-3">Mnemonic Phrase</h5>
                            <div class="input-group mb-2">
                                <input type="text" id="mnemonicPhrase" class="form-control" value="${maskString(formattedKeys.mnemonicPhrase)}" readonly>
                                <button class="btn btn-outline-primary reveal-key-btn" data-key-type="mnemonicPhrase">
                                    <i class="fas fa-eye me-1"></i>Reveal
                                </button>
                                <button class="btn btn-outline-secondary" onclick="copyToClipboard('mnemonicPhrase')">
                                    <i class="fas fa-copy me-1"></i>Copy
                                </button>
                            </div>
                            <div class="form-text">
                                The recovery phrase for your wallet (12-24 words).
                            </div>
                        </div>
                        
                        <!-- Master Key -->
                        <div class="key-section mb-4">
                            <h5 class="mb-3">Master Key</h5>
                            <div class="input-group mb-2">
                                <input type="text" id="masterKey" class="form-control" value="${maskString(formattedKeys.masterKey)}" readonly>
                                <button class="btn btn-outline-primary reveal-key-btn" data-key-type="masterKey">
                                    <i class="fas fa-eye me-1"></i>Reveal
                                </button>
                                <button class="btn btn-outline-secondary" onclick="copyToClipboard('masterKey')">
                                    <i class="fas fa-copy me-1"></i>Copy
                                </button>
                            </div>
                            <div class="form-text">
                                The master key derived from your mnemonic.
                            </div>
                        </div>
                        
                        <!-- Private Key -->
                        <div class="key-section">
                            <h5 class="mb-3">Private Key</h5>
                            <div class="input-group mb-2">
                                <input type="text" id="privateKey" class="form-control" value="${maskString(formattedKeys.privateKey)}" readonly>
                                <button class="btn btn-outline-primary reveal-key-btn" data-key-type="privateKey">
                                    <i class="fas fa-eye me-1"></i>Reveal
                                </button>
                                <button class="btn btn-outline-secondary" onclick="copyToClipboard('privateKey')">
                                    <i class="fas fa-copy me-1"></i>Copy
                                </button>
                            </div>
                            <div class="form-text">
                                The private key for the main wallet.
                            </div>
                        </div>
                        
                        <hr class="my-4">
                        
                        <!-- Update Keys Section -->
                        <div class="mt-4">
                            <h5 class="mb-3"><i class="fas fa-edit me-2"></i>Update Keys</h5>
                            <div class="alert alert-warning mb-3">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Warning:</strong> Updating keys is a sensitive operation. Make sure you have backups before proceeding.
                            </div>
                            
                            <form id="update-keys-form">
                                <div class="mb-3">
                                    <label for="key-type-select" class="form-label">Select Key to Update</label>
                                    <select class="form-select" id="key-type-select" required>
                                        <option value="">-- Select Key Type --</option>
                                        <option value="hdWalletKey">HD Wallet Key</option>
                                        <option value="mnemonicPhrase">Mnemonic Phrase</option>
                                        <option value="masterKey">Master Key</option>
                                        <option value="privateKey">Private Key</option>
                                    </select>
                                </div>
                                
                                <div class="mb-3">
                                    <label for="new-key-value" class="form-label">New Value</label>
                                    <textarea class="form-control" id="new-key-value" rows="3" required></textarea>
                                    <div id="key-format-instructions" class="form-text">
                                        For encrypted keys, enter <strong>only the encryptedData value</strong> to preserve the existing encryption format.
                                        The system will automatically maintain the current IV and encryption structure.
                                        <br>
                                        <small class="text-danger">Advanced: If you need to update both IV and encryptedData, provide a complete JSON object: {"iv":"value","encryptedData":"value"}</small>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label for="update-secret-password" class="form-label">Secret Password</label>
                                    <input type="password" class="form-control" id="update-secret-password" required>
                                    <div class="form-text">
                                        Re-enter your secret password to confirm this update.
                                    </div>
                                </div>
                                
                                <div class="text-end">
                                    <button type="submit" class="btn btn-danger">
                                        <i class="fas fa-save me-1"></i>Update Key
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Re-attach event handlers after DOM update
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('update-keys-form').addEventListener('submit', handleUpdateKeys);
    
    // Add reveal key handlers
    document.querySelectorAll('.reveal-key-btn').forEach(button => {
        button.addEventListener('click', handleRevealKey);
    });
}

// Handle reveal key button click
async function handleRevealKey(event) {
    const button = event.currentTarget;
    const keyType = button.getAttribute('data-key-type');
    const inputField = document.getElementById(keyType);
    
    if (!inputField) return;
    
    // If already revealed, hide it again
    if (button.innerHTML.includes('Hide')) {
        // Hide the key
        inputField.value = maskString(inputField.getAttribute('data-original-value') || '');
        
        // Change button text
        button.innerHTML = '<i class="fas fa-eye me-1"></i>Reveal';
        button.classList.remove('btn-warning');
        button.classList.add('btn-outline-primary');
        
        return;
    }
    
    try {
        // Confirm before revealing
        if (!confirm(`Are you sure you want to reveal the ${keyType.replace(/([A-Z])/g, ' $1').toLowerCase()}? This is a sensitive operation.`)) {
            return;
        }
        
        // Show loading
        showLoading('Retrieving key...');
        
        // Call API to reveal the key
        const response = await fetch('/api/secure-keys/reveal-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secureKeyState.sessionToken}`,
                'X-API-Key': secureKeyState.apiKey
            },
            body: JSON.stringify({
                keyType,
                password: secureKeyState.secretPassword,
                recoveryPhrase: secureKeyState.recoveryPhrase,
                revealFull: false // Never request full unmasked key
            })
        });
        
        const data = await response.json();
        
        // Hide loading
        hideLoading();
        
        if (data.success) {
            // Store original encrypted value
            inputField.setAttribute('data-original-value', inputField.value);
            
            // Show the masked encrypted key
            inputField.value = formatKeyForDisplay(data.key);
            
            // Update display class for better appearance of key data
            inputField.classList.add('monospace-font');
            
            // Change button text
            button.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Hide';
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-warning');
            
            // Auto-hide after timeout (30 seconds)
            setTimeout(function hideKey() {
                // Only hide if still revealed
                if (button.innerHTML.includes('Hide')) {
                    // Hide the key
                    inputField.value = maskString(inputField.getAttribute('data-original-value') || '');
                    
                    // Change button text back
                    button.innerHTML = '<i class="fas fa-eye me-1"></i>Reveal';
                    button.classList.remove('btn-warning');
                    button.classList.add('btn-outline-primary');
                    
                    // Remove monospace class
                    inputField.classList.remove('monospace-font');
                    
                    // Show notification
                    showAlert('Key automatically hidden for security', 'info', 3000);
                }
            }, 30000);
        } else {
            showAlert(data.error || 'Failed to reveal key. Please try again.', 'danger');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

// Format key for display
function formatKeyForDisplay(keyValue) {
    // No need to parse or format anymore, the server gives us the displayable value directly
    return keyValue;
}

// Mask string for display
function maskString(str) {
    if (!str) return '[Not Available]';
    
    // Remove any formatting/whitespace for consistent masking
    str = str.replace(/\s+/g, '').replace(/\n/g, '');
    
    // If it appears to be a JSON string of an encrypted object
    if (str.includes('"iv"') && str.includes('"encryptedData"')) {
        try {
            // Parse the JSON to properly handle the structure
            const encData = JSON.parse(str);
            
            // Create a masked version that preserves the structure
            return JSON.stringify({
                iv: encData.iv || '[masked]',
                encryptedData: maskEncryptedData(encData.encryptedData || '')
            }, null, 2); // Pretty-print with 2 spaces
        } catch (e) {
            // If parsing fails, mask the whole thing
            if (str.length <= 60) {
                return str.substring(0, 8) + ' • • • • • • • • ' + str.substring(str.length - 8);
            } else {
                return str.substring(0, 10) + ' ••••••••••••••••••••••••• ' + str.substring(str.length - 10);
            }
        }
    }
    
    // For normal strings, show just the beginning and end with asterisks
    if (str.length <= 6) {
        return '••••••';
    } else if (str.length <= 60) {
        return str.substring(0, 8) + ' • • • • • • • • ' + str.substring(str.length - 8);
    } else {
        return str.substring(0, 10) + ' ••••••••••••••••••••••••• ' + str.substring(str.length - 10);
    }
}

// Helper to mask encrypted data
function maskEncryptedData(data) {
    if (!data) return '';
    
    // For short data, mask most characters
    if (data.length <= 20) {
        return data.substring(0, 4) + '•••••••' + data.substring(data.length - 4);
    } else if (data.length <= 60) {
        return data.substring(0, 8) + ' • • • • • • • • ' + data.substring(data.length - 8);
    } else {
        // For longer data, show more context at the start and end with clear separator
        return data.substring(0, 10) + ' ••••••••••••••••••••••••• ' + data.substring(data.length - 10);
    }
}

// Handle update keys form submission - updated to work with encrypted format
async function handleUpdateKeys(event) {
    event.preventDefault();
    
    const keyType = document.getElementById('key-type-select').value;
    const newValue = document.getElementById('new-key-value').value;
    const password = document.getElementById('update-secret-password').value;
    
    if (!keyType || !newValue || !password) {
        showAlert('Please fill in all fields', 'danger');
        return;
    }
    
    // Validate new value format
    if (!validateKeyFormat(keyType, newValue)) {
        return;
    }
    
    // Confirm before updating
    if (!confirm(`Are you sure you want to update the ${keyType.replace(/([A-Z])/g, ' $1').toLowerCase()}? This is a critical operation that may impact your funds.`)) {
        return;
    }
    
    // For encrypted keys, check if the input is attempting to be a complete JSON
    // If not, assume it's just the encryptedData portion
    let processedValue = newValue;
    
    // Check if the input looks like a complete JSON object
    if (newValue.trim().startsWith('{') && newValue.trim().endsWith('}')) {
        try {
            // Try to parse it and validate
            const parsed = JSON.parse(newValue);
            
            // If it's a valid iv+encryptedData format, use it directly
            if (parsed.iv && parsed.encryptedData) {
                processedValue = newValue; // Use the original JSON string
            } else {
                // Looks like JSON but missing required fields
                showAlert('Invalid encrypted key format. Must include both "iv" and "encryptedData" fields if providing a complete JSON object.', 'warning');
                return;
            }
        } catch (e) {
            // Not valid JSON, assume it's meant to be a plain string encryptedData
            processedValue = newValue;
        }
    }
    
    try {
        // Show loading
        showLoading('Updating key...');
        
        // Call API to update the key
        const response = await fetch('/api/secure-keys/update-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${secureKeyState.sessionToken}`,
                'X-API-Key': secureKeyState.apiKey
            },
            body: JSON.stringify({
                keyType,
                newValue: processedValue,
                password,
                recoveryPhrase: secureKeyState.recoveryPhrase
            })
        });
        
        const data = await response.json();
        
        // Hide loading
        hideLoading();
        
        if (data.success) {
            showAlert(`${keyType.replace(/([A-Z])/g, ' $1').toLowerCase()} updated successfully!`, 'success');
            
            // Clear the form
            document.getElementById('key-type-select').value = '';
            document.getElementById('new-key-value').value = '';
            document.getElementById('update-secret-password').value = '';
            
            // Force re-verify to get updated keys
            secureKeyState.phraseVerified = false;
            handleRecoveryPhrase(new Event('submit'));
        } else {
            showAlert(data.error || 'Failed to update key. Please try again.', 'danger');
        }
    } catch (error) {
        hideLoading();
        showAlert(`Error: ${error.message}`, 'danger');
    }
}

// Validate key format based on key type
function validateKeyFormat(keyType, value) {
    switch (keyType) {
        case 'mnemonicPhrase':
            // For mnemonic, STRICTLY require encrypted format for security
            // This prevents admins from seeing or entering raw mnemonic phrases
            if (value.trim().startsWith('{')) {
                try {
                    // Validate it's a proper encrypted JSON
                    const parsed = JSON.parse(value);
                    if (!parsed.iv || !parsed.encryptedData) {
                        showAlert('Invalid encrypted format. Mnemonic phrase must include both "iv" and "encryptedData" fields.', 'warning');
                        return false;
                    }
                    return true;
                } catch (e) {
                    showAlert('Invalid JSON format for encrypted mnemonic. Please check your input.', 'warning');
                    return false;
                }
            } else {
                // Reject any non-encrypted format for mnemonic phrases
                showAlert('For security reasons, mnemonic phrases must be updated using encrypted format only: {"iv":"value","encryptedData":"value"}.', 'danger');
                return false;
            }
            break;
            
        case 'hdWalletKey':
        case 'masterKey':
        case 'privateKey':
            // Check if it's an encrypted format
            if (value.includes('"iv"') && value.includes('"encryptedData"')) {
                try {
                    // Validate it's a proper encrypted JSON
                    const parsed = JSON.parse(value);
                    if (!parsed.iv || !parsed.encryptedData) {
                        showAlert('Invalid encrypted format. Must include both "iv" and "encryptedData" fields.', 'warning');
                        return false;
                    }
                } catch (e) {
                    showAlert('Invalid JSON format for encrypted key. Please check your input.', 'warning');
                    return false;
                }
            } else if (value.trim().startsWith('{')) {
                // Looks like attempted JSON but isn't valid encryption format
                showAlert('Appears to be JSON but missing required encryption fields. For encrypted keys, provide just the encryptedData value to preserve the IV, or a complete {"iv":"...","encryptedData":"..."} object.', 'warning');
                return false;
            } else if (value.length < 16) {
                // For raw keys, just check minimal length for validity
                showAlert(`${keyType.replace(/([A-Z])/g, ' $1').toLowerCase()} appears too short. Please check your input.`, 'warning');
                return false;
            }
            
            // Add clearer guidance for updating encrypted keys
            if (!value.includes('"iv"') && !value.trim().startsWith('{')) {
                // Display helpful info but allow the update
                showAlert('You are updating only the encrypted data portion. The system will preserve the existing IV.', 'info', 6000);
            }
            break;
    }
    
    return true;
}

// Handle logout button click
function handleLogout() {
    // Clear session data
    secureKeyState.isAuthenticated = false;
    secureKeyState.sessionToken = null;
    secureKeyState.recoveryPhrase = '';
    secureKeyState.secretPassword = '';
    secureKeyState.phraseVerified = false;
    secureKeyState.keys = null;
    
    // Remove token from localStorage
    localStorage.removeItem('secureKeySessionToken');
    
    // Show login form
    showLoginForm();
    
    // Show notification
    showAlert('You have been logged out successfully', 'info');
}

// Verify session token
async function verifySession(token) {
    try {
        // Show loading
        showLoading('Verifying session...');
        
        // Call API to verify session token using the fetchSecure helper
        const response = await fetchSecure('/api/secure-keys/verify-session', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        // Hide loading
        hideLoading();
        
        if (data.success) {
            // Session is valid, show recovery phrase form
            secureKeyState.isAuthenticated = true;
            secureKeyState.testMode = !!data.testMode;
            showRecoveryPhraseForm();
        } else {
            // Session is invalid, clear token and show login form
            localStorage.removeItem('secureKeySessionToken');
            showLoginForm();
        }
    } catch (error) {
        // On error, assume session is invalid
        hideLoading();
        localStorage.removeItem('secureKeySessionToken');
        showLoginForm();
    }
}

// Show alert message
function showAlert(message, type = 'info', timeout = 5000) {
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) return;
    
    // Create alert element
    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    alertEl.role = 'alert';
    
    alertEl.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Add to container
    alertContainer.appendChild(alertEl);
    
    // Auto-dismiss after timeout
    if (timeout > 0) {
        setTimeout(() => {
            try {
                const bsAlert = new bootstrap.Alert(alertEl);
                bsAlert.close();
            } catch (e) {
                // If Bootstrap JS not available, remove manually
                alertEl.remove();
            }
        }, timeout);
    }
}

// Show loading overlay
function showLoading(message = 'Loading...') {
    // Check if loading overlay already exists
    if (document.getElementById('loading-overlay')) {
        return;
    }
    
    // Create loading overlay
    const loadingEl = document.createElement('div');
    loadingEl.id = 'loading-overlay';
    
    loadingEl.innerHTML = `
        <div class="bg-white p-4 rounded shadow-lg text-center">
            <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mb-0">${message}</p>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(loadingEl);
}

// Hide loading overlay
function hideLoading() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) loadingEl.remove();
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

// Copy to clipboard
function copyToClipboard(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    // Get either revealed value or masked value
    const value = input.value;
    
    if (value === '[Not Available]' || value.includes('******')) {
        showAlert('Cannot copy masked value. Please reveal the key first.', 'warning');
        return;
    }
    
    // Create temporary textarea to copy from
    const textarea = document.createElement('textarea');
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        showAlert(`${inputId.replace(/([A-Z])/g, ' $1').toLowerCase()} copied to clipboard`, 'success', 2000);
    } catch (err) {
        showAlert('Failed to copy to clipboard', 'danger');
    }
    
    document.body.removeChild(textarea);
}

// Ensure value is a string
function ensureString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Handle encrypted objects as special case
    if (typeof value === 'object') {
        try {
            // If it has encrypted data properties, format as JSON
            if (value.iv && value.encryptedData) {
                return JSON.stringify({
                    iv: value.iv,
                    encryptedData: value.encryptedData
                });
            }
            
            // Otherwise, try regular stringify
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }
    
    return String(value);
}

// Check if value is in encrypted format
function isEncryptedFormat(value) {
    if (typeof value !== 'string') return false;
    
    try {
        const parsed = JSON.parse(value);
        return (
            parsed &&
            typeof parsed === 'object' &&
            typeof parsed.iv === 'string' &&
            typeof parsed.encryptedData === 'string'
        );
    } catch (e) {
        return false;
    }
} 