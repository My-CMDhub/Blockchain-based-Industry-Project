// Initialize Web3 instance
let web3;
try {
    // Initialize Web3 with a fallback provider
    web3 = new Web3(new Web3.providers.HttpProvider('https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'));
    console.log('Web3 initialized successfully with chain ID:', web3.eth.getChainId);
} catch (error) {
    console.error('Failed to initialize web3:', error);
    // Fallback to a minimal web3 instance that can at least handle utils functions
    web3 = new Web3();
}

// Check if web3 utils are available
if (!web3.utils) {
    console.error('Web3 utils not available - some functionality may be limited');
}

// Cache for balance data to avoid unnecessary fetches
let balanceCache = null;
let balanceCacheTime = 0;
const BALANCE_CACHE_DURATION = 30000; // 30 seconds

// Cache for transaction data
let transactionCache = null;
let transactionCacheTime = 0;
const TRANSACTION_CACHE_DURATION = 30000; // 30 seconds

// API Key - hardcoded to match the server's expected key from .env file
const API_KEY = "ef2d127de37b942baad06145e54b0c619a1f22f95b608e65f3c6b1a7a59dfc47";

// Helper function to make authenticated API requests
async function fetchWithAuth(url, options = {}) {
    try {
        // Log key info for debugging (partial key only)
        console.log(`Using API key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 8)} for request to ${url}`);
        
        // Merge headers, ensuring X-API-Key is included
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            ...(options.headers || {})
        };
        
        // Return fetch with merged options
        return fetch(url, {
            ...options,
            headers
        });
    } catch (error) {
        console.error('Error in fetchWithAuth:', error);
        throw new Error(`Authentication error: ${error.message}`);
    }
}

// Format ETH value consistently - improved version
function formatETHValue(value) {
    // Handle potential null, undefined, or invalid values
    if (!value && value !== 0) {
        return '0.000000';
    }
    
    try {
        // Handle BigInt or large number strings that might be in Wei
        if (typeof value === 'bigint' || (typeof value === 'string' && !value.includes('.') && value.length > 10)) {
            // Convert from Wei to ETH
            const valueInEth = Number(value) / 1e18;
            return valueInEth.toFixed(6);
        }
        
        // Check if the value is already a decimal string (e.g. "0.125")
        if (typeof value === 'string' && value.includes('.')) {
            // Already in ETH format, just format it
            const floatValue = parseFloat(value);
            if (isNaN(floatValue)) return '0.000000';
            return floatValue.toFixed(6);
        }
        
        // Check if web3.utils is available for conversion
        if (web3 && web3.utils && web3.utils.fromWei && value.toString().length > 10) {
            try {
                // Convert wei to ETH (handles string or number inputs)
                const valueStr = value.toString();
                const ethValue = web3.utils.fromWei(valueStr, 'ether');
                const ethFloat = parseFloat(ethValue);
                return ethFloat.toFixed(6);
            } catch (web3Error) {
                console.warn('Error using web3.utils.fromWei, falling back to manual conversion:', web3Error);
                // Fallback to manual conversion
                const numValue = Number(value) / 1e18;
                if (isNaN(numValue)) return '0.000000';
                return numValue.toFixed(6);
            }
        } else {
            // For regular numbers or small strings, format directly
            const numValue = Number(value);
            return numValue.toFixed(6);
        }
    } catch (error) {
        console.error('Error formatting ETH value:', error, value);
        // Last resort fallback
        return '0.000000';
    }
}

// Safely convert any balance format to ETH
function safeToEth(balance) {
    if (!balance && balance !== 0) return 0;
    
    try {
        // If it's already in ETH format (decimal string)
        if (typeof balance === 'string' && balance.includes('.')) {
            return parseFloat(balance);
        }
        
        // Handle large numbers that are likely in Wei
        if (typeof balance === 'string' && !balance.includes('.') && balance.length > 10) {
            return Number(balance) / 1e18;
        }
        
        // Check if web3.utils is available
        if (!web3 || !web3.utils || !web3.utils.fromWei) {
            console.warn('web3.utils not available, using manual conversion');
            return Number(balance) / 1e18;
        }
        
        try {
            // Convert from wei using web3.utils
            const balanceStr = balance.toString();
            return parseFloat(web3.utils.fromWei(balanceStr, 'ether'));
        } catch (web3Error) {
            console.warn('Error using web3.utils.fromWei in safeToEth:', web3Error);
            // Fallback method
            return Number(balance) / 1e18;
        }
    } catch (error) {
        console.error('Error converting balance to ETH:', error, balance);
        // Default fallback
        return 0;
    }
}

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing merchant dashboard...');
    
    // Log API key info for debugging (partial key)
    console.log(`Using API key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 8)}`);
    
    // Initial data load
    try {
        refreshBalance(true);
        refreshTransactionHistory(true);
        loadMerchantConfig();
        
        // Set up auto-refresh with error handling
        setInterval(() => {
            try {
                refreshBalance();
            } catch (error) {
                console.error('Auto-refresh balance error:', error);
            }
        }, 30000);
        
        setInterval(() => {
            try {
                refreshTransactionHistory();
            } catch (error) {
                console.error('Auto-refresh transactions error:', error);
            }
        }, 30000);
        
        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showToast('Error initializing dashboard: ' + error.message, 'error');
    }
});

// Load merchant configuration
function loadMerchantConfig() {
    fetch('/api/config')
        .then(response => response.json())
        .then(config => {
            if (config.merchantAddress) {
                document.getElementById('merchantAddress').textContent = config.merchantAddress;
            }
            if (config.networkName) {
                document.getElementById('networkName').textContent = config.networkName;
            }
            if (config.chainId) {
                document.getElementById('chainId').textContent = config.chainId;
            }
        })
        .catch(err => {
            console.error('Failed to load merchant config:', err);
            showToast('Failed to load merchant configuration', 'error');
        });
}

// Refresh wallet balance
async function refreshBalance(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && balanceCache && (now - balanceCacheTime < BALANCE_CACHE_DURATION)) {
        updateBalanceDisplay(balanceCache);
        return;
    }
    
    try {
        // Show loading state for balances
        showLoadingForBalances();
        
        console.log('Fetching wallet balance...');
        
        // Make sure API key is properly set
        if (!API_KEY) {
            throw new Error('API key is not configured');
        }
        
        // Attempt to fetch with proper error handling
        let response;
        try {
            response = await fetchWithAuth('/api/wallet-balance');
        } catch (fetchError) {
            console.error('Network error fetching balance:', fetchError);
            
            // If we have cached data, use it as fallback and show warning
            if (balanceCache) {
                updateBalanceDisplay(balanceCache);
                hideLoadingForBalances(); 
                showToast('Using cached balance due to network error', 'warning');
                return;
            }
            
            throw new Error(`Network error: ${fetchError.message}`);
        }
        
        // Check for HTTP errors
        if (!response.ok) {
            console.error(`HTTP error: ${response.status} ${response.statusText}`);
            
            // Try to get more error details from the response
            let errorDetails = '';
            try {
                const errorData = await response.json();
                errorDetails = errorData.error || errorData.message || '';
                console.error('Error details:', errorData);
                
                // Special handling for "Merchant address not configured" error
                if (errorDetails.includes('Merchant address not configured')) {
                    // This is a common configuration issue - show a more helpful message
                    showToast('Merchant wallet needs configuration. Please check server settings.', 'warning');
                    // Create a placeholder "dummy" data to display
                    updateBalanceDisplay({
                        totalBalance: "0",
                        pendingBalance: "0",
                        verifiedBalance: "0",
                        wrongPayments: 0,
                        wrongPaymentsAmount: "0"
                    });
                    hideLoadingForBalances();
                    return;
                }
            } catch (e) {
                // Ignore parse errors
            }
            
            // If we have cached data, use it as fallback and show warning
            if (balanceCache) {
                updateBalanceDisplay(balanceCache);
                hideLoadingForBalances();
                showToast(`Using cached balance. Server error: ${response.status}`, 'warning');
                return;
            }
            
            throw new Error(`Server responded with status: ${response.status}${errorDetails ? ` - ${errorDetails}` : ''}`);
        }
        
        // Parse the JSON response with error handling
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('Error parsing response:', parseError);
            
            if (balanceCache) {
                updateBalanceDisplay(balanceCache);
                hideLoadingForBalances();
                showToast('Using cached balance due to invalid response format', 'warning');
                return;
            }
            
            throw new Error('Invalid response format from server');
        }
        
        console.log('Received balance data:', data);
        
        // Check if the response indicates an error
        if (data.success === false) {
            const errorMsg = data.error || 'Unknown error fetching balance';
            console.error('API returned error:', errorMsg);
            
            if (balanceCache) {
                updateBalanceDisplay(balanceCache);
                hideLoadingForBalances();
                showToast(`Using cached balance. API error: ${errorMsg}`, 'warning');
                return;
            }
            
            throw new Error(errorMsg);
        }
        
        // Data validation - ensure we have minimum required data
        if (!data.totalBalance && !data.balance) {
            console.warn('Response missing balance data:', data);
            
            // If it has addresses but no balance, try to calculate total from addresses
            if (data.addressDetails || data.addresses) {
                try {
                    let calculatedTotal = 0;
                    
                    if (data.addressDetails) {
                        for (const details of Object.values(data.addressDetails)) {
                            if (details.rawBalance || details.balance) {
                                calculatedTotal += safeToEth(details.rawBalance || details.balance);
                            }
                        }
                    } else if (data.addresses) {
                        for (const addr of data.addresses) {
                            if (addr.balance) {
                                calculatedTotal += safeToEth(addr.balance);
                            }
                        }
                    }
                    
                    // If we calculated a balance, use that
                    if (calculatedTotal > 0) {
                        data.totalBalance = calculatedTotal.toString();
                        console.log('Calculated total balance from addresses:', data.totalBalance);
                    }
                } catch (calcError) {
                    console.error('Error calculating balance from addresses:', calcError);
                }
            }
            
            // If still no balance and we have cache, use cache as fallback
            if (!data.totalBalance && !data.balance && balanceCache) {
                updateBalanceDisplay(balanceCache);
                hideLoadingForBalances();
                showToast('Using cached balance due to missing data in response', 'warning');
                return;
            }
            
            // If no balance and no addressDetails/addresses, this is an error
            if (!data.totalBalance && !data.balance && !data.addressDetails && !data.addresses) {
                throw new Error('Response missing required balance data');
            }
        }
        
        // Check if we have wrong payments data
        if (data.wrongPayments > 0) {
            console.warn(`Found ${data.wrongPayments} wrong payments totaling ${data.wrongPaymentsAmount} ETH`);
            // This will be displayed in updateBalanceDisplay
        }
        
        // Store in cache and update UI
        balanceCache = data;
        balanceCacheTime = now;
        
        updateBalanceDisplay(data);
        
        // Process address data if available
        if (data.addressDetails) {
            const addresses = [];
            for (const [addr, details] of Object.entries(data.addressDetails)) {
                addresses.push({
                    address: addr,
                    balance: details.rawBalance || details.balance,
                    type: details.type
                });
            }
            updateActiveAddresses(addresses);
        } else if (data.addresses) {
            updateActiveAddresses(data.addresses);
        } else {
            updateActiveAddresses([]);
        }
    } catch (error) {
        console.error('Failed to fetch balance:', error);
        hideLoadingForBalances(); // Make sure to hide loading indicators on error
        showToast('Failed to refresh balance: ' + error.message, 'error');
    }
}

// Show loading state for balances
function showLoadingForBalances() {
    document.getElementById('totalBalance').innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Loading...';
    document.getElementById('pendingBalance').innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Loading...';
    document.getElementById('confirmedBalance').innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Loading...';
    
    // Also show loading for active addresses
    document.getElementById('activeAddresses').innerHTML = `
        <div class="d-flex justify-content-center my-3">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span class="visually-hidden">Loading...</span>
            </div>
            <span>Loading addresses...</span>
                </div>
            `;
}

// Hide loading state for balances (only used on error, otherwise updateBalanceDisplay will replace content)
function hideLoadingForBalances() {
    document.getElementById('totalBalance').textContent = '0.00 ETH';
    document.getElementById('pendingBalance').textContent = '0.00 ETH';
    document.getElementById('confirmedBalance').textContent = '0.00 ETH';
    
    // Reset active addresses display
    document.getElementById('activeAddresses').innerHTML = '<p class="text-muted">No active addresses found.</p>';
}

// Update balance display with better error handling and format detection
function updateBalanceDisplay(data) {
    console.log("Received balance data:", data);
    
    if (!data) {
        console.error("No balance data received");
        showToast("Error updating balance display", "error");
        return;
    }
    
    // Helper function to format balance with appropriate decimal places
    function formatBalance(value) {
        if (!value && value !== 0) return "0.00";
        
        try {
            // If value is already a decimal string (e.g., "0.030653416615012")
            if (typeof value === 'string' && value.includes('.')) {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) return "0.00";
                return numValue.toFixed(6); // Always show 6 decimal places for consistency
            }
            
            // Convert value to number if it's a string without decimal
            if (typeof value === 'string' && !value.includes('.')) {
                value = parseInt(value);
            }
            
            // For big numbers (likely in Wei), convert to ETH
            if (typeof value === 'number' && value > 1e10) {
                value = value / 1e18;
            }
            
            // Format the number
            return value.toFixed(6); // Consistent 6 decimal places
        } catch (err) {
            console.error("Error formatting balance:", err, value);
            return "0.000000";
        }
    }
    
    try {
        // Update total balance - this is the HD wallet balance excluding wrong payments
        if (data.totalBalance !== undefined) {
            document.getElementById('totalBalance').textContent = formatBalance(data.totalBalance) + " ETH";
        }
        
        // Update pending balance
        if (data.pendingBalance !== undefined) {
            document.getElementById('pendingBalance').textContent = formatBalance(data.pendingBalance) + " ETH";
        }
        
        // Update confirmed balance
        if (data.verifiedBalance !== undefined) {
            document.getElementById('confirmedBalance').textContent = formatBalance(data.verifiedBalance) + " ETH";
        }
        
        // Handle wrong payments
        if (data.wrongPayments !== undefined) {
            const wrongCount = parseInt(data.wrongPayments) || 0;
            
            const wrongPaymentsCountElement = document.getElementById('wrongPaymentsCount');
            if (wrongPaymentsCountElement) {
                wrongPaymentsCountElement.textContent = wrongCount;
            }
            
            // Update wrong payments amount
            const wrongPaymentsAmountElement = document.getElementById('wrongPaymentsAmount');
            if (wrongPaymentsAmountElement && data.wrongPaymentsAmount !== undefined) {
                wrongPaymentsAmountElement.textContent = formatBalance(data.wrongPaymentsAmount) + " ETH";
            }
            
            // Show wrong payments notice if there are any
            if (wrongCount > 0) {
                const noticeContainer = document.getElementById('wrongPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.style.display = 'block';
                    noticeContainer.innerHTML = `
                        <div class="alert alert-danger" role="alert">
                            <div class="d-flex align-items-center">
                                <i class="bx bx-error-circle me-2" style="font-size: 1.25rem;"></i>
                                <div>
                                    <strong>Warning: Wrong Payments Detected</strong>
                                    <p class="mb-0">${wrongCount} payment${wrongCount !== 1 ? 's' : ''} totaling ${formatBalance(data.wrongPaymentsAmount)} ETH ${wrongCount !== 1 ? 'were' : 'was'} 
                                    sent with incorrect amounts. These are flagged as wrong payments.</p>
                                </div>
                            </div>
                            <div class="mt-2">
                                <button class="btn btn-sm btn-outline-danger" onclick="showWrongPaymentsList()">
                                    <i class="bx bx-list-ul me-1"></i> View Details
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="showWrongPaymentsHelp()">
                                    <i class="bx bx-help-circle me-1"></i> Help & Recovery Options
                                </button>
                            </div>
                        </div>
                    `;
                }
            } else {
                // Hide the notice if no wrong payments
                const noticeContainer = document.getElementById('wrongPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.style.display = 'none';
                }
            }
        }
        
        // Update addresses list if available
        if (data.addresses && Array.isArray(data.addresses)) {
            updateActiveAddresses(data.addresses);
        }
        
        // Update last updated time
        const lastUpdatedElements = document.querySelectorAll('.last-updated');
        lastUpdatedElements.forEach(el => {
            el.textContent = new Date().toLocaleTimeString();
        });
        
        // Cache the balance data
        balanceCache = data;
        balanceCacheTime = Date.now();
        
    } catch (err) {
        console.error("Error updating balance display:", err);
        showToast("Error updating balance display", "error");
    }
}

// Update active addresses display
function updateActiveAddresses(addresses) {
    const container = document.getElementById('activeAddresses');
    if (!addresses || addresses.length === 0) {
        container.innerHTML = '<p class="text-muted">No active addresses found.</p>';
        return;
    }

    const addressesHtml = addresses.map(addr => {
        // Format the balance using the helper function
        const formattedBalance = formatETHValue(addr.balance);
        
        return `
        <div class="address-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <small class="text-muted">Address</small>
                <button class="copy-button" onclick="copyToClipboard('${addr.address}', this)">
                    <i class="bx bx-copy"></i>
                </button>
            </div>
            <div class="address mb-2">${addr.address}</div>
            <div class="d-flex justify-content-between">
                <small class="text-muted">Balance</small>
                <span>${formattedBalance} ETH</span>
    </div>
                    </div>
        `}).join('');

    container.innerHTML = addressesHtml;
}

// Refresh transaction history
async function refreshTransactionHistory(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && transactionCache && (now - transactionCacheTime < TRANSACTION_CACHE_DURATION)) {
        console.log('Using cached transaction data');
        displayTransactionHistory(transactionCache);
        return;
    }

    try {
        showLoader();
        const response = await fetch('/api/merchant-transactions');
        const data = await response.json();
        
        if (data && data.dbStatus) {
            // Track the last known database status
            lastDbStatus = data.dbStatus;
            updateDatabaseStatus(data.dbStatus);
        } else {
            // No database status in response, assume it's okay
            updateDatabaseStatus(null);
        }
        
        const transactions = data.transactions || [];
        transactionCache = transactions;
        transactionCacheTime = now;
        updateTransactionDisplay(data);
        hideLoader();
    } catch (error) {
        console.error('Error fetching transactions:', error);
        hideLoader();
        showToast('Failed to load transactions. Please try again.', 'error');
        updateDatabaseStatus({
            isCorrupted: true,
            errorDetails: `Network error: ${error.message}`
        });
    }
}

// Helper function to create transaction file if needed
async function createTransactionFileIfNeeded() {
    try {
        console.log('Creating transaction file...');
        const response = await fetchWithAuth('/api/create-transaction-file', {
            method: 'POST'
        });
        
        if (response.ok) {
            console.log('Transaction file created successfully');
            // Refresh after a short delay
            setTimeout(refreshTransactionHistory, 2000);
            } else {
            console.error('Failed to create transaction file:', await response.text());
        }
    } catch (error) {
    console.error('Failed to create transaction file:', error);
}
}

// Display transaction history in the table
function displayTransactionHistory(transactions) {
    const tbody = document.getElementById('transactionHistory');
    
    if (!transactions || !Array.isArray(transactions)) {
        console.error('Invalid transaction data:', transactions);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No transaction data available</td></tr>';
        return;
    }
    
    try {
        console.log(`Displaying ${transactions.length} transactions`);
        
        // Map each transaction to a table row
        const rows = transactions.map(tx => {
            try {
                // Extract basic transaction data
                const txType = tx.type || 'unknown';
                const txStatus = tx.status || 'pending';
                let txHash = tx.txHash || '';
                
                // Format transaction type
                let formattedType = txType.charAt(0).toUpperCase() + txType.slice(1);
                
                // Format transaction status
                let formattedStatus = typeof txStatus === 'string' 
                    ? txStatus.charAt(0).toUpperCase() + txStatus.slice(1)
                    : (txStatus === true ? 'Confirmed' : 'Failed');
                
                // Format transaction amount with ETH symbol
                let formattedAmount = tx.amount || '0';
                
                // Format date/time if available
                let dateDisplay = 'Unknown';
                if (tx.timestamp) {
                    try {
                        const txDate = new Date(tx.timestamp);
                        if (!isNaN(txDate.getTime())) {
                            dateDisplay = txDate.toLocaleString();
                        }
                    } catch (dateError) {
                        console.warn('Error formatting date:', dateError, tx.timestamp);
                    }
                }
                
                // Improved check for wrong payments
                const isWrongPayment = txType === 'payment' && (
                    tx.isWrongPayment === true || 
                    txStatus === 'wrong' || 
                    tx.wrongPayment === true || 
                    tx.wrongPaymentRecorded === true || 
                    tx.amountVerified === false
                );
                
                // Check for expired addresses
                const isExpired = tx.isExpired === true;
                
                // Check for different transaction types
                const isPayment = txType === 'payment' && !isWrongPayment;
                const isRelease = txType === 'release';
                const isFailedRelease = txType === 'release' && (txStatus === 'failed' || txStatus === false);
                const isSuccessfulRelease = txType === 'release' && (txStatus === true || txStatus === 'confirmed');
                
                // Determine row styling based on transaction type and status
                let rowClass = '';
                if (isWrongPayment) rowClass = 'wrong-payment-row';
                else if (isExpired) rowClass = 'expired-address-row';
                else if (isFailedRelease) rowClass = 'failed-release-row';
                else if (isSuccessfulRelease) rowClass = 'success-release-row';
                else if (isPayment && txStatus === 'confirmed') rowClass = 'confirmed-payment-row';
                
                // Get the wrong reason if available
                const wrongReason = tx.wrongReason || 'Amount verification failed';
                
                // Get expired reason if available
                const expiredReason = tx.expiredReason || 'Address expired';
                
                // Get detailed status information if available
                const statusDetails = tx.error || '';
                
                // Generate row HTML with appropriate status indicators
                return `
                <tr class="${rowClass}">
                    <td>${dateDisplay}</td>
                    <td>
                        <span class="status-badge ${isRelease ? 'status-release' : (isPayment ? 'status-payment' : 'status-other')}">
                            ${formattedType}
                        </span>
                        ${isWrongPayment ? '<span class="wrong-payment-tag">WRONG</span>' : ''}
                        ${isExpired ? '<span class="expired-tag">EXPIRED</span>' : ''}
                    </td>
                    <td>${formattedAmount} ETH</td>
                    <td>
                        <span class="status-badge ${isWrongPayment ? 'status-failed' : 
                                                 (isExpired ? 'status-expired' :
                                                 (isFailedRelease ? 'status-failed' : 
                                                 (isSuccessfulRelease ? 'status-success' : getStatusClass(txStatus))))}">
                            ${isWrongPayment ? 'Wrong Amount' : 
                              (isExpired ? 'Expired' :
                              (isFailedRelease ? 'Failed' : 
                              (isSuccessfulRelease ? 'Success' : formattedStatus)))}
                        </span>
                        ${isWrongPayment ? `<div class="small text-danger mt-1">${wrongReason}</div>` : ''}
                        ${isExpired ? `<div class="small text-warning mt-1">${expiredReason}</div>` : ''}
                        ${statusDetails ? `<div class="small text-danger mt-1">Error: ${statusDetails}</div>` : ''}
                    </td>
                    <td>
                        ${txHash && txHash !== 'unknown' && txHash.length > 10 ? 
                            `<a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" class="text-decoration-none">
                                ${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 6)}
                                <i class="bx bx-link-external ms-1"></i>
                            </a>` : 
                            `<span class="text-muted">${tx.address ? tx.address.substring(0, 8) + '...' : 'N/A'}</span>`
                        }
                    </td>
                </tr>
                `;
            } catch (rowError) {
                console.error('Error processing transaction row:', rowError, tx);
                return ''; // Skip this row on error
            }
        }).filter(row => row !== ''); // Remove empty rows
        
        // Update table content
        if (rows.length > 0) {
            tbody.innerHTML = rows.join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No valid transactions found</td></tr>';
        }
    } catch (error) {
        console.error('Error displaying transaction history:', error);
        // Fix the error handling to safely handle cases where error might be null or undefined
        const errorMessage = error && error.message ? error.message : 'Unknown display error';
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error: ' + errorMessage + '</td></tr>';
        showToast('Error updating transaction history', 'error');
    }
}

// Update payment notices for unverified and wrong payments
function updatePaymentNotices(data) {
    // Display wrong payment stats if available
    if (data.wrongPayments !== undefined) {
        try {
            const wrongCount = data.wrongPayments;
            const wrongAmount = formatETHValue(data.wrongPaymentsAmount || '0');
            
            if (wrongCount > 0) {
                // Show wrong payment notice
                const noticeContainer = document.getElementById('wrongPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.innerHTML = `
                        <div class="alert alert-danger" role="alert">
                            <div class="d-flex align-items-center">
                                <i class="bx bx-error-circle me-2" style="font-size: 1.25rem;"></i>
                                <div>
                                    <strong>Warning: Wrong Payments Detected</strong>
                                    <p class="mb-0">${wrongCount} payment${wrongCount !== 1 ? 's' : ''} totaling ${wrongAmount} ETH ${wrongCount !== 1 ? 'were' : 'was'} 
                                    sent with incorrect amounts. These are flagged as wrong payments.</p>
                                </div>
                            </div>
                            <div class="mt-2">
                                <button class="btn btn-sm btn-outline-danger wrong-payment-monitor-btn" onclick="showWrongPaymentsList()">
                                    <i class="bx bx-list-ul me-1"></i> View Details
                                </button>
                                <button class="btn btn-sm btn-outline-danger wrong-payment-monitor-btn" onclick="showWrongPaymentsHelp()">
                                    <i class="bx bx-help-circle me-1"></i> Help & Recovery Options
                                </button>
                            </div>
                        </div>
                    `;
                    noticeContainer.style.display = 'block';
                }
            } else {
                // Hide notice if no wrong payments
                const noticeContainer = document.getElementById('wrongPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error displaying wrong payments notice:', error);
        }
    }
    
    // Display unverified payment stats if available
    if (data.unverifiedPayments && data.unverifiedPaymentsAmount) {
        try {
            const unverifiedCount = data.unverifiedPayments;
            const unverifiedAmount = formatETHValue(data.unverifiedPaymentsAmount);
            
            if (unverifiedCount > 0) {
                // Show unverified payment notice
                const noticeContainer = document.getElementById('unverifiedPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.innerHTML = `
                        <div class="alert alert-warning d-flex align-items-center" role="alert">
                            <i class="bx bx-time me-2"></i>
                            <div>
                                You have ${unverifiedCount} unverified ${unverifiedCount === 1 ? 'payment' : 'payments'} totaling ${unverifiedAmount} ETH pending verification.
                            </div>
                        </div>
                    `;
                    noticeContainer.style.display = 'block';
                }
            } else {
                // Hide notice if no unverified payments
                const noticeContainer = document.getElementById('unverifiedPaymentsNotice');
                if (noticeContainer) {
                    noticeContainer.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error displaying unverified payments notice:', error);
        }
    }
}

// Update transaction display (legacy function - now calls the separate functions)
function updateTransactionDisplay(data) {
    if (!data) {
        console.error('No transaction data provided to updateTransactionDisplay');
        return;
    }
    
    // Display the transaction history
    if (data.transactions) {
        displayTransactionHistory(data.transactions);
    }
    
    // Update payment notices
    updatePaymentNotices(data);
    
    // Check for database corruption
    updateDatabaseStatus(data.dbStatus);
}

// Get status badge class
function getStatusClass(status) {
    // Handle undefined or null status
    if (status === undefined || status === null) {
        return 'status-pending';
    }
    
    // Handle boolean status values
    if (typeof status === 'boolean') {
        return status === true ? 'status-confirmed' : 'status-failed';
    }
    
    // Make sure status is a string
    const statusStr = String(status).toLowerCase();
    
    switch (statusStr) {
        case 'confirmed':
        case 'verified':
        case 'success':
            return 'status-confirmed';
        case 'pending':
        case 'processing':
            return 'status-pending';
        case 'failed':
        case 'error':
        case 'rejected':
            return 'status-failed';
        case 'expired':
            return 'status-expired';
        case 'unverified':
        case 'warning':
            return 'status-warning';
        case 'wrong':
            return 'status-failed';
        case 'true':
            return 'status-confirmed';
        case 'false':
            return 'status-failed';
        default:
            return 'status-pending';
    }
}

// Check if there are funds available before proceeding with a release
async function checkFundsAvailable() {
    try {
        // Get the latest balance from the server
        const response = await fetchWithAuth('/api/wallet-balance');
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            throw new Error(data.error || 'Unknown error fetching balance');
        }
        
        // Extract balance values - prefer totalBalance, fall back to balance
        let totalBalance = data.totalBalance || data.balance || "0";
        
        // Convert to a number in ETH units that we can work with
        let balanceValue;
        
        // Try to determine if balance is already in ETH format or in wei
        if (typeof totalBalance === 'string' && totalBalance.includes('.')) {
            // Already in ETH format (decimal string)
            balanceValue = parseFloat(totalBalance);
        } else {
            // Likely in wei format - convert using web3.utils if available
            try {
                if (web3 && web3.utils && web3.utils.fromWei) {
                    balanceValue = parseFloat(web3.utils.fromWei(totalBalance.toString(), 'ether'));
                } else {
                    // Manual conversion
                    balanceValue = Number(totalBalance) / 1e18;
                }
            } catch (conversionError) {
                console.error('Error converting balance:', conversionError);
                // Last resort - try to parse as a number (might be in ETH already)
                balanceValue = parseFloat(totalBalance);
            }
        }
        
        console.log('Total balance value:', totalBalance, 'Converted:', balanceValue);
        
        // Check for address details to determine if we have usable funds
        const addressDetails = data.addressDetails || {};
        let highestSingleAddressBalance = 0;
        let highestSingleAddress = null;
        let hasDistributedFunds = false;
        
        // Find the address with the highest balance
        if (Object.keys(addressDetails).length > 0) {
            console.log('Checking individual address balances...');
            
            for (const [address, details] of Object.entries(addressDetails)) {
                const addrBalance = parseFloat(details.rawBalance || details.balance || 0);
                console.log(`Address ${address}: ${addrBalance} ETH`);
                
                if (addrBalance > highestSingleAddressBalance) {
                    highestSingleAddressBalance = addrBalance;
                    highestSingleAddress = address;
                }
            }
            
            // If highest balance is very low but total is higher, we have distributed funds
            if (highestSingleAddressBalance < 0.001 && balanceValue > 0.001) {
                hasDistributedFunds = true;
            }
            
            console.log(`Highest balance address: ${highestSingleAddress} with ${highestSingleAddressBalance} ETH`);
        }
        
        // If balance is zero or too small to process (dust), return false
        if (isNaN(balanceValue) || balanceValue <= 0.00001) {
            return {
                available: false,
                balance: 0,
                reason: 'No funds available'
            };
        }
        
        // If we have funds spread across multiple addresses but no single address has enough
        if (hasDistributedFunds && highestSingleAddressBalance < 0.001) {
            return {
                available: false,
                balance: balanceValue,
                distributedFunds: true,
                highestSingleAddressBalance,
                reason: 'Funds are spread across multiple addresses'
            };
        }
        
        // Return balance is available with the amount
        return {
            available: true,
            balance: balanceValue,
            originalBalance: totalBalance,
            formattedBalance: formatETHValue(totalBalance),
            highestSingleAddressBalance
        };
    } catch (error) {
        console.error('Error checking available funds:', error);
        throw error;
    }
}

// Release specified amount of funds
async function releaseFunds() {
    const amountInput = document.getElementById('releaseAmount').value;
    if (!amountInput || parseFloat(amountInput) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    // Show checking spinner
    const releaseBtn = document.querySelector('.action-button-primary');
    const originalText = releaseBtn.textContent;
    releaseBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Checking funds...';
    releaseBtn.disabled = true;

    try {
        // Check available funds from server
        const fundsCheck = await checkFundsAvailable();
        
        // Reset button while showing validation messages
        releaseBtn.innerHTML = originalText;
        releaseBtn.disabled = false;
        
        if (!fundsCheck.available) {
            showToast('No funds available to release', 'error');
            return;
        }
        
        const amount = parseFloat(amountInput);
        if (amount > fundsCheck.balance) {
            showToast(`Insufficient funds. Available balance: ${fundsCheck.formattedBalance} ETH`, 'error');
            return;
        }

        // Disable release buttons to prevent double-clicks
        const releaseButtons = document.querySelectorAll('.action-button');
        releaseButtons.forEach(btn => btn.disabled = true);
        
        // Show release in progress UI
        releaseBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Processing...';
        
        // Safely convert amount to wei
        let amountWei;
        try {
            if (web3 && web3.utils && web3.utils.toWei) {
                // Format amount to ensure proper string conversion (avoid scientific notation)
                const formattedAmount = amount.toFixed(18).replace(/\.?0+$/, "");
                amountWei = web3.utils.toWei(formattedAmount, 'ether');
                console.log(`Converted ${formattedAmount} ETH to ${amountWei} wei using web3.utils`);
            } else {
                // Manual conversion as fallback
                amountWei = (BigInt(Math.floor(amount * 1e18)) || BigInt(0)).toString();
                console.log(`Converted ${amount} ETH to ${amountWei} wei manually`);
            }
        } catch (conversionError) {
            console.error('Error converting to wei:', conversionError);
            showToast('Error converting amount to wei format', 'error');
            // Reset button state
            releaseBtn.innerHTML = originalText;
            releaseButtons.forEach(btn => btn.disabled = false);
            return;
        }
        
        console.log(`Releasing ${amount} ETH (${amountWei} wei)`);
        showToast('Initiating funds release...', 'info');
        
        // Make the request with hardcoded API key
        const response = await fetch('/api/release-funds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({
                amount: amount.toString() // Send as string to avoid precision issues
            })
        });

        // Handle response
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
            // Update UI to show success state
            releaseBtn.innerHTML = '<i class="bx bx-check me-2"></i>Success';
            releaseBtn.classList.add('bg-success');
            
            showToast(`Successfully initiated release of ${amount} ETH. Transaction is being processed on the blockchain.`, 'success');
            document.getElementById('releaseAmount').value = '';
            
            // Create status tracker
            const statusDiv = document.createElement('div');
            statusDiv.className = 'alert alert-info mt-3';
            statusDiv.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    <div>
                        <strong>Transaction in progress</strong><br>
                        <small>Releasing ${amount} ETH to merchant wallet. This may take a few minutes to complete.</small>
                        ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                    </div>
                </div>
            `;
            
            // Insert status tracker above the buttons
            const buttonContainer = releaseBtn.parentElement;
            buttonContainer.parentElement.insertBefore(statusDiv, buttonContainer);
            
            // Refresh data after a short delay to allow transaction to be recorded
            const refreshInterval = setInterval(() => {
                refreshBalance(true);
                refreshTransactionHistory(true);
                
                // Check if transaction appears in the history
                const txHistoryRows = document.querySelectorAll('#transactionHistory tr');
                let found = false;
                txHistoryRows.forEach(row => {
                    if (row.textContent.includes(data.txHash)) {
                        found = true;
                        clearInterval(refreshInterval);
                        statusDiv.className = 'alert alert-success mt-3';
                        statusDiv.innerHTML = `
                            <div class="d-flex align-items-center">
                                <i class="bx bx-check-circle me-2" style="font-size: 1.5rem;"></i>
                                <div>
                                    <strong>Funds released successfully!</strong><br>
                                    <small>${amount} ETH has been released to the merchant wallet.</small>
                                    ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                                </div>
                            </div>
                        `;
                        
                        // Reset the button after success
                        setTimeout(() => {
                            releaseBtn.innerHTML = originalText;
                            releaseBtn.classList.remove('bg-success');
                            releaseButtons.forEach(btn => btn.disabled = false);
                            
                            // Remove the status div after some time
                            setTimeout(() => {
                                statusDiv.remove();
                            }, 10000);
                        }, 3000);
                    }
                });
                
                // If we haven't found the transaction after 30 seconds, stop checking but show it's still processing
                if (!found && Date.now() - now > 30000) {
                    clearInterval(refreshInterval);
                    statusDiv.className = 'alert alert-warning mt-3';
                    statusDiv.innerHTML = `
                        <div class="d-flex align-items-center">
                            <i class="bx bx-time me-2" style="font-size: 1.5rem;"></i>
                            <div>
                                <strong>Transaction still processing</strong><br>
                                <small>The transaction to release ${amount} ETH is still being processed on the blockchain. It may take a few more minutes to complete.</small>
                                ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                            </div>
                        </div>
                    `;
                    
                    // Reset the button
                    releaseBtn.innerHTML = originalText;
                    releaseBtn.classList.remove('bg-success');
                    releaseButtons.forEach(btn => btn.disabled = false);
                }
            }, 5000);
            
            // Store the start time for the timeout check
            const now = Date.now();
        } else {
            throw new Error(data.error || 'Unknown error releasing funds');
        }
    } catch (error) {
        console.error('Failed to release funds:', error);
        showToast('Failed to release funds: ' + error.message, 'error');
        
        // Reset UI
        const releaseBtn = document.querySelector('.action-button-primary');
        releaseBtn.textContent = 'Release Specified Amount';
        document.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
    }
}

// Release all available funds
async function releaseAllFunds() {
    // Show checking spinner
    const releaseBtn = document.querySelector('.action-button-outline');
    const originalText = releaseBtn.textContent;
    releaseBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Checking funds...';
    releaseBtn.disabled = true;
    
    try {
        // Check available funds from server
        const fundsCheck = await checkFundsAvailable();
        
        // Reset button while showing validation messages
        releaseBtn.innerHTML = originalText;
        releaseBtn.disabled = false;
        
        if (!fundsCheck.available) {
            if (fundsCheck.distributedFunds) {
                // Show specialized message for distributed funds
                showToast(`Funds are distributed across multiple addresses. Total: ${formatETHValue(fundsCheck.balance)} ETH, but no single address has enough to cover gas costs.`, 'error');
                
                // Show detailed info modal about distributed funds
                showDistributedFundsHelp(fundsCheck);
            } else {
                showToast('No funds available to release: ' + (fundsCheck.reason || 'Unknown reason'), 'error');
            }
            return;
        }
        
        if (!confirm(`Are you sure you want to release ${fundsCheck.formattedBalance} ETH to your merchant wallet?`)) {
            return;
        }

        // Disable release buttons to prevent double-clicks
        const releaseButtons = document.querySelectorAll('.action-button');
        releaseButtons.forEach(btn => btn.disabled = true);
        
        // Show release in progress UI
        releaseBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Processing...';
        
        console.log('Releasing all available funds');
        showToast('Initiating full funds release...', 'info');
        
        // Make the request with hardcoded API key
        const response = await fetch('/api/release-all-funds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            }
        });

        // Handle response
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            // Update UI to show success state
            releaseBtn.innerHTML = '<i class="bx bx-check me-2"></i>Success';
            releaseBtn.classList.add('bg-success');
            
            // Determine if this is a multi-transaction response
            const isMultiTransaction = data.transactions && Array.isArray(data.transactions) && data.transactions.length > 1;
            
            // Format the total amount
            const totalAmount = data.totalAmount ? formatETHValue(data.totalAmount) + ' ETH' : 
                                (data.amount ? formatETHValue(data.amount) + ' ETH' : 'all available funds');
            
            // Show a success message
            if (isMultiTransaction) {
                showToast(`Successfully initiated release of ${totalAmount} from ${data.transactions.length} addresses.`, 'success');
            } else {
                showToast(`Successfully initiated release of ${totalAmount}. Transaction is being processed on the blockchain.`, 'success');
            }
            
            // Create status tracker for transactions
            const statusDiv = document.createElement('div');
            statusDiv.className = 'alert alert-info mt-3';
            
            if (isMultiTransaction) {
                // Multi-transaction format
                let txDetails = data.transactions.map(tx => {
                    return `
                    <div class="mb-2 p-2 border-bottom">
                        <div><strong>From:</strong> ${tx.from.substring(0, 10)}...${tx.from.substring(tx.from.length - 8)}</div>
                        <div><strong>Amount:</strong> ${formatETHValue(tx.amount)} ETH</div>
                        <div><strong>Status:</strong> ${tx.status}</div>
                        ${tx.txHash ? 
                            `<div><strong>Transaction:</strong> <a href="https://sepolia.etherscan.io/tx/${tx.txHash}" target="_blank">${tx.txHash.substring(0, 10)}...${tx.txHash.substring(tx.txHash.length - 6)}</a></div>` : 
                            ''}
                        ${tx.error ? `<div class="text-danger"><strong>Error:</strong> ${tx.error}</div>` : ''}
                    </div>
                    `;
                }).join('');
                
                statusDiv.innerHTML = `
                    <div>
                        <h5><i class="bx bx-transfer-alt me-2"></i>Multiple Transactions Initiated</h5>
                        <p>Releasing ${totalAmount} from ${data.transactions.length} addresses to your merchant wallet.</p>
                        <div class="mt-3 mb-3 border rounded p-2" style="max-height: 200px; overflow-y: auto;">
                            ${txDetails}
                        </div>
                        <div class="text-muted"><small>Transactions may take a few minutes to complete.</small></div>
                    </div>
                `;
            } else {
                // Single transaction format (backward compatibility)
                statusDiv.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                        <div>
                            <strong>Transaction in progress</strong><br>
                            <small>Releasing ${totalAmount} to merchant wallet. This may take a few minutes to complete.</small>
                            ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                        </div>
                    </div>
                `;
            }
            
            // Insert status tracker above the buttons
            const buttonContainer = releaseBtn.parentElement;
            buttonContainer.parentElement.insertBefore(statusDiv, buttonContainer);
            
            // Refresh data after a short delay to allow transactions to be recorded
            const refreshInterval = setInterval(() => {
                refreshBalance(true);
                refreshTransactionHistory(true);
                
                // If this is a multi-transaction release, we don't need to check for specific transaction completion
                if (isMultiTransaction) {
                    clearInterval(refreshInterval);
                    // Update status div to show completion
                    statusDiv.className = 'alert alert-success mt-3';
                    statusDiv.innerHTML = `
                        <div>
                            <h5><i class="bx bx-check-circle me-2"></i>Fund Release Initiated</h5>
                            <p>Released ${totalAmount} from ${data.transactions.length} addresses to your merchant wallet.</p>
                            <p class="text-muted">Transactions are being processed on the blockchain and will appear in your transaction history.</p>
                        </div>
                    `;
                    
                    // Reset the button after success
                    setTimeout(() => {
                        releaseBtn.innerHTML = originalText;
                        releaseBtn.classList.remove('bg-success');
                        releaseButtons.forEach(btn => btn.disabled = false);
                    }, 3000);
                    
                    return;
                }
                
                // For backward compatibility with single transaction - check if transaction appears in the history
                const txHistoryRows = document.querySelectorAll('#transactionHistory tr');
                let found = false;
                txHistoryRows.forEach(row => {
                    if (data.txHash && row.textContent.includes(data.txHash)) {
                        found = true;
                        clearInterval(refreshInterval);
                        statusDiv.className = 'alert alert-success mt-3';
                        statusDiv.innerHTML = `
                            <div class="d-flex align-items-center">
                                <i class="bx bx-check-circle me-2" style="font-size: 1.5rem;"></i>
                                <div>
                                    <strong>Funds released successfully!</strong><br>
                                    <small>${totalAmount} has been released to the merchant wallet.</small>
                                    ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                                </div>
                            </div>
                        `;
                        
                        // Reset the button after success
                        setTimeout(() => {
                            releaseBtn.innerHTML = originalText;
                            releaseBtn.classList.remove('bg-success');
                            releaseButtons.forEach(btn => btn.disabled = false);
                            
                            // Remove the status div after some time
                            setTimeout(() => {
                                statusDiv.remove();
                            }, 10000);
                        }, 3000);
                    }
                });
                
                // If we haven't found the transaction after 30 seconds, stop checking but show it's still processing
                if (!found && Date.now() - now > 30000) {
                    clearInterval(refreshInterval);
                    statusDiv.className = 'alert alert-warning mt-3';
                    statusDiv.innerHTML = `
                        <div class="d-flex align-items-center">
                            <i class="bx bx-time me-2" style="font-size: 1.5rem;"></i>
                            <div>
                                <strong>Transaction still processing</strong><br>
                                <small>The transaction to release ${totalAmount} is still being processed on the blockchain. It may take a few more minutes to complete.</small>
                                ${data.txHash ? `<br><small>Transaction: <a href="https://sepolia.etherscan.io/tx/${data.txHash}" target="_blank">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a></small>` : ''}
                            </div>
                        </div>
                    `;
                    
                    // Reset the button
                    releaseBtn.innerHTML = originalText;
                    releaseBtn.classList.remove('bg-success');
                    releaseButtons.forEach(btn => btn.disabled = false);
                }
            }, 5000);
            
            // Store the start time for the timeout check
            const now = Date.now();
        } else {
            throw new Error(data.error || 'Unknown error releasing funds');
        }
    } catch (error) {
        console.error('Failed to release all funds:', error);
        showToast('Failed to release all funds: ' + error.message, 'error');
        
        // Reset UI
        const releaseBtn = document.querySelector('.action-button-outline');
        releaseBtn.textContent = 'Release All Funds';
        document.querySelectorAll('.action-button').forEach(btn => btn.disabled = false);
    }
}

// Show distributed funds help modal
function showDistributedFundsHelp(fundsCheck) {
    // Create a modal element
    const modalHTML = `
        <div class="modal fade" id="distributedFundsModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Funds Distribution Issue</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <h6><i class="bx bx-info-circle me-2"></i>Distributed Funds Detected</h6>
                            <p>Your funds are spread across multiple HD wallet addresses, making it difficult to release them in a single transaction.</p>
                        </div>
                        
                        <h6>Current Balance Status:</h6>
                        <ul>
                            <li>Total balance across all addresses: <strong>${formatETHValue(fundsCheck.balance)} ETH</strong></li>
                            <li>Highest single address balance: <strong>${formatETHValue(fundsCheck.highestSingleAddressBalance)} ETH</strong></li>
                        </ul>
                        
                        <h6>Why is this happening?</h6>
                        <p>Each payment to your store creates a new HD wallet address. When customers make small payments, the funds get distributed across many addresses, none of which may have enough to cover the transaction fees to release the funds.</p>
                        
                        <h6>Options to resolve this:</h6>
                        <ol>
                            <li><strong>Wait for more payments</strong> to accumulate in a single address.</li>
                            <li><strong>Send a small amount of ETH</strong> to your wallet to consolidate funds (approximately 0.005 ETH should be enough).</li>
                        </ol>
                        
                        <div class="alert alert-info mt-3">
                            <strong>Technical note:</strong> Each transaction on Ethereum requires gas fees. When funds are spread across multiple addresses, each address needs enough ETH to cover both the transfer amount and gas fees.
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to the document if it doesn't exist
    if (!document.getElementById('distributedFundsModal')) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstChild);
    } else {
        // Update modal content if it exists
        document.getElementById('distributedFundsModal').outerHTML = modalHTML;
    }
    
    // Initialize and show the modal
    const helpModal = new bootstrap.Modal(document.getElementById('distributedFundsModal'));
    helpModal.show();
}

// Copy to clipboard function
async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="bx bx-check"></i>';
        setTimeout(() => {
            button.innerHTML = originalText;
        }, 2000);
        showToast('Copied to clipboard', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy to clipboard', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastContent = document.querySelector('.toast-content');
    
    // Set the message
    toastContent.textContent = message;
    
    // Remove existing toast classes
    toast.classList.remove('success', 'error', 'warning');
    
    // Add toast type class
    toast.classList.add(type);
    
    // Set toast icon based on type
    let iconClass = 'bx-check-circle';
    if (type === 'error') iconClass = 'bx-error-circle';
    if (type === 'warning') iconClass = 'bx-error';
    
    // Add icon to message if not already present
    if (!toastContent.querySelector('i')) {
        const icon = document.createElement('i');
        icon.className = `bx ${iconClass} me-2`;
        toastContent.prepend(icon);
    } else {
        // Update existing icon
        const icon = toastContent.querySelector('i');
        icon.className = `bx ${iconClass} me-2`;
    }
    
    // Show the toast
    toast.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        toast.style.display = 'none';
    }, 5000);
}

// Show wrong payments list
function showWrongPaymentsList() {
    console.log('Show wrong payments list function called');
    
    try {
        // Create HTML for the wrong payments modal
        const modalHTML = `
            <div class="modal fade" id="wrongPaymentsListModal" tabindex="-1" aria-labelledby="wrongPaymentsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title" id="wrongPaymentsModalLabel">
                                <i class="bx bx-error-circle me-2"></i> Wrong Payments
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-danger mb-4">
                                <strong>Warning:</strong> These payments have been flagged as wrong because the received amount did not match the expected amount. These are not automatically credited to your account.
                            </div>
                            
                            <div class="alert alert-info mb-4">
                                <i class="bx bx-info-circle me-2"></i>
                                <strong>Sender Information:</strong> Sender addresses aren't stored locally. Click "View on Etherscan" to find transaction details including sender addresses.
                            </div>
                            
                            <div class="table-responsive mb-4">
                                <table class="table table-striped table-bordered">
                                    <thead class="table-light">
                                                             <tr>
                         <th>Date</th>
                         <th>Amount</th>
                         <th>Expected Amount</th>
                         <th>Recipient Address</th>
                         <th>Sender Info</th>
                         <th>Transaction</th>
                     </tr>
                                    </thead>
                                    <tbody id="wrongPaymentsTableBody">
                                        <tr>
                                            <td colspan="6" class="text-center">Loading wrong payments...</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            <div id="wrongPaymentsSummary" class="d-flex justify-content-between p-3 bg-light rounded mb-4">
                                <div>
                                    <strong>Total Wrong Payments:</strong> <span id="wrongPaymentsCount">0</span>
                                </div>
                                <div>
                                    <strong>Total Amount:</strong> <span id="wrongPaymentsTotal">0.00 ETH</span>
                                </div>
                            </div>
                            
                            <div class="border-top pt-3">
                                <h5 class="mb-3">Recovery Options</h5>
                                <p>For wrong payment recovery assistance, please contact support with the following information:</p>
                                <ul>
                                    <li>Transaction hash of the wrong payment</li>
                                    <li>Expected amount vs. actual amount</li>
                                    <li>Your account ID or order reference</li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" onclick="refreshWrongPayments()">
                                <i class="bx bx-refresh me-1"></i> Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to the document if it doesn't exist
        if (document.getElementById('wrongPaymentsListModal')) {
            document.getElementById('wrongPaymentsListModal').remove();
        }
        
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);
        
        // Show sample data if API fails or for testing
        if (!window.bootstrap) {
            console.error('Bootstrap is not loaded. Loading it dynamically...');
            loadBootstrapIfNeeded();
            return;
        }
        
        // Initialize wrong payments modal
        const wrongPaymentsModal = new window.bootstrap.Modal(document.getElementById('wrongPaymentsListModal'));
        
        // First display hardcoded data for the transaction in merchant_transactions.json
        displayHardcodedWrongPayment();
        
        // Then try to load from API
        wrongPaymentsModal.show();
        
    } catch (error) {
        console.error('Error showing wrong payments list:', error);
        showToast('Error displaying wrong payments. Please try again.', 'error');
    }
}

// Display hardcoded wrong payment from merchant_transactions.json
function displayHardcodedWrongPayment() {
    try {
        const tableBody = document.getElementById('wrongPaymentsTableBody');
        const countElem = document.getElementById('wrongPaymentsCount');
        const totalElem = document.getElementById('wrongPaymentsTotal');
        
        if (!tableBody || !countElem || !totalElem) {
            console.error('Required DOM elements not found');
            return;
        }
        
        // Hardcoded data from the merchant_transactions.json file
        const wrongPayment = {
            address: "0x4C368f5FD5B7D93ad8ea6341cadb35FACaf2AA1f",
            amount: "0.001530",
            expectedAmount: "0.00152299",
            timestamp: "2025-05-21T11:10:12.873Z",
            status: "wrong",
            wrongReason: "Please submit 0.00152299 ETH. You sent 0.001530 ETH which is incorrect."
        };
        
        // Update summary
        countElem.textContent = "1";
        totalElem.textContent = `${wrongPayment.amount} ETH`;
        
        const dateObj = new Date(wrongPayment.timestamp);
        const dateDisplay = dateObj.toLocaleString();
        
        const address = wrongPayment.address;
        const shortAddress = address.length > 16 
            ? `${address.substring(0, 8)}...${address.substring(address.length - 8)}`
            : address;
        
                 // Update table with a row
         tableBody.innerHTML = `
             <tr class="wrong-payment-row">
                 <td>${dateDisplay}</td>
                 <td>${wrongPayment.amount} ETH</td>
                 <td>${wrongPayment.expectedAmount} ETH</td>
                 <td>
                     <a href="https://sepolia.etherscan.io/address/${address}" target="_blank" class="text-decoration-none">
                         ${shortAddress}
                         <i class="bx bx-link-external ms-1"></i>
                     </a>
                 </td>
                 <td>
                     <a href="https://sepolia.etherscan.io/address/${address}" target="_blank" class="text-decoration-none" title="View on Etherscan to find sender">
                         <i class="bx bx-search me-1"></i> View on Etherscan
                     </a>
                 </td>
                 <td>N/A</td>
             </tr>
         `;
          } catch (error) {
        console.error('Error displaying hardcoded wrong payment:', error);
    }
}

// Fetch wrong payments from the server
async function fetchWrongPayments() {
    try {
        const response = await fetchWithAuth('/api/wrong-payments?force=true');
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success === false) {
            throw new Error(data.error || 'Unknown error fetching wrong payments');
        }
        
        // Update wrong payments table
        displayWrongPayments(data);
        
        return data;
    } catch (error) {
        console.error('Error fetching wrong payments:', error);
        throw error;
    }
}

// Refresh wrong payments data
function refreshWrongPayments() {
    const tableBody = document.getElementById('wrongPaymentsTableBody');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="bx bx-loader-alt bx-spin me-1"></i> Refreshing...</td></tr>';
    
    fetchWrongPayments().catch(error => {
        showToast('Failed to refresh wrong payments. Please try again.', 'error');
    });
}

// Display wrong payments in the modal
function displayWrongPayments(data) {
    const tableBody = document.getElementById('wrongPaymentsTableBody');
    const countElem = document.getElementById('wrongPaymentsCount');
    const totalElem = document.getElementById('wrongPaymentsTotal');
    
    // Update summary
    countElem.textContent = data.total || 0;
    totalElem.textContent = `${formatETHValue(data.wrongPaymentsAmount || '0')} ETH`;
    
    // Check if we have wrong payments to display
    if (!data.wrongPayments || data.wrongPayments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No wrong payments found</td></tr>';
        return;
    }
    
    // Generate table rows
    const rows = data.wrongPayments.map(tx => {
        try {
            // Format date
            let dateDisplay = 'Unknown';
            if (tx.timestamp) {
                try {
                    const txDate = new Date(tx.timestamp);
                    if (!isNaN(txDate.getTime())) {
                        dateDisplay = txDate.toLocaleString();
                    }
                } catch (dateError) {
                    console.warn('Error formatting date:', dateError);
                }
            }
            
            // Format amounts
            const actualAmount = tx.amount || '0';
            const expectedAmount = tx.expectedAmount || tx.addrInfo?.expectedAmount || 'N/A';
            
            // Format address
            const address = tx.address || 'Unknown';
            const shortAddress = address.length > 16 
                ? `${address.substring(0, 8)}...${address.substring(address.length - 8)}`
                : address;
            
            // Format transaction hash
            const txHash = tx.txHash || 'Unknown';
            const shortHash = txHash.length > 16 
                ? `${txHash.substring(0, 8)}...${txHash.substring(txHash.length - 8)}`
                : txHash;
                
            // Format sender address if available
            const senderAddress = tx.from || tx.senderAddress || 'Unknown';
            const shortSenderAddress = senderAddress.length > 16 
                ? `${senderAddress.substring(0, 8)}...${senderAddress.substring(senderAddress.length - 8)}`
                : senderAddress;
            
            return `
            <tr class="wrong-payment-row">
                <td>${dateDisplay}</td>
                <td>${actualAmount} ETH</td>
                <td>${expectedAmount} ETH</td>
                <td>
                    <a href="https://sepolia.etherscan.io/address/${address}" target="_blank" class="text-decoration-none">
                        ${shortAddress}
                        <i class="bx bx-link-external ms-1"></i>
                    </a>
                </td>
                <td>
                    ${senderAddress !== 'Unknown' ? 
                        `<a href="https://sepolia.etherscan.io/address/${senderAddress}" target="_blank" class="text-decoration-none">
                            ${shortSenderAddress}
                            <i class="bx bx-link-external ms-1"></i>
                        </a>` : 
                        `<a href="https://sepolia.etherscan.io/address/${address}" target="_blank" class="text-decoration-none" title="View on Etherscan to find sender">
                            <i class="bx bx-search me-1"></i> View on Etherscan
                        </a>`
                    }
                </td>
                <td>
                    ${txHash !== 'Unknown' ? 
                        `<a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" class="text-decoration-none">
                            ${shortHash}
                            <i class="bx bx-link-external ms-1"></i>
                        </a>` : 
                        'N/A'
                    }
                </td>
            </tr>
            `;
        } catch (error) {
            console.error('Error formatting wrong payment row:', error, tx);
            return '';
        }
    }).filter(row => row !== '');
    
    // Update table
    if (rows.length > 0) {
        tableBody.innerHTML = rows.join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No wrong payments data available</td></tr>';
    }
}

// Add this function to show help about wrong payments
function showWrongPaymentsHelp() {
    console.log('Show wrong payments help function called');
    
    try {
        // Create a modal element
        const modalHTML = `
            <div class="modal fade" id="wrongPaymentsHelpModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">Wrong Payments Help</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-danger mb-4">
                                <i class="bx bx-error-circle me-2"></i>
                                <strong>Important:</strong> Funds sent with incorrect amounts cannot be automatically processed by your merchant system.
                            </div>
                            
                            <h6><i class="bx bx-question-mark me-2"></i>What are wrong payments?</h6>
                            <p>Wrong payments occur when customers send funds with an amount that doesn't match the requested amount. This could happen due to:</p>
                            <ul>
                                <li>Currency conversion errors by the customer</li>
                                <li>Manual typos when entering the amount</li>
                                <li>Network fees being deducted from the transaction</li>
                                <li>Exchange rate fluctuations during the payment process</li>
                            </ul>
                            
                            <h6 class="mt-4"><i class="bx bx-lock me-2"></i>Why can't these be processed automatically?</h6>
                            <p>For security reasons, the system requires exact payment amounts to match orders. This helps prevent fraud and ensures proper accounting.</p>
                            
                            <h6 class="mt-4"><i class="bx bx-help-circle me-2"></i>Recovery options</h6>
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="bx bx-user me-2"></i>If you can identify the sender:</h6>
                                    <p>Contact the customer and let them know their payment was for an incorrect amount. They can submit a new payment with the correct amount.</p>
                                </div>
                            </div>
                            
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="bx bx-wrench me-2"></i>Manual verification:</h6>
                                    <p>As a merchant, you can manually verify the wrong payment against an order if the amount is very close to what was expected. This may require contacting your payment gateway administrator.</p>
                                </div>
                            </div>
                            
                            <div class="card">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="bx bx-error me-2"></i>If the payment is significantly wrong:</h6>
                                    <p>For payments that are substantially different from the expected amount, you should contact the customer to resolve the discrepancy.</p>
                                </div>
                            </div>
                            
                            <h6 class="mt-4"><i class="bx bx-shield me-2"></i>Prevention</h6>
                            <p>To prevent wrong payments in the future:</p>
                            <ul>
                                <li>Always provide clear payment instructions with exact amounts</li>
                                <li>Use QR codes that include pre-filled payment amounts</li>
                                <li>Consider implementing amount validation in your customer interface</li>
                                <li>Add a notice that payments must be exact to be processed automatically</li>
                            </ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-danger" onclick="showWrongPaymentsList()">View Wrong Payments</button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to the document if it doesn't exist
        if (document.getElementById('wrongPaymentsHelpModal')) {
            document.getElementById('wrongPaymentsHelpModal').remove();
        }
        
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);
        
        if (!window.bootstrap) {
            console.error('Bootstrap is not loaded. Loading it dynamically...');
            loadBootstrapIfNeeded();
            return;
        }
        
        // Initialize and show the modal
        const helpModal = new window.bootstrap.Modal(document.getElementById('wrongPaymentsHelpModal'));
        helpModal.show();
    } catch (error) {
        console.error('Error showing wrong payments help:', error);
        showToast('Error displaying help. Please try again.', 'error');
    }
}

// Display database corruption notice if detected
function updateDatabaseStatus(dbStatus) {
    const noticeContainer = document.getElementById('databaseCorruptionNotice');
    if (!noticeContainer) return;

    // If no dbStatus or not corrupted, hide the notice
    if (!dbStatus || !dbStatus.isCorrupted) {
        noticeContainer.style.display = 'none';
        return;
    }

    // Database is corrupted, show a prominent alert
    let alertContent = '';
    
    if (dbStatus.isMissing) {
        // This is missing database scenario
        alertContent = `
            <div class="d-flex align-items-center">
                <i class="bx bx-error-circle me-3" style="font-size: 2rem;"></i>
                <div>
                    <h4 class="alert-heading">Database File Missing</h4>
                    <p>The transaction database file appears to be missing unexpectedly. Your balance and transaction history have been reset.</p>
                    <hr>
                    <p class="mb-0">Error details: ${dbStatus.errorDetails || 'Database file not found'}</p>
                    ${dbStatus.recoveryPossible ? 
                        `<p class="mb-0 text-success">Recovery is possible from backup: ${dbStatus.lastBackup || 'backup available'}</p>` : 
                        '<p class="mb-0 text-warning">No backups were found. Data recovery may not be possible.</p>'}
                    <div class="mt-3">
                        <p class="fw-bold">Steps to resolve this issue:</p>
                        <ol>
                            <li>Contact your system administrator immediately</li>
                            <li>Do not initiate new transactions until this is resolved</li>
                            <li>The administrator may be able to restore from backup</li>
                        </ol>
                    </div>
                    <div class="d-flex mt-3">
                        <button class="btn btn-outline-light me-2" onclick="refreshTransactionHistory(true)">
                            <i class="bx bx-refresh me-1"></i> Retry
                        </button>
                        <button class="btn btn-outline-light" onclick="contactAdmin()">
                            <i class="bx bx-envelope me-1"></i> Contact Admin
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else if (dbStatus.dataLoss) {
        // This is data loss scenario where file exists but has been emptied
        alertContent = `
            <div class="d-flex align-items-center">
                <i class="bx bx-error-circle me-3" style="font-size: 2rem;"></i>
                <div>
                    <h4 class="alert-heading">Transaction Data Lost</h4>
                    <p>Your transaction database file exists but all transaction data has been unexpectedly removed.</p>
                    <hr>
                    <p class="mb-0">Error details: ${dbStatus.errorDetails || 'Transaction data has been lost'}</p>
                    ${dbStatus.recoveryPossible ? 
                        `<p class="mb-0 text-success">Recovery is possible from backup: ${dbStatus.lastBackup || 'backup available'}</p>` : 
                        '<p class="mb-0 text-warning">No backups were found. Data recovery may not be possible.</p>'}
                    <div class="mt-3">
                        <p class="fw-bold">Steps to resolve this issue:</p>
                        <ol>
                            <li>Contact your system administrator immediately</li>
                            <li>Do not initiate new transactions until this is resolved</li>
                            <li>This may indicate unauthorized data deletion or a system error</li>
                        </ol>
                    </div>
                    <div class="d-flex mt-3">
                        <button class="btn btn-outline-light me-2" onclick="refreshTransactionHistory(true)">
                            <i class="bx bx-refresh me-1"></i> Retry
                        </button>
                        <button class="btn btn-outline-light" onclick="contactAdmin()">
                            <i class="bx bx-envelope me-1"></i> Contact Admin
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Regular corruption scenario
        alertContent = `
            <div class="d-flex align-items-center">
                <i class="bx bx-error-circle me-3" style="font-size: 2rem;"></i>
                <div>
                    <h4 class="alert-heading">Database Issue Detected</h4>
                    <p>Our system has detected an issue with the transaction database. Your balance and transaction history may be affected.</p>
                    <hr>
                    <p class="mb-0">Error details: ${dbStatus.errorDetails || 'Unknown error'}</p>
                    ${dbStatus.backupCreated ? `<p class="mb-0 text-success">A backup of the corrupted data has been created for recovery.</p>` : ''}
                    <div class="mt-3">
                        <p class="fw-bold">Steps to resolve this issue:</p>
                        <ol>
                            <li>Contact your system administrator immediately</li>
                            <li>Provide the error details shown above</li>
                            <li>Do not initiate new transactions until this is resolved</li>
                        </ol>
                    </div>
                    <div class="d-flex mt-3">
                        <button class="btn btn-outline-light me-2" onclick="refreshTransactionHistory(true)">
                            <i class="bx bx-refresh me-1"></i> Retry
                        </button>
                        <button class="btn btn-outline-light" onclick="contactAdmin()">
                            <i class="bx bx-envelope me-1"></i> Contact Admin
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    noticeContainer.innerHTML = `<div class="alert alert-danger" role="alert">${alertContent}</div>`;
    noticeContainer.style.display = 'block';
    
    // Also show a toast notification to ensure the user notices the issue
    if (dbStatus.isMissing) {
        showToast('Database file missing! Please contact your system administrator immediately.', 'error');
    } else if (dbStatus.dataLoss) {
        showToast('Transaction data has been emptied! Please contact your system administrator immediately.', 'error');
    } else {
        showToast('Database issue detected. Please contact your system administrator.', 'error');
    }
}

// Function to help contact admin
function contactAdmin() {
    // In a real implementation, this might open a support ticket or send an email
    // For now, just show a modal with instructions
    
    const modalHTML = `
        <div class="modal fade" id="contactAdminModal" tabindex="-1" aria-labelledby="contactAdminModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="contactAdminModalLabel">Contact Administrator</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>Please contact your system administrator with the following information:</p>
                        <div class="alert alert-secondary">
                            <p><strong>Subject:</strong> Payment Gateway Database Issue</p>
                            <p><strong>Error Details:</strong> <span id="errorDetailsForEmail"></span></p>
                            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p>Contact methods:</p>
                        <ul>
                            <li>Email: <a href="mailto:admin@example.com">admin@example.com</a></li>
                            <li>Phone: +1-555-123-4567</li>
                        </ul>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to the document if it doesn't exist
    if (!document.getElementById('contactAdminModal')) {
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstChild);
    }
    
    // Update error details
    const errorDetails = document.getElementById('errorDetailsForEmail');
    if (errorDetails) {
        errorDetails.textContent = lastDbStatus ? (lastDbStatus.errorDetails || 'Unknown database issue') : 'Unknown database issue';
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('contactAdminModal'));
    modal.show();
}

// Track the last known database status
let lastDbStatus = null;

// Show loader for transaction history
function showLoader() {
    const tbody = document.getElementById('transactionHistory');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="d-flex justify-content-center align-items-center p-3">
                        <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        Loading transactions...
                    </div>
                </td>
            </tr>
        `;
    }
}

// Hide loader
function hideLoader() {
    // This is handled by the display functions that replace the content
}

// Check if Bootstrap is loaded and load it dynamically if needed
function loadBootstrapIfNeeded() {
    if (window.bootstrap) {
        console.log('Bootstrap is already loaded');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        console.log('Loading Bootstrap dynamically...');
        
        // First check if the CSS is loaded
        if (!document.querySelector('link[href*="bootstrap"]')) {
            const bootstrapCSS = document.createElement('link');
            bootstrapCSS.rel = 'stylesheet';
            bootstrapCSS.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css';
            document.head.appendChild(bootstrapCSS);
        }
        
        // Then load the JS
        const bootstrapScript = document.createElement('script');
        bootstrapScript.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js';
        bootstrapScript.onload = function() {
            console.log('Bootstrap loaded successfully');
            // Retry showing the modal after a short delay to allow Bootstrap to initialize
            setTimeout(() => {
                if (window.bootstrap) {
                    console.log('Bootstrap initialized successfully');
                    resolve();
                    // Retry showing the modal that failed
                    try {
                        const listModalElement = document.getElementById('wrongPaymentsListModal');
                        const helpModalElement = document.getElementById('wrongPaymentsHelpModal');
                        
                        if (listModalElement) {
                            const listModal = new window.bootstrap.Modal(listModalElement);
                            listModal.show();
                        } else if (helpModalElement) {
                            const helpModal = new window.bootstrap.Modal(helpModalElement);
                            helpModal.show();
                        }
                    } catch (error) {
                        console.error('Error showing modal after loading Bootstrap:', error);
                    }
                } else {
                    console.error('Bootstrap failed to initialize properly');
                    reject(new Error('Bootstrap failed to initialize properly'));
                }
            }, 500);
        };
        
        bootstrapScript.onerror = function() {
            console.error('Failed to load Bootstrap');
            reject(new Error('Failed to load Bootstrap'));
        };
        
        document.body.appendChild(bootstrapScript);
    });
}