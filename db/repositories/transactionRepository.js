const { db } = require('../index');

/**
 * Repository for handling transactions from activeAddresses in keys.json
 */
class TransactionRepository {
  /**
   * Get all transactions
   * @returns {Promise<Array>} Array of transaction objects
   */
  static getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM transactions', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  /**
   * Get transaction by address
   * @param {string} address - Wallet address
   * @returns {Promise<Object>} Transaction object
   */
  static getByAddress(address) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM transactions WHERE address = ?', [address], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  /**
   * Add a new transaction
   * @param {Object} transaction - Transaction data
   * @returns {Promise<string>} Address of added transaction
   */
  static add(transaction) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      stmt.run(
        transaction.address,
        transaction.index,
        transaction.ethAmount,
        transaction.expectedAmount,
        transaction.cryptoType,
        transaction.createdAt,
        transaction.expiresAt,
        transaction.status,
        transaction.orderId,
        transaction.fiatAmount,
        transaction.fiatCurrency,
        transaction.amount,
        transaction.timestamp,
        transaction.amountVerified ? 1 : 0,
        function(err) {
          if (err) return reject(err);
          resolve(transaction.address);
        }
      );
      
      stmt.finalize();
    });
  }

  /**
   * Update a transaction
   * @param {string} address - Wallet address
   * @param {Object} transaction - Updated transaction data
   * @returns {Promise<number>} Number of rows affected
   */
  static update(address, transaction) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE transactions SET
          addr_index = ?,
          ethAmount = ?,
          expectedAmount = ?,
          cryptoType = ?,
          createdAt = ?,
          expiresAt = ?,
          status = ?,
          orderId = ?,
          fiatAmount = ?,
          fiatCurrency = ?,
          amount = ?,
          timestamp = ?,
          amountVerified = ?
        WHERE address = ?`,
        [
          transaction.index,
          transaction.ethAmount,
          transaction.expectedAmount,
          transaction.cryptoType,
          transaction.createdAt,
          transaction.expiresAt,
          transaction.status,
          transaction.orderId,
          transaction.fiatAmount,
          transaction.fiatCurrency,
          transaction.amount,
          transaction.timestamp,
          transaction.amountVerified ? 1 : 0,
          address
        ],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  /**
   * Delete a transaction
   * @param {string} address - Wallet address
   * @returns {Promise<number>} Number of rows affected
   */
  static delete(address) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM transactions WHERE address = ?', [address], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });
  }
}

module.exports = TransactionRepository; 