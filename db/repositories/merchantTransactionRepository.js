const { db } = require('../index');

/**
 * Repository for handling merchant transactions
 */
class MerchantTransactionRepository {
  /**
   * Get all merchant transactions
   * @returns {Promise<Array>} Array of merchant transactions
   */
  static getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM merchant_transactions', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Get transaction by transaction ID
   * @param {string} txId - Transaction ID
   * @returns {Promise<Object>} Transaction object
   */
  static getByTxId(txId) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM merchant_transactions WHERE txId = ?', [txId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  /**
   * Get transactions by address
   * @param {string} address - Wallet address
   * @returns {Promise<Array>} Array of transaction objects
   */
  static getByAddress(address) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM merchant_transactions WHERE address = ?', [address], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Add a new merchant transaction
   * @param {Object} transaction - Transaction data
   * @returns {Promise<string>} ID of added transaction
   */
  static add(transaction) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`INSERT INTO merchant_transactions 
        (txId, txHash, address, amount, ethAmount, expectedAmount, timestamp, status, type, 
         cryptoType, amountVerified, from_address, to_address, gasUsed, gasPrice, completedAt, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      stmt.run(
        transaction.txId || null,
        transaction.txHash || null,
        transaction.address || null,
        transaction.amount || null,
        transaction.ethAmount || null,
        transaction.expectedAmount || null,
        transaction.timestamp || null,
        typeof transaction.status === 'boolean' ? (transaction.status ? 'true' : 'false') : transaction.status,
        transaction.type || null,
        transaction.cryptoType || null,
        transaction.amountVerified ? 1 : 0,
        transaction.from || null,
        transaction.to || null,
        transaction.gasUsed || null,
        transaction.gasPrice || null,
        transaction.completedAt || null,
        transaction.lastUpdated || null,
        function(err) {
          if (err) return reject(err);
          resolve(transaction.txId);
        }
      );
      
      stmt.finalize();
    });
  }

  /**
   * Update a merchant transaction
   * @param {string} txId - Transaction ID
   * @param {Object} transaction - Updated transaction data
   * @returns {Promise<number>} Number of rows affected
   */
  static update(txId, transaction) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE merchant_transactions SET
          txHash = ?,
          address = ?,
          amount = ?,
          ethAmount = ?,
          expectedAmount = ?,
          timestamp = ?,
          status = ?,
          type = ?,
          cryptoType = ?,
          amountVerified = ?,
          from_address = ?,
          to_address = ?,
          gasUsed = ?,
          gasPrice = ?,
          completedAt = ?,
          lastUpdated = ?
        WHERE txId = ?`,
        [
          transaction.txHash || null,
          transaction.address || null,
          transaction.amount || null,
          transaction.ethAmount || null,
          transaction.expectedAmount || null,
          transaction.timestamp || null,
          typeof transaction.status === 'boolean' ? (transaction.status ? 'true' : 'false') : transaction.status,
          transaction.type || null,
          transaction.cryptoType || null,
          transaction.amountVerified ? 1 : 0,
          transaction.from || null,
          transaction.to || null,
          transaction.gasUsed || null,
          transaction.gasPrice || null,
          transaction.completedAt || null,
          transaction.lastUpdated || null,
          txId
        ],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  /**
   * Delete a merchant transaction
   * @param {string} txId - Transaction ID
   * @returns {Promise<number>} Number of rows affected
   */
  static delete(txId) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM merchant_transactions WHERE txId = ?', [txId], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }
}

module.exports = MerchantTransactionRepository; 