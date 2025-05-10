const fs = require('fs');
const path = require('path');
const { db } = require('./index');
const chokidar = require('chokidar'); // For file watching

// File paths
const KEYS_FILE = path.join(__dirname, '../Json/keys.json');
const MERCHANT_TRANSACTIONS_FILE = path.join(__dirname, '../merchant_transactions.json');
const STRIPE_PAYMENTS_FILE = path.join(__dirname, '../stripe_payments.json');

/**
 * Sync from JSON to SQLite
 * Reads the JSON files and updates the SQLite database
 */
async function syncJsonToDb() {
  try {
    console.log('Starting sync from JSON to SQLite...');
    
    // Sync transactions from keys.json (activeAddresses)
    if (fs.existsSync(KEYS_FILE)) {
      const keysData = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
      if (keysData.activeAddresses) {
        db.serialize(() => {
          // Clear existing data first to avoid duplicates
          db.run('DELETE FROM transactions');
          
          const stmt = db.prepare(`INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          Object.entries(keysData.activeAddresses).forEach(([address, data]) => {
            stmt.run(
              address,
              data.index,
              data.ethAmount,
              data.expectedAmount,
              data.cryptoType,
              data.createdAt,
              data.expiresAt,
              data.status,
              data.orderId,
              data.fiatAmount,
              data.fiatCurrency,
              data.amount,
              data.timestamp,
              data.amountVerified ? 1 : 0
            );
          });
          
          stmt.finalize();
        });
        console.log('Synced transactions from keys.json');
      }
    } else {
      console.log('Keys file not found, skipping transaction sync');
    }

    // Sync merchant transactions
    if (fs.existsSync(MERCHANT_TRANSACTIONS_FILE)) {
      const merchantTransactions = JSON.parse(fs.readFileSync(MERCHANT_TRANSACTIONS_FILE, 'utf8'));
      db.serialize(() => {
        // Clear existing data first
        db.run('DELETE FROM merchant_transactions');
        
        if (merchantTransactions.length > 0) {
          const stmt = db.prepare(`INSERT INTO merchant_transactions 
            (txId, txHash, address, amount, ethAmount, expectedAmount, timestamp, status, type, 
             cryptoType, amountVerified, from_address, to_address, gasUsed, gasPrice, completedAt, lastUpdated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          merchantTransactions.forEach(tx => {
            stmt.run(
              tx.txId || null,
              tx.txHash || null,
              tx.address || null,
              tx.amount || null,
              tx.ethAmount || null,
              tx.expectedAmount || null,
              tx.timestamp || null,
              typeof tx.status === 'boolean' ? (tx.status ? 'true' : 'false') : tx.status,
              tx.type || null,
              tx.cryptoType || null,
              tx.amountVerified ? 1 : 0,
              tx.from || null,
              tx.to || null,
              tx.gasUsed || null,
              tx.gasPrice || null,
              tx.completedAt || null,
              tx.lastUpdated || null
            );
          });
          
          stmt.finalize();
        }
      });
      console.log('Synced merchant transactions');
    } else {
      console.log('Merchant transactions file not found, skipping sync');
    }

    // Sync stripe payments
    if (fs.existsSync(STRIPE_PAYMENTS_FILE)) {
      const stripePayments = JSON.parse(fs.readFileSync(STRIPE_PAYMENTS_FILE, 'utf8'));
      db.serialize(() => {
        // Clear existing data first
        db.run('DELETE FROM stripe_transactions');
        
        if (stripePayments.payments && stripePayments.payments.length > 0) {
          const stmt = db.prepare(`INSERT INTO stripe_transactions 
            (id, orderId, amount, currency, status, timestamp, paymentMethod, customerEmail, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          
          stripePayments.payments.forEach(payment => {
            stmt.run(
              payment.id,
              payment.orderId || null,
              payment.amount || null,
              payment.currency || null,
              payment.status || null,
              payment.timestamp || null,
              payment.paymentMethod || null,
              payment.customerEmail || null,
              payment.metadata ? JSON.stringify(payment.metadata) : null
            );
          });
          
          stmt.finalize();
        }
      });
      console.log('Synced stripe payments');
    } else {
      console.log('Stripe payments file not found, skipping sync');
    }

    console.log('Sync from JSON to SQLite completed successfully');
    return true;
  } catch (error) {
    console.error('Error syncing JSON to SQLite:', error);
    return false;
  }
}

/**
 * Sync from SQLite to JSON
 * Reads from the SQLite database and updates the JSON files
 */
async function syncDbToJson() {
  try {
    console.log('Starting sync from SQLite to JSON...');
    
    // Sync transactions to keys.json (activeAddresses)
    const transactionsPromise = new Promise((resolve, reject) => {
      db.all('SELECT * FROM transactions', (err, rows) => {
        if (err) return reject(err);
        
        try {
          // Read existing keys.json to preserve sensitive data
          let keysData = {};
          if (fs.existsSync(KEYS_FILE)) {
            keysData = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
          }
          
          // Update only activeAddresses
          const activeAddresses = {};
          
          rows.forEach(row => {
            activeAddresses[row.address] = {
              index: row.addr_index,
              ethAmount: row.ethAmount,
              expectedAmount: row.expectedAmount,
              cryptoType: row.cryptoType,
              createdAt: row.createdAt,
              expiresAt: row.expiresAt,
              status: row.status,
              orderId: row.orderId,
              fiatAmount: row.fiatAmount,
              fiatCurrency: row.fiatCurrency,
              amount: row.amount,
              timestamp: row.timestamp,
              amountVerified: row.amountVerified === 1
            };
          });
          
          // Preserve sensitive data, only update activeAddresses
          keysData.activeAddresses = activeAddresses;
          fs.writeFileSync(KEYS_FILE, JSON.stringify(keysData, null, 2), 'utf8');
          console.log('Updated keys.json with active addresses');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    // Sync merchant transactions
    const merchantTransactionsPromise = new Promise((resolve, reject) => {
      db.all('SELECT * FROM merchant_transactions', (err, rows) => {
        if (err) return reject(err);
        
        try {
          const transactions = rows.map(row => {
            // Convert SQLite string boolean back to JavaScript boolean
            const isStringBoolean = (value) => value === 'true' || value === 'false';
            
            return {
              txId: row.txId,
              txHash: row.txHash,
              address: row.address,
              amount: row.amount,
              ethAmount: row.ethAmount,
              expectedAmount: row.expectedAmount,
              timestamp: row.timestamp,
              status: isStringBoolean(row.status) ? row.status === 'true' : row.status,
              type: row.type,
              cryptoType: row.cryptoType,
              amountVerified: row.amountVerified === 1,
              from: row.from_address,
              to: row.to_address,
              gasUsed: row.gasUsed,
              gasPrice: row.gasPrice,
              completedAt: row.completedAt,
              lastUpdated: row.lastUpdated
            };
          });
          
          fs.writeFileSync(MERCHANT_TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), 'utf8');
          console.log('Updated merchant_transactions.json');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    // Sync stripe payments
    const stripePaymentsPromise = new Promise((resolve, reject) => {
      db.all('SELECT * FROM stripe_transactions', (err, rows) => {
        if (err) return reject(err);
        
        try {
          const payments = rows.map(row => {
            return {
              id: row.id,
              orderId: row.orderId,
              amount: row.amount,
              currency: row.currency,
              status: row.status,
              timestamp: row.timestamp,
              paymentMethod: row.paymentMethod,
              customerEmail: row.customerEmail,
              metadata: row.metadata ? JSON.parse(row.metadata) : null
            };
          });
          
          fs.writeFileSync(STRIPE_PAYMENTS_FILE, JSON.stringify({ payments }, null, 2), 'utf8');
          console.log('Updated stripe_payments.json');
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    await Promise.all([transactionsPromise, merchantTransactionsPromise, stripePaymentsPromise]);
    console.log('Sync from SQLite to JSON completed successfully');
    return true;
  } catch (error) {
    console.error('Error syncing SQLite to JSON:', error);
    return false;
  }
}

/**
 * Watch for file changes and trigger sync
 */
function setupFileWatchers() {
  const watcher = chokidar.watch(
    [KEYS_FILE, MERCHANT_TRANSACTIONS_FILE, STRIPE_PAYMENTS_FILE],
    {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,  // Wait 300ms after last change
        pollInterval: 100         // Poll every 100ms
      }
    }
  );

  watcher.on('change', (filePath) => {
    console.log(`File change detected: ${filePath}`);
    syncJsonToDb().catch(err => console.error('Error during file change sync:', err));
  });

  console.log('File watchers set up for JSON files');
}

module.exports = {
  syncJsonToDb,
  syncDbToJson,
  setupFileWatchers
}; 